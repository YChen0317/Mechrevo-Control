#Requires -Version 7
param(
    [Parameter(Mandatory)]
    [string]$AssemblyPath,
    [Parameter(Mandatory)]
    [string]$MethodPattern,
    [switch]$ShowIl
)

$ErrorActionPreference = 'Stop'
if (-not ('OemIl' -as [type])) {
    Add-Type -Path (Join-Path $PSScriptRoot 'OemIl.cs') -ReferencedAssemblies @(
        'System.Runtime', 'System.Collections', 'System.Linq', 'System.Reflection.Emit.ILGeneration',
        'System.Reflection.Primitives', 'System.Reflection.Metadata', 'System.Collections.Immutable',
        'System.Text.RegularExpressions'
    )
}
[OemIl]::Read((Resolve-Path -LiteralPath $AssemblyPath).Path, $MethodPattern, $ShowIl.IsPresent)
