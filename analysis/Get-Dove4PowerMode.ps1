#Requires -Version 7
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$bios = Get-Item -LiteralPath 'HKLM:\HARDWARE\DESCRIPTION\System\BIOS'
$biosVersion = $bios.GetValue('BIOSVersion')
if ($biosVersion -notlike 'WUJIE14Max_Dove4_LNL326*') {
    throw "Unsupported BIOS family: $biosVersion"
}

$modeNames = @{ 1 = 'Balanced'; 2 = 'Performance' }
$settings = Get-Item -LiteralPath 'HKLM:\SOFTWARE\OEM\GamingCenter2\MySetting' -ErrorAction SilentlyContinue
$registryMode = if ($settings) { $settings.GetValue('ModeSet') }
$registryLabel = if ($registryMode -is [int] -and $modeNames.ContainsKey($registryMode)) {
    $modeNames[$registryMode]
}

$firmwareMode = $null
$firmwareLabel = $null
$firmwareError = $null
try {
    $instances = @(Get-CimInstance -Namespace root/wmi -Query 'SELECT * FROM OemWMIMethod WHERE Active = TRUE')
    if ($instances.Count -ne 1) {
        throw "Expected one active OemWMIMethod instance, found $($instances.Count)."
    }

    # The original OSD GetPowerMode sends this fixed read request.
    $request = [byte[]]::new(64)
    $request[0] = 0x03
    $request[1] = 0x09
    $response = Invoke-CimMethod -InputObject $instances[0] -MethodName OemWMIfun -Arguments @{
        u8Input = $request
    }
    if ($response.u8Output.Count -lt 4 -or [int]$response.u8Output[0] -ne 0) {
        throw 'The firmware returned no valid success response.'
    }

    $firmwareMode = [int]$response.u8Output[1]
    if ($modeNames.ContainsKey($firmwareMode)) {
        $firmwareLabel = $modeNames[$firmwareMode]
    }
} catch {
    $firmwareError = $_.Exception.Message
}

[pscustomobject]@{
    BiosVersion = $biosVersion
    OemRegistryMode = $registryMode
    OemRegistryLabel = $registryLabel
    FirmwareMode = $firmwareMode
    FirmwareLabel = $firmwareLabel
    FirmwareReadError = $firmwareError
}
