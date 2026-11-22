param([switch]$Elevated, [switch]$ShowFailure)

$ErrorActionPreference = 'Stop'
trap {
    if (-not $ShowFailure) { throw $_ }
    Write-Host $_.Exception.Message -ForegroundColor Red
    Read-Host 'Press Enter to close' | Out-Null
    exit 1
}
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    if ($Elevated) { throw 'Administrator access was not granted.' }
    $arguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -Elevated' -f $PSCommandPath
    $arguments += ' -ShowFailure'
    try {
        $process = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -Verb RunAs -ArgumentList $arguments -Wait -PassThru
    } catch {
        throw "Could not get administrator access. Approve the Windows prompt or enter administrator credentials. $($_.Exception.Message)"
    }
    if ($process.ExitCode -ne 0) {
        throw "The elevated update failed (exit code $($process.ExitCode))."
    }
    Write-Host 'Updated. Double-click the new MechrevoCheck.exe as your normal user.'
    exit 0
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
