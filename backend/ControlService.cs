using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.IO;
using System.IO.Pipes;
using System.Management;
using System.Runtime.InteropServices;
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
    const string Version = "0.3.0";
    const string VerifiedBios = "WUJIE14Max_Dove4_LNL326_MC_OLED_Rev05";
    static readonly object DeviceGate = new object();
    static volatile bool verifiedBios;
    static volatile bool biosChecked;
    static readonly object HotkeyGate = new object();
    static readonly List<BlockingCollection<HotkeyNotice>> HotkeyClients = new List<BlockingCollection<HotkeyNotice>>();
    static volatile bool hotkeysReady;
    static long hotkeyRevision;

    sealed class HotkeyNotice {
        public long Revision;
        public object Data;
    }

    static void OnFirmwareEvent(object sender, EventArrivedEventArgs evt) {
        uint code;
        using(var row = evt.NewEvent) {
            try { code = Convert.ToUInt32(row["Force"]); }
            catch(ManagementException) { return; }
            catch(InvalidCastException) { return; }
            catch(OverflowException) { return; }
        }
        string action, state;
        switch(code) {
            case 0x20: action = "keyboardBacklight"; state = "off"; break;
            case 0x21: action = "keyboardBacklight"; state = "low"; break;
            case 0x22: action = "keyboardBacklight"; state = "high"; break;
            case 0x30: action = "touchpad"; state = "off"; break;
            case 0x31: action = "touchpad"; state = "on"; break;
            case 0x41: action = "performanceMode"; state = "balanced"; break;
            case 0x42: action = "performanceMode"; state = "performance"; break;
            case 0x50: action = "fnLock"; state = "off"; break;
            case 0x51: action = "fnLock"; state = "on"; break;
            case 0xA1: action = "microphoneMute"; state = null; break;
            case 0xA2: action = "refreshRate"; state = null; break;
            default: return;
        }
        lock(HotkeyGate) {
            long sequence = ++hotkeyRevision;
            var notice = new HotkeyNotice {
                Revision = sequence,
                Data = new {id = Instance + ":" + sequence, timestamp = DateTime.UtcNow.ToString("o"), action, state, code}
            };
            foreach(var client in HotkeyClients) client.TryAdd(notice);
        }
    }

    static void ListenHotkeys() {
        while(!stopping && !verifiedBios) {
            if(biosChecked) return;
            Thread.Sleep(250);
        }
        while(!stopping) {
            {
                var ended = new object();
                bool wasStopped = false;
                try {
                    using(var watcher = new ManagementEventWatcher(@"root\wmi", "SELECT * FROM OemWMIEvent")) {
                        watcher.EventArrived += OnFirmwareEvent;
                        watcher.Stopped += (_, args) => {
                            lock(ended) { wasStopped = true; Monitor.PulseAll(ended); }
                        };
                        watcher.Start();
                        lock(ended) {
                            hotkeysReady = !wasStopped;
                            while(!stopping && !wasStopped) Monitor.Wait(ended, 500);
                            hotkeysReady = false;
                        }
                    }
                } catch(Exception ex) {
                    hotkeysReady = false;
                    System.Diagnostics.Trace.WriteLine(ex);
                }
            }
            if(!stopping) Thread.Sleep(3000);
        }
    }

    static void StreamHotkeys(StreamWriter writer, string requestId) {
        using(var events = new BlockingCollection<HotkeyNotice>(32)) {
            lock(HotkeyGate) HotkeyClients.Add(events);
            try {
                writer.WriteLine(Json(new {v = 1, requestId, result = new {subscribed = true}}));
                while(!stopping) {
                    HotkeyNotice notice;
                    if(events.TryTake(out notice, 8000))
                        writer.WriteLine(Json(new {v = 1, @event = "hotkey", instanceId = Instance,
                            revision = notice.Revision, data = notice.Data}));
                    else {
                        writer.WriteLine(Json(new {v = 1, @event = "hotkeyHeartbeat", instanceId = Instance,
                            revision = Interlocked.Read(ref hotkeyRevision), data = new {available = hotkeysReady}}));
                        if(!hotkeysReady) return;
                    }
                }
            } finally {
                lock(HotkeyGate) HotkeyClients.Remove(events);
            }
        }
    }

    static readonly object Gate = new object();
    static long revision;
    static Dictionary<string,object> snapshot;
    static volatile bool stopping;
    static NamedPipeServerStream pending;
    static string Json(object obj) { return new JavaScriptSerializer().Serialize(obj); }
    static object Get(Dictionary<string,object> row,string key) {
        object value; return row.TryGetValue(key,out value) ? value : null;
    }
    static ulong InvokeMode(string method, ulong input) {
        const string wmiNamespace = "root/wmi";
        using(var session = CimSession.Create(null))
        using(var options = new Microsoft.Management.Infrastructure.Options.CimOperationOptions {
            Timeout = TimeSpan.FromSeconds(3)
        }) {
            foreach(var row in session.QueryInstances(wmiNamespace, "WQL",
                    "SELECT * FROM EmdAcpi_PowerPlanMode WHERE Active=TRUE", options)) using(row)
            using(var parameters = new CimMethodParametersCollection()) {
                parameters.Add(CimMethodParameter.Create("Data", input, Microsoft.Management.Infrastructure.CimType.UInt64, CimFlags.In));
                using(var output = session.InvokeMethod(wmiNamespace, row, method, parameters, options)) {
                    if(!Convert.ToBoolean(output.ReturnValue.Value))
                        throw new InvalidOperationException(method + " returned failure.");
                    ulong data = Convert.ToUInt64(output.OutParameters["Data"].Value);
                    if((data & 255) != 0)
                        throw new InvalidOperationException(method + " reported firmware status " + (data & 255));
                    return data;
                }
            }
        }
        throw new InvalidOperationException("No active EmdAcpi_PowerPlanMode instance.");
    }

    static string ReadMode() {
        ulong data = InvokeMode("GetPowerPlanMode", 0);
        ulong mode = (data >> 16) & 255;
        if(mode == 1) return "balanced";
        if(mode == 2) return "performance";
        throw new InvalidOperationException("Unexpected firmware getter data: " + data);
    }

    static bool IsInteractiveClient(NamedPipeServerStream pipe) {
        bool allowed = false;
        try {
            pipe.RunAsClient(() => {
                using(var identity = WindowsIdentity.GetCurrent(true)) {
                    if(identity != null)
                        allowed = new WindowsPrincipal(identity).IsInRole(
                            new SecurityIdentifier(WellKnownSidType.InteractiveSid, null));
                }
            });
        } catch(Exception ex) { System.Diagnostics.Trace.WriteLine(ex); }
        return allowed;
    }

    static void ChangeMode(NamedPipeServerStream pipe, string target, out string error,
            out string message, out object result) {
        error = null;
        message = null;
        result = null;
        if(target != "balanced" && target != "performance") { error = "InvalidRequest"; return; }
        if(!IsInteractiveClient(pipe)) { error = "AccessDenied"; return; }
        if(!verifiedBios) {
            error = "CapabilityUnavailable";
            message = "Firmware writes require the verified Dove4 Rev05 BIOS.";
            return;
        }
        if(!Monitor.TryEnter(DeviceGate, 1000)) { error = "Busy"; return; }
        try {
            string initial;
            try { initial = ReadMode(); }
            catch(Exception ex) { error = "CapabilityUnavailable"; message = ex.Message; return; }
            if(initial == target) { result = new {mode = initial}; return; }

            string setterError = null;
            try { InvokeMode("SetPowerPlanMode", target == "balanced" ? 1UL : 3UL); }
            catch(Exception ex) { setterError = ex.Message; }

            string observed = null, readError = null;
            for(int attempt = 0; attempt < 3; attempt++) {
                try {
                    observed = ReadMode();
                    readError = null;
                    if(observed == target) break;
                } catch(Exception ex) { readError = ex.Message; }
                if(attempt < 2) Thread.Sleep(250);
            }
            lock(Gate) {
                if(snapshot != null) {
                    snapshot = new Dictionary<string, object>(snapshot);
                    snapshot["mode"] = observed;
                    snapshot["modeError"] = observed == null ? readError : null;
                    snapshot["revision"] = ++revision;
                    snapshot["timestamp"] = DateTime.UtcNow.ToString("o");
                    Monitor.PulseAll(Gate);
                }
            }
            if(observed == target) result = new {mode = observed};
            else {
                error = observed == null ? "Timeout" : "ReadbackMismatch";
                message = "Requested " + target + ", read back " + (observed ?? "unknown") + ".";
                if(setterError != null) message += " " + setterError;
                if(readError != null) message += " " + readError;
            }
        } finally { Monitor.Exit(DeviceGate); }
    }

    static object First(string cls,string field) {
        using(var q = new ManagementObjectSearcher("SELECT "+field+" FROM "+cls))
        using(var rows=q.Get()) foreach(ManagementObject row in rows) using(row) return row[field];
        return null;
    }
    static object Try(Func<object> read) { try {return read();} catch(Exception) {return null;} }
    static void Sample() {
        using(var packagePower = new PackagePowerCounter()) Sample(packagePower);
    }

    static void Sample(PackagePowerCounter packagePower) {
        object model=Try(()=>First("Win32_ComputerSystem","Model"));
        verifiedBios = string.Equals(Try(()=>First("Win32_BIOS","SMBIOSBIOSVersion")) as string, VerifiedBios, StringComparison.Ordinal);
        biosChecked = true;
        while(!stopping) {
            var power=SystemInformation.PowerStatus;
            var flag=power.BatteryChargeStatus;
            bool battery=flag!=BatteryChargeStatus.Unknown && (flag & BatteryChargeStatus.NoSystemBattery)==0;
            var percent=power.BatteryLifePercent;
            object packageW = Try(() => packagePower.ReadWatts());
            object cpuMHz = Try(()=>First("Win32_Processor","CurrentClockSpeed"));
            lock(DeviceGate) {
                string mode = null, modeError = null;
                try {mode = ReadMode();} catch(Exception ex) {modeError = ex.Message;}
                var row=new Dictionary<string,object> {
                    {"serviceVersion",Version},{"instanceId",Instance},{"revision",++revision},{"model",model},{"mode",mode},{"modeError",modeError},
                    {"ac",power.PowerLineStatus==PowerLineStatus.Unknown ? null : (object)(power.PowerLineStatus==PowerLineStatus.Online)},
                    {"batteryPercent",battery && percent>=0 && percent<=1 ? (object)Math.Round(percent*100) : null},
                    {"charging",battery ? (object)((flag & BatteryChargeStatus.Charging)!=0) : null},
                    {"packageW",packageW},{"cpuMHz",cpuMHz},
                    {"timestamp",DateTime.UtcNow.ToString("o")}
                };
                lock(Gate) {snapshot=row;Monitor.PulseAll(Gate);}
            }
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
                    else if(method=="setPerformanceMode")
                        ChangeMode(pipe, Get(req,"mode") as string, out error, out message, out result);
                    else if(method=="subscribeHotkey") {
                        if(hotkeysReady) { StreamHotkeys(writer, id); return; }
                        error = "CapabilityUnavailable";
                        message = "OEM hotkey event source is not available.";
                    }
                    else if(row==null) error="Busy";
                    else if(method=="getSnapshot") result=row;
                    else if(method=="getCapabilities") {
                        var caps=new Dictionary<string,object>();
                        foreach(var field in new[]{"mode","ac","batteryPercent","charging","packageW","cpuMHz"})
                            caps[field]=Cap(row[field],field=="mode" && verifiedBios && row[field]!=null,
                                field=="mode"?new[]{"balanced","performance"}:new string[0],
                                field=="mode"?(row["modeError"] as string ?? (verifiedBios ? null : "Firmware writes require Dove4 Rev05"))
                                    :row[field]==null?"Reading unavailable":null);
                        caps["hotkeys"] = new {readable = hotkeysReady, writable = false,
                            values = new string[0], reason = hotkeysReady ? null : "OEM hotkey event source unavailable"};
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
        new Thread(ListenHotkeys){IsBackground=true}.Start();
    }
    protected override void OnStop() {
        lock(Gate) {stopping=true;if(pending!=null) pending.Dispose();Monitor.PulseAll(Gate);}
    }
    static Dictionary<string, object> Request(string method, string mode, StringBuilder log) {
        string id = Guid.NewGuid().ToString("N");
        using(var pipe = new NamedPipeClientStream(".", Pipe, PipeAccessRights.ReadWrite | PipeAccessRights.Synchronize,
                PipeOptions.Asynchronous, TokenImpersonationLevel.Identification, HandleInheritability.None)) {
            pipe.Connect(4000);
            using(var reader = new StreamReader(pipe, Utf8, false, 4096, true))
            using(var writer = new StreamWriter(pipe, Utf8, 4096, true) {AutoFlush = true}) {
                writer.WriteLine(Json(new {v = 1, requestId = id, method, mode}));
                var reply = reader.ReadLineAsync();
                if(!reply.Wait(32000) || reply.Result == null)
                    throw new IOException(method + " outcome unknown. The request will not be retried.");
                log.AppendLine(method + " " + reply.Result);
                var response = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(reply.Result);
                if(!object.Equals(Get(response, "v"), 1) || !object.Equals(Get(response, "requestId"), id))
                    throw new IOException("Unexpected service response.");
                var result = Get(response, "result") as Dictionary<string, object>;
                if(result == null) throw new IOException(method + " failed. See the response above.");
                return result;
            }
        }
    }

    static string ReportedMode(string method, string target, StringBuilder log) {
        var mode = Get(Request(method, target, log), "mode") as string;
        if(mode != "balanced" && mode != "performance") throw new IOException("Unknown hardware mode.");
        return mode;
    }

    static void CheckSwitch(StringBuilder log) {
        Console.WriteLine("Connect AC, close the OEM control center window, and type SWITCH to test and restore the firmware mode.");
        if(Console.ReadLine() != "SWITCH") { log.AppendLine("Cancelled."); return; }
        string initial = null;
        bool attempted = false, confirmed = false, restored = false;
        try {
            initial = ReportedMode("getSnapshot", null, log);
            string target = initial == "balanced" ? "performance" : "balanced";
            log.AppendLine("Starting mode: " + initial + "; test target: " + target);
            attempted = true;
            if(ReportedMode("setPerformanceMode", target, log) != target)
                throw new IOException("Alternate mode did not match.");
            confirmed = true;
        } catch(Exception ex) { log.AppendLine(ex.GetBaseException().Message); }
        finally {
            if(attempted) {
                try {
                    Thread.Sleep(2000);
                    string current = ReportedMode("getSnapshot", null, log);
                    if(current != initial) current = ReportedMode("setPerformanceMode", initial, log);
                    restored = current == initial;
                } catch(Exception ex) { log.AppendLine(ex.GetBaseException().Message); }
                log.AppendLine(restored ? "Original mode confirmed: " + initial
                    : "RESTORE NOT CONFIRMED. Use the OEM control center to restore " + initial + ".");
            }
        }
        log.AppendLine("Service switch test passed=" + (confirmed && restored));
    }

    static void Main(string[] args) {
        if(args.Length==1 && args[0]=="service") {
            ServiceBase.Run(new ControlService{ServiceName="MechrevoControl"});return;
        }
        var log=new StringBuilder();
        if(args.Length == 1 && args[0] == "--switch-test") CheckSwitch(log);
        else try {
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
        log.Insert(0,"MechrevoCheck " + Version + " | IPC v1"+Environment.NewLine);
        Console.WriteLine(log);
        Console.WriteLine("Enter = exit, S = save report on Desktop");
        if(string.Equals(Console.ReadLine(),"s",StringComparison.OrdinalIgnoreCase)) {
            var path=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),"Mechrevo-"+DateTime.Now.ToString("yyyyMMdd-HHmmss")+".txt");
            File.WriteAllText(path,log.ToString(),Utf8);Console.WriteLine(path);
        }
    }
}

internal sealed class PackagePowerCounter : IDisposable
{
    const string CounterPath = @"\Energy Meter(RAPL_Package0_PKG)\Power";
    const uint DoubleWithoutCap = 0x00000200 | 0x00008000;

    IntPtr query;
    IntPtr counter;
    bool primed;

    internal double? ReadWatts() {
        if(query == IntPtr.Zero) {
            if(PdhOpenQueryW(null, UIntPtr.Zero, out query) != 0)
                return null;
            if(PdhAddEnglishCounterW(query, CounterPath, UIntPtr.Zero, out counter) != 0) {
                Dispose();
                return null;
            }
        }

        if(PdhCollectQueryData(query) != 0) {
            Dispose();
            return null;
        }
        // AverageCount64 needs two collected samples to report power.
        if(!primed) {
            primed = true;
            return null;
        }

        CounterValue value;
        if(PdhGetFormattedCounterValue(counter, DoubleWithoutCap, IntPtr.Zero, out value) != 0 ||
                value.Status > 1 || double.IsNaN(value.Value) || double.IsInfinity(value.Value) || value.Value < 0) {
            Dispose();
            return null;
        }
        return value.Value / 1000d;
    }

    public void Dispose() {
        if(query != IntPtr.Zero) PdhCloseQuery(query);
        query = counter = IntPtr.Zero;
        primed = false;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct CounterValue {
        internal uint Status;
        internal double Value;
    }

    [DllImport("pdh.dll", ExactSpelling = true, CharSet = CharSet.Unicode)]
    static extern uint PdhOpenQueryW(string source, UIntPtr userData, out IntPtr query);

    [DllImport("pdh.dll", ExactSpelling = true, CharSet = CharSet.Unicode)]
    static extern uint PdhAddEnglishCounterW(IntPtr query, string path, UIntPtr userData, out IntPtr counter);

    [DllImport("pdh.dll", ExactSpelling = true)]
    static extern uint PdhCollectQueryData(IntPtr query);

    [DllImport("pdh.dll", ExactSpelling = true)]
    static extern uint PdhGetFormattedCounterValue(IntPtr counter, uint format, IntPtr type, out CounterValue value);

    [DllImport("pdh.dll", ExactSpelling = true)]
    static extern uint PdhCloseQuery(IntPtr query);
}
