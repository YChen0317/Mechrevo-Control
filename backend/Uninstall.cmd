@echo off
powershell -NoProfile -Command "$ErrorActionPreference='Stop'; $svc=Get-Service MechrevoControl; if($svc.Status -ne 'Stopped'){Stop-Service $svc.Name; $svc.WaitForStatus('Stopped',[TimeSpan]::FromSeconds(20))}; sc.exe delete MechrevoControl; if($LASTEXITCODE){exit 1}; Remove-Item -LiteralPath (Join-Path $env:ProgramFiles 'MechrevoControl\MechrevoCheck.exe')"
pause