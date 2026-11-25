$ErrorActionPreference = 'Stop'
$framework = Join-Path $env:windir 'Microsoft.NET\Framework64\v4.0.30319'
$mi = Join-Path $env:windir 'Microsoft.NET\assembly\GAC_MSIL\Microsoft.Management.Infrastructure\v4.0_1.0.0.0__31bf3856ad364e35\Microsoft.Management.Infrastructure.dll'
& (Join-Path $framework 'csc.exe') /nologo /out:MechrevoCheck.exe "/r:$mi" /r:System.ServiceProcess.dll /r:System.Windows.Forms.dll /r:System.Web.Extensions.dll /r:System.Management.dll ControlService.cs
if ($LASTEXITCODE -ne 0) { throw "Compilation failed ($LASTEXITCODE)" }
