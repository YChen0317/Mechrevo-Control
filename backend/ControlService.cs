using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Pipes;
using System.Management;
using Microsoft.Management.Infrastructure;
using System.Security.AccessControl;
using System.Security.Principal;
using System.ServiceProcess;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal sealed class ControlService : ServiceBase
{
    const string Pipe = "Mechrevo.Control.v1";
    static readonly Encoding Utf8 = new UTF8Encoding(false, true);
    static readonly string Instance = Guid.NewGuid().ToString();
    static readonly object Gate = new object();
    static long revision;
    static Dictionary<string,object> snapshot;
    static volatile bool stopping;
    static NamedPipeServerStream pending;
    static string Json(object obj) { return new JavaScriptSerializer().Serialize(obj); }
    static object Get(Dictionary<string,object> row,string key) {
        object value; return row.TryGetValue(key,out value) ? value : null;
    }
    static string ReadMode() {
        const string wmiNamespace = "root/wmi";
        using(var session = CimSession.Create(null))
        using(var options = new Microsoft.Management.Infrastructure.Options.CimOperationOptions {
            Timeout = TimeSpan.FromSeconds(3)
        }) {
            foreach(var row in session.QueryInstances(wmiNamespace, "WQL",
                    "SELECT * FROM EmdAcpi_PowerPlanMode WHERE Active=TRUE", options)) using(row)
            using(var parameters = new CimMethodParametersCollection()) {
                parameters.Add(CimMethodParameter.Create("Data", 0UL, Microsoft.Management.Infrastructure.CimType.UInt64, CimFlags.In));
                using(var output = session.InvokeMethod(wmiNamespace, row, "GetPowerPlanMode", parameters, options)) {
                    if(!Convert.ToBoolean(output.ReturnValue.Value))
                        throw new InvalidOperationException("Firmware getter returned failure.");
                    ulong data = Convert.ToUInt64(output.OutParameters["Data"].Value);
                    ulong mode = (data >> 16) & 255;
                    if((data & 255) == 0 && mode == 1) return "balanced";
                    if((data & 255) == 0 && mode == 2) return "performance";
                    throw new InvalidOperationException("Unexpected firmware getter data: " + data);
                }
            }
        }
        throw new InvalidOperationException("No active EmdAcpi_PowerPlanMode instance.");
    }

    static object First(string cls,string field) {
        using(var q = new ManagementObjectSearcher("SELECT "+field+" FROM "+cls))
        using(var rows=q.Get()) foreach(ManagementObject row in rows) using(row) return row[field];
        return null;
    }
    static object Try(Func<object> read) { try {return read();} catch(Exception) {return null;} }
    static void Sample() {
        object model=Try(()=>First("Win32_ComputerSystem","Model"));
        while(!stopping) {
            var power=SystemInformation.PowerStatus;
            var flag=power.BatteryChargeStatus;
            bool battery=flag!=BatteryChargeStatus.Unknown && (flag & BatteryChargeStatus.NoSystemBattery)==0;
            var percent=power.BatteryLifePercent;
            string mode = null, modeError = null;
            try {mode = ReadMode();} catch(Exception ex) {modeError = ex.Message;}
            var row=new Dictionary<string,object> {
                {"serviceVersion","0.1.1"},{"instanceId",Instance},{"revision",++revision},{"model",model},{"mode",mode},{"modeError",modeError},
                {"ac",power.PowerLineStatus==PowerLineStatus.Unknown ? null : (object)(power.PowerLineStatus==PowerLineStatus.Online)},
                {"batteryPercent",battery && percent>=0 && percent<=1 ? (object)Math.Round(percent*100) : null},
                {"charging",battery ? (object)((flag & BatteryChargeStatus.Charging)!=0) : null},
                {"packageW",null},{"cpuMHz",Try(()=>First("Win32_Processor","CurrentClockSpeed"))},
                {"timestamp",DateTime.UtcNow.ToString("o")}
            };
            lock(Gate) {snapshot=row;Monitor.PulseAll(Gate);}
            Thread.Sleep(2000);
        }
    }
    static object Cap(object value,bool writable,string[] values,string reason) {
        return new {readable=value!=null,writable,values,reason};
    }
    static void Serve(NamedPipeServerStream pipe) {
        using(pipe) try {
            using(var writer=new StreamWriter(pipe,Utf8,1024,true){AutoFlush=true}) {
                while(pipe.IsConnected && !stopping) {
                    var bytes=new List<byte>();
                    int b;
                    while((b=pipe.ReadByte())>=0 && b!=10 && bytes.Count<=4096) bytes.Add((byte)b);
                    if(b<0 || bytes.Count>4096) return;
                    var req=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(Utf8.GetString(bytes.ToArray()));
                    string id=Get(req,"requestId") as string, method=Get(req,"method") as string;
                    Dictionary<string,object> row;
                    lock(Gate) row=snapshot;
                    string error=null,message=null;
                    object result=null;
                    if(string.IsNullOrEmpty(id)||id.Length>128) error="InvalidRequest";
                    else if(!object.Equals(Get(req,"v"),1)) error="VersionMismatch";
                    else if(method=="setPerformanceMode") {
                        var mode=Get(req,"mode") as string;
                        error=mode=="balanced"||mode=="performance" ? "CapabilityUnavailable" : "InvalidRequest";
                        message="Firmware setter has not been verified.";
                    }
                    else if(method=="subscribeHotkey") error="CapabilityUnavailable";
                    else if(row==null) error="Busy";
                    else if(method=="getSnapshot") result=row;
                    else if(method=="getCapabilities") {
                        var caps=new Dictionary<string,object>();
                        foreach(var field in new[]{"mode","ac","batteryPercent","charging","packageW","cpuMHz"})
                            caps[field]=Cap(row[field],false,field=="mode"?new[]{"balanced","performance"}:new string[0],
                                field=="mode"?(row["modeError"] as string ?? "Firmware writes unverified"):row[field]==null?"Reading unavailable":null);
                        result=caps;
                    }
                    else if(method=="subscribeStatus") result=new {subscribed=true};
                    else error="InvalidRequest";
                    if(error!=null) writer.WriteLine(Json(new {v=1,requestId=id,error=new {code=error,message=message??error}}));
                    else writer.WriteLine(Json(new {v=1,requestId=id,result}));
                    if(method=="subscribeStatus" && error==null) {
                        long seen=0;
                        while(!stopping) {
                            lock(Gate) {
                                while(!stopping && (long)snapshot["revision"]<=seen) Monitor.Wait(Gate,3000);
                                row=snapshot;
                            }
                            seen=(long)row["revision"];
                            writer.WriteLine(Json(new {v=1,@event="status",instanceId=Instance,revision=seen,data=row}));
                        }
                        return;
                    }
                }
            }
        } catch(Exception ex) {System.Diagnostics.Trace.WriteLine(ex);}
    }
    static void Listen() {
        var acl=new PipeSecurity();
        acl.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(WellKnownSidType.NetworkSid,null),PipeAccessRights.FullControl,AccessControlType.Deny));
        foreach(var sid in new[]{WellKnownSidType.LocalSystemSid,WellKnownSidType.InteractiveSid}) {
            var rights=sid==WellKnownSidType.LocalSystemSid?PipeAccessRights.FullControl:(PipeAccessRights.ReadWrite|PipeAccessRights.Synchronize);
            acl.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(sid,null),rights,AccessControlType.Allow));
        }
        while(!stopping) try {
            var pipe=new NamedPipeServerStream(Pipe,PipeDirection.InOut,32,PipeTransmissionMode.Byte,PipeOptions.None,4096,4096,acl);
            lock(Gate) {if(stopping){pipe.Dispose();return;}pending=pipe;}
            pipe.WaitForConnection();
            lock(Gate) pending=null;
            ThreadPool.QueueUserWorkItem(_=>Serve(pipe));
        } catch(IOException){Thread.Sleep(200);} catch(ObjectDisposedException){return;}
    }
    protected override void OnStart(string[] args) {
        stopping=false;
        new Thread(Sample){IsBackground=true}.Start();
        new Thread(Listen){IsBackground=true}.Start();
    }
    protected override void OnStop() {
        lock(Gate) {stopping=true;if(pending!=null) pending.Dispose();Monitor.PulseAll(Gate);}
    }
    static void Main(string[] args) {
        if(args.Length==1 && args[0]=="service") {
            ServiceBase.Run(new ControlService{ServiceName="MechrevoControl"});return;
        }
        var log=new StringBuilder();
        try {
            using(var svc=new ServiceController("MechrevoControl")) log.AppendLine("Service: "+svc.Status);
            using(var pipe=new NamedPipeClientStream(".",Pipe,PipeAccessRights.ReadWrite | PipeAccessRights.Synchronize,PipeOptions.Asynchronous,TokenImpersonationLevel.Identification,HandleInheritability.None)) {
                pipe.Connect(4000);
                using(var reader=new StreamReader(pipe,Utf8,false,4096,true))
                using(var writer=new StreamWriter(pipe,Utf8,4096,true){AutoFlush=true})
                foreach(var method in new[]{"getCapabilities","getSnapshot"}) {
                    writer.WriteLine(Json(new {v=1,requestId=method,method}));
                    var reply=reader.ReadLineAsync();
                    if(!reply.Wait(6000)) throw new System.TimeoutException(method);
                    log.AppendLine(method+" "+reply.Result);
                }
            }
        } catch(Exception ex) {log.AppendLine(ex.GetBaseException().Message);}
        try {log.AppendLine("Independent CIM root/wmi (current user): "+(ReadMode()??"unknown"));}
        catch(Exception ex){log.AppendLine("Independent CIM unavailable under current user: "+ex.Message);}
        log.Insert(0,"MechrevoCheck 0.1.1 | IPC v1"+Environment.NewLine);
        Console.WriteLine(log);
        Console.WriteLine("Enter = exit, S = save report on Desktop");
        if(string.Equals(Console.ReadLine(),"s",StringComparison.OrdinalIgnoreCase)) {
            var path=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),"Mechrevo-"+DateTime.Now.ToString("yyyyMMdd-HHmmss")+".txt");
            File.WriteAllText(path,log.ToString(),Utf8);Console.WriteLine(path);
        }
    }
}
