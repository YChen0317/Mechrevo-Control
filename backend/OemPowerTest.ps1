param([switch]$Elevated)
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    if ($Elevated) { throw 'Administrator access was not granted.' }
    $arguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -Elevated' -f $PSCommandPath
    $child = Start-Process (Join-Path $PSHOME 'powershell.exe') -Verb RunAs -ArgumentList $arguments -Wait -PassThru
    exit $child.ExitCode
}

trap {
    Write-Host $_.Exception.Message -ForegroundColor Red
    Read-Host 'Press Enter to close' | Out-Null
    exit 1
}
$desktop = [Environment]::GetFolderPath('Desktop')
$stamp = Get-Date -Format yyyyMMdd-HHmmss
$report = Join-Path $desktop "Mechrevo-OEM-Power-$stamp.txt"
$csv = Join-Path $desktop "Mechrevo-OEM-Power-$stamp.csv"
$serviceNames = @('EmOSDFunctionService','GCUBridge')
$processNames = @('CCU.WinUI','CCUWinUI','GCUService','EmOSDFunction','GCUBridge','EmOSDFunctionService')
$modeNames = @{1='balanced';2='performance'}
$initial = $null
$affected = $false
$restoreMode = $false
$success = $false
$initialServices = @()
$originalProcesses = @()
$labels = @('balanced','performance','balanced')

function Log($message) {
    $entry = '{0:o} {1}' -f [DateTimeOffset]::Now,$message
    Add-Content -LiteralPath $report -Value $entry -Encoding UTF8
    Write-Host $entry
}

function Request([string]$method,[string]$mode) {
    $access = [IO.Pipes.PipeAccessRights]::ReadWrite -bor [IO.Pipes.PipeAccessRights]::Synchronize
    $pipe = [IO.Pipes.NamedPipeClientStream]::new('.','Mechrevo.Control.v1',$access,
        [IO.Pipes.PipeOptions]::Asynchronous,[Security.Principal.TokenImpersonationLevel]::Identification,
        [IO.HandleInheritability]::None)
    try {
        $pipe.Connect(3000)
        $utf8 = [Text.UTF8Encoding]::new($false)
        $writer = [IO.StreamWriter]::new($pipe,$utf8,1024,$true)
        $reader = [IO.StreamReader]::new($pipe,$utf8,$false,1024,$true)
        try {
            $id = [Guid]::NewGuid().ToString('N')
            $writer.WriteLine((@{v=1;requestId=$id;method=$method;mode=$mode} | ConvertTo-Json -Compress))
            $writer.Flush()
            $read = $reader.ReadLineAsync()
            if (-not $read.Wait(32000) -or -not $read.Result) { throw "$method result unknown." }
            $reply = $read.Result | ConvertFrom-Json
            if ($reply.v -ne 1 -or $reply.requestId -ne $id) { throw 'Unexpected service response.' }
            if ($reply.error) { throw "$($reply.error.code): $($reply.error.message)" }
            $reply.result
        } finally {
            $reader.Dispose()
            $writer.Dispose()
        }
    } finally { $pipe.Dispose() }
}

function ReadFirmware {
    $active = @(Get-CimInstance -Namespace root/wmi -ClassName EmdAcpi_PowerPlanMode -Filter 'Active=TRUE' -OperationTimeoutSec 4)
    if ($active.Count -ne 1) { throw 'Expected exactly one active WMI instance.' }
    $response = $active[0] | Invoke-CimMethod -MethodName GetPowerPlanMode -Arguments @{Data=[uint64]0} -OperationTimeoutSec 4
    $word = [uint64]$response.Data
    $mode = $modeNames[[int](($word -shr 16) -band 255)]
    if (-not $response.ReturnValue -or ($word -band 255) -ne 0 -or -not $mode) {
        throw "Unrecognized firmware getter result: $word"
    }
    $mode
}

function RequireMode([string]$expected) {
    $actual = ReadFirmware
    Log "Independent CIM expected=$expected actual=$actual"
    if ($expected -ne $actual) { throw "CIM mode mismatch: $actual" }
}

function SetMode([string]$target) {
    Log "Service switch request: $target"
    $result = Request 'setPerformanceMode' $target
    if ($result.mode -ne $target) { throw "Service did not confirm $target" }
    RequireMode $target
}

function Get-OemProcesses {
    @(Get-Process -Name $processNames -ErrorAction SilentlyContinue)
}

function Check-Quiescent {
    $activeServices = @(Get-Service -Name $serviceNames | Where-Object Status -ne 'Stopped')
    $activeProcesses = @(Get-OemProcesses)
    if ($activeServices.Count -or $activeProcesses.Count) {
        throw "An OEM component restarted. Services: $($activeServices.Name -join ', '); processes: $($activeProcesses.ProcessName -join ', ')"
    }
}

function Wait-ForModeSnapshot([string]$mode) {
    $deadline = [Diagnostics.Stopwatch]::StartNew()
    do {
        $snap = Request 'getSnapshot' ''
        if ($snap.ac -ne $true) { throw 'AC disconnected during phase start.' }
        if ($snap.mode -eq $mode) {
            Log "Service snapshot synchronized: mode=$mode revision=$($snap.revision)"
            return
        }
        Start-Sleep -Milliseconds 500
    } while ($deadline.Elapsed.TotalSeconds -lt 12)
    RequireMode $mode
    throw "Service snapshot did not synchronize to $mode within 12 seconds (last mode=$($snap.mode))."
}

function Capture-Phase([string]$round,[int]$step,[string]$mode) {
    RequireMode $mode
    Wait-ForModeSnapshot $mode
    $timer = [Diagnostics.Stopwatch]::StartNew()
    $rows = [System.Collections.Generic.List[object]]::new()
    $revision = -1
    Log "Sampling $round/$step $mode for 75 seconds. Keep both workloads running."
    while ($timer.Elapsed.TotalSeconds -lt 75) {
        if ($round -eq 'B') { Check-Quiescent }
        elseif (@(Get-Service -Name $serviceNames | Where-Object Status -ne 'Running').Count) {
            throw 'An OEM service stopped during baseline A.'
        }
        $snap = Request 'getSnapshot' ''
        if ($snap.ac -ne $true -or $snap.mode -ne $mode) {
            throw "Sampling conditions changed: AC=$($snap.ac), mode=$($snap.mode)"
        }
        if ($snap.revision -ne $revision) {
            $revision = $snap.revision
            $row = [pscustomobject]@{round=$round;step=$step;mode=$mode;elapsed=[math]::Round($timer.Elapsed.TotalSeconds,2);
                capturedAt=$snap.timestamp;packageW=$snap.packageW;cpuMHz=$snap.cpuMHz}
            $rows.Add($row)
            $row | Export-Csv -LiteralPath $csv -NoTypeInformation -Append
        }
        Start-Sleep -Seconds 2
    }
    RequireMode $mode
    $tail = @($rows | Where-Object { $_.elapsed -ge 45 -and $null -ne $_.packageW })
    if ($tail.Count -lt 10) { throw "Too few valid tail samples: $($tail.Count)" }
    $watts = ($tail | Measure-Object -Property packageW -Average).Average
    Log ('SUMMARY round={0} step={1} mode={2} tailSamples={3} packageW={4:F2}' -f $round,$step,$mode,$tail.Count,$watts)
}

try {
    $bios = (Get-CimInstance Win32_BIOS -OperationTimeoutSec 4).SMBIOSBIOSVersion
    if ($bios -ne 'WUJIE14Max_Dove4_LNL326_MC_OLED_Rev05') { throw "Unexpected BIOS: $bios" }
    $backend = Get-Service -Name MechrevoControl
    Log "MechrevoControl initial state: $($backend.Status)"
    if ($backend.Status -eq 'Stopped') {
        Start-Service -Name MechrevoControl
        Log 'Started MechrevoControl.'
    }
    $backend.WaitForStatus('Running',[TimeSpan]::FromSeconds(15))

    $snap = $null
    $lastError = $null
    for ($attempt = 0; $attempt -lt 4; $attempt++) {
        try {
            $snap = Request 'getSnapshot' ''
            if ($snap.ac -ne $true) { throw 'Connect AC before starting the test.' }
            if ($null -ne $snap.packageW) { break }
        } catch {
            $lastError = $_
            $snap = $null
        }
        Start-Sleep -Seconds 2
    }
    if ($null -eq $snap -or $null -eq $snap.packageW) {
        $backend.Refresh()
        throw "Backend preflight failed, service=$($backend.Status). $lastError"
    }
    Log "Backend ready: $($snap.serviceVersion), packageW=$($snap.packageW)"

    $missingServices = @(Get-Service -Name $serviceNames | Where-Object Status -ne 'Running')
    if ($missingServices.Count) {
        Log "OEM services required for baseline A: $($missingServices.Name -join ', ')"
        if ((Read-Host 'Type START to start the listed OEM services for baseline A') -cne 'START') {
            Log 'Cancelled before OEM baseline.'
            return
        }
        foreach ($service in $missingServices) {
            if ($service.Status -eq 'Stopped') { Start-Service -Name $service.Name }
            $service.WaitForStatus('Running',[TimeSpan]::FromSeconds(15))
            Log "OEM service running: $($service.Name)"
        }
    }
    $initialServices = @(Get-Service -Name $serviceNames | Where-Object Status -eq 'Running' | Select-Object -ExpandProperty Name)
    if ($initialServices.Count -ne $serviceNames.Count) { throw 'Both OEM services must be running for baseline A.' }
    $initial = ReadFirmware
    $originalProcesses = @(Get-OemProcesses | Select-Object -ExpandProperty ProcessName -Unique)
    Log "BIOS=$bios start=$initial serviceVersion=$($snap.serviceVersion) OEM=$($originalProcesses -join ',')"
    Log ((powercfg.exe /getactivescheme | Out-String).Trim())
    if ((Read-Host 'Start the same fixed CPU + iGPU dual workload as before. Keep AC connected. Type TEST to start') -cne 'TEST') {
        Log 'Cancelled.'
        return
    }
    $restoreMode = $true
    for ($i=0;$i -lt $labels.Count;$i++) {
        $mode = $labels[$i]
        Read-Host "In the OEM control center select $mode; then return here and press Enter" | Out-Null
        Capture-Phase 'A' ($i+1) $mode
    }
    Read-Host 'Close the OEM control center window. Keep the workloads running, and press Enter for the automatic independent test' | Out-Null
    $affected = $true
    foreach ($name in $serviceNames) {
        Stop-Service -Name $name
        (Get-Service -Name $name).WaitForStatus('Stopped',[TimeSpan]::FromSeconds(15))
    }
    Get-OemProcesses | Stop-Process -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    Check-Quiescent
    for ($i=0;$i -lt $labels.Count;$i++) {
        $mode = $labels[$i]
        Check-Quiescent
        SetMode $mode
        Capture-Phase 'B' ($i+1) $mode
    }
    $success = $true
} catch { Log "TEST STOPPED: $_" }
finally {
    if ($affected) {
        foreach ($name in @('GCUBridge','EmOSDFunctionService')) {
            if ($name -notin $initialServices) { continue }
            try {
                Start-Service -Name $name
                (Get-Service -Name $name).WaitForStatus('Running',[TimeSpan]::FromSeconds(15))
                Log "Restored OEM service $name"
            } catch { $success = $false; Log "RESTORE SERVICE FAILED $($name): $_" }
        }
        Start-Sleep -Seconds 3
        $present = @(Get-OemProcesses | Select-Object -ExpandProperty ProcessName -Unique)
        $missing = @($originalProcesses | Where-Object {$_ -notin $present -and $_ -notmatch '^CCU'})
        if ($missing.Count) { $success = $false; Log "OEM user processes not yet restored: $($missing -join ', '). Reboot to restore OEM startup." }
    }
    if ($restoreMode -and $initial) {
        try {
            if ((ReadFirmware) -ne $initial) { SetMode $initial }
            RequireMode $initial
            Log "Original mode confirmed: $initial"
        } catch { $success = $false; Log "RESTORE MODE FAILED: $_. Restore $initial in the OEM control center." }
    }
    Log "Capture passed=$success"
    Write-Host "Stop the workloads. Report: $report"
    Write-Host "Samples: $csv"
    Read-Host 'Press Enter to close' | Out-Null
}
