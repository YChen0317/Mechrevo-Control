$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole('Administrator')) {
    throw 'Right-click Update.cmd and select Run as administrator.'
}
$name = 'MechrevoControl'
$exe = Join-Path $env:ProgramFiles 'MechrevoControl\MechrevoCheck.exe'
$source = Join-Path $PSScriptRoot 'MechrevoCheck.exe'
$config = Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\$name"
if ($config.ImagePath -ne ('"{0}" service' -f $exe)) {
    throw "Unexpected service path. Installed path: $($config.ImagePath)"
}
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    throw 'Extract all files from the ZIP before running Update.cmd.'
}
$backup = "$exe.rollback"
Copy-Item -LiteralPath $exe -Destination $backup -Force
try {
    $service = Get-Service $name
    if ($service.Status -ne 'Stopped') { Stop-Service $name }
    $service.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(20))
    Copy-Item -LiteralPath $source -Destination $exe -Force
    Start-Service $name
    $service.WaitForStatus('Running', [TimeSpan]::FromSeconds(20))
} catch {
    $updateError = $_
    try {
        $service = Get-Service $name
        if ($service.Status -ne 'Stopped') { Stop-Service $name }
        $service.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(20))
        Copy-Item -LiteralPath $backup -Destination $exe -Force
        Start-Service $name
    } catch {
        throw "Update failed: $updateError. Rollback failed: $_. Backup: $backup"
    }
    throw "Update failed and the previous service was restored: $updateError"
}
Remove-Item -LiteralPath $backup
Write-Host 'Updated. Double-click the new MechrevoCheck.exe as your normal user.'
