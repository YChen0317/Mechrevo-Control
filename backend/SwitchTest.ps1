param([switch]$Elevated)

$ErrorActionPreference = 'Stop'
$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    if ($Elevated) { throw 'Administrator access was not granted.' }
    $argsText = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -Elevated' -f $PSCommandPath
    $child = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -Verb RunAs -ArgumentList $argsText -Wait -PassThru
    exit $child.ExitCode
}

$desktop = [Environment]::GetFolderPath('Desktop')
$report = Join-Path $desktop ('Mechrevo-Switch-' + (Get-Date -Format yyyyMMdd-HHmmss) + '.txt')
$ns = 'root/wmi'
$class = 'EmdAcpi_PowerPlanMode'
$bios = 'WUJIE14Max_Dove4_LNL326_MC_OLED_Rev05'

function Log($message) {
    $line = '{0:o} {1}' -f [DateTime]::Now, $message
    Add-Content -LiteralPath $report -Value $line -Encoding UTF8
    Write-Host $line
}

function ActiveModeInstance {
    $instances = @(Get-CimInstance -Namespace $ns -ClassName $class -Filter 'Active=TRUE' -OperationTimeoutSec 3)
    if ($instances.Count -ne 1) { throw "Expected one active instance. Found $($instances.Count)." }
    $instances[0]
}

function ReadMode {
    $reply = ActiveModeInstance | Invoke-CimMethod -MethodName GetPowerPlanMode -Arguments @{Data=[uint64]0} -OperationTimeoutSec 3
    $data = [uint64]$reply.Data
    $mode = ($data -shr 16) -band 255
    Log "Getter ReturnValue=$($reply.ReturnValue) Data=$data PPMD=$mode"
    if (-not $reply.ReturnValue -or ($data -band 255) -ne 0 -or $mode -notin (1,2)) {
        throw 'Getter did not confirm balanced or performance.'
    }
    [int]$mode
}

function ConfirmMode([int]$target) {
    for ($attempt=0; $attempt -lt 4; $attempt++) {
        try { if ((ReadMode) -eq $target) { return } }
        catch { Log "Readback failed: $_" }
        Start-Sleep -Milliseconds 500
    }
    throw "Could not confirm PPMD=$target."
}

function SetMode([int]$target) {
    # WMBB method 1 converts Arg2 to an integer. 1 means balanced, 3 means performance.
    $inputData = if ($target -eq 1) { [uint64]1 } else { [uint64]3 }
    Log "Setter request PPMD=$target Data=$inputData"
    $reply = ActiveModeInstance | Invoke-CimMethod -MethodName SetPowerPlanMode -Arguments @{Data=$inputData} -OperationTimeoutSec 3
    Log "Setter ReturnValue=$($reply.ReturnValue) Data=$($reply.Data)"
    if (-not $reply.ReturnValue -or ([uint64]$reply.Data -band 255) -ne 0) {
        throw 'Setter did not report success. Current mode will be read independently.'
    }
}

$success = $false
$initial = $null
$attempted = $false
try {
    $actual = (Get-CimInstance Win32_BIOS -OperationTimeoutSec 3).SMBIOSBIOSVersion
    Log "BIOS=$actual"
    if ($actual -ne $bios) { throw 'BIOS does not match the verified firmware layout.' }
    $classInfo = Get-CimClass -Namespace $ns -ClassName $class -OperationTimeoutSec 3
    $setter = $classInfo.CimClassMethods['SetPowerPlanMode']
    $getter = $classInfo.CimClassMethods['GetPowerPlanMode']
    if ($setter.Qualifiers['WmiMethodId'].Value -ne 1 -or $getter.Qualifiers['WmiMethodId'].Value -ne 2 -or
        $setter.Parameters['Data'].CimType -ne 'UInt64' -or $getter.Parameters['Data'].CimType -ne 'UInt64') {
        throw 'WMI methods do not match the verified firmware layout.'
    }
    if ((Read-Host 'Close the OEM control center window, leave its services installed, then type SWITCH to test and restore the firmware mode') -cne 'SWITCH') {
        Log 'Cancelled before firmware write.'
        return
    }
    $initial = ReadMode
    $target = if ($initial -eq 1) { 2 } else { 1 }
    $attempted = $true
    SetMode $target
    ConfirmMode $target
    Log "Confirmed alternate mode PPMD=$target"
    $success = $true
} catch {
    Log "Test failed: $_"
} finally {
    if ($attempted) {
        try {
            Start-Sleep -Seconds 2
            $observed = $null
            try { $observed = ReadMode } catch { Log "Read before restore failed: $_" }
            if ($observed -ne $initial) {
                try { SetMode $initial } catch { Log "Restore setter warning: $_" }
            }
            ConfirmMode $initial
            Log "Confirmed original mode PPMD=$initial"
        } catch {
            $success = $false
            Log "RESTORE NOT CONFIRMED: $_. Restore the starting mode using the OEM control center."
        }
    }
    Log "Switch test passed=$success"
    Write-Host "Report: $report"
    Read-Host 'Press Enter to close' | Out-Null
}
if (-not $success) { exit 1 }
