# Research capture for the Dove4 Rev05 firmware. Runs in Windows PowerShell 5.1.
[CmdletBinding()]
param(
    [switch]$Load,
    [ValidateRange(0, 600)]
    [int]$GameSeconds = 0
)

if ($Load -and $GameSeconds) {
    throw 'Choose either -Load or -GameSeconds.'
}

$ErrorActionPreference = 'Stop'
$bios = (Get-Item 'HKLM:\HARDWARE\DESCRIPTION\System\BIOS').GetValue('BIOSVersion')
if ($bios -ne 'WUJIE14Max_Dove4_LNL326_MC_OLED_Rev05') {
    throw "This capture was verified against a different BIOS: $bios"
}

function Read-Dove4Value {
    param([string]$Class, [string]$Method, [int]$Id, [uint64]$Data)
    try {
        $metadata = Get-CimClass -Namespace root/wmi -ClassName $Class
        if ($metadata.CimClassMethods[$Method].Qualifiers['WmiMethodId'].Value -ne $Id) {
            throw 'Unexpected method identifier.'
        }
        $instance = @(Get-CimInstance -Namespace root/wmi -ClassName $Class | Where-Object Active)
        if ($instance.Count -ne 1) {
            throw "Expected one active instance, found $($instance.Count)."
        }
        $result = Invoke-CimMethod -InputObject $instance[0] -MethodName $Method -Arguments @{ Data = $Data }
        if ($null -eq $result.Data) {
            throw 'The provider returned no Data field.'
        }
        $bytes = [BitConverter]::GetBytes([uint64]$result.Data)
        '{0}({1}) Return={2} Bytes={3}' -f $Method, $Data, $result.ReturnValue, [BitConverter]::ToString($bytes)
    } catch {
        '{0}({1}) Error={2}' -f $Method, $Data, $_.Exception.Message
    }
}

function Read-Snapshot {
    Read-Dove4Value EmdAcpi_PowerPlanMode GetPowerPlanMode 2 0
    Read-Dove4Value EmdAcpi_BatteryChargeRationing GetBatteryChargeRationing 1 0
    Read-Dove4Value EmdAcpi_Battery_Charge_Mode Get_Battery_Charge_Mode 2 0
    Read-Dove4Value EmdAcpi_FanControl GetFanSpeed 1 1
    Read-Dove4Value EmdAcpi_FanControl GetFanSpeed 1 2
    Read-Dove4Value EmdAcpi_GetTypeCVBUS GetTypeCVbus 1 0
    Read-Dove4Value EmdAcpi_ECInformation GetCpuTemperature 3 0x62
    try {
        Get-CimInstance -Namespace root/wmi -ClassName BatteryStatus |
            Where-Object Active |
            Select-Object PowerOnline, Charging, ChargeRate, DischargeRate |
            Format-Table -AutoSize | Out-String
    } catch { "BatteryStatus Error=$($_.Exception.Message)" }
    $settings = Get-Item 'HKLM:\SOFTWARE\OEM\GamingCenter2\MySetting'
    foreach ($name in 'ModeSet', 'WinKeyLock', 'CloseTimer', 'OSDHidden') {
        '{0}={1}' -f $name, $settings.GetValue($name)
    }
}

Read-Snapshot
if (!$Load -and !$GameSeconds) { return }

if ($Load -and -not ('Dove4ResearchLoad' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Threading.Tasks;

public static class Dove4ResearchLoad
{
    public static Task Run(int seconds)
    {
        return Task.Run(() =>
        {
            var elapsed = Stopwatch.StartNew();
            Parallel.For(0, Environment.ProcessorCount, index =>
            {
                double value = index + 1;
                while (elapsed.Elapsed.TotalSeconds < seconds)
                {
                    for (int iteration = 0; iteration < 10000; iteration++)
                        value = Math.Sqrt(value + 17.2);
                }
                GC.KeepAlive(value);
            });
        });
    }
}
'@
}

$paths = @(
    '\Energy Meter(RAPL_Package0_PKG)\Power'
    '\Processor Information(_Total)\Actual Frequency'
    '\Processor Information(_Total)\Performance Limit Flags'
    '\Thermal Zone Information(\_TZ.TZ00)\High Precision Temperature'
)

$interval = if ($Load) { 2 } else { 1 }
$sampleCount = if ($Load) { 21 } else { $GameSeconds }
$telemetryAt = if ($Load) { 34 } else { [math]::Floor($GameSeconds / 2) }
if ($GameSeconds) {
    'Capturing game telemetry. Return to the game now.'
}
'Second,PackageMilliwatts,FrequencyMHz,LimitFlags,AcpiZoneDecikelvin'
$sampledUnderLoad = $false
$clock = [Diagnostics.Stopwatch]::StartNew()
$work = if ($Load) { [Dove4ResearchLoad]::Run(45) }
try {
    Get-Counter -Counter $paths -SampleInterval $interval -MaxSamples $sampleCount | ForEach-Object {
        $values = foreach ($sample in $_.CounterSamples) {
            if ($sample.Status -eq 0) {
                $sample.CookedValue.ToString('0.00', [Globalization.CultureInfo]::InvariantCulture)
            } else { '' }
        }
        '{0},{1}' -f [int]$clock.Elapsed.TotalSeconds, ($values -join ',')
        if ($clock.Elapsed.TotalSeconds -ge $telemetryAt -and !$sampledUnderLoad) {
            $sampledUnderLoad = $true
            Read-Dove4Value EmdAcpi_FanControl GetFanSpeed 1 1
            Read-Dove4Value EmdAcpi_FanControl GetFanSpeed 1 2
            Read-Dove4Value EmdAcpi_ECInformation GetCpuTemperature 3 0x62
        }
    }
} finally {
    if ($work) { $work.GetAwaiter().GetResult() }
}
