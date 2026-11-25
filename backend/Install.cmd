@echo off
setlocal
powershell -NoProfile -Command "if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { exit 1 }"
if errorlevel 1 (
 echo Right-click Install.cmd and select Run as administrator.
 pause
 exit /b 1
)
set "destination=%ProgramFiles%\MechrevoControl"
if not exist "%destination%" mkdir "%destination%"
if errorlevel 1 goto failed
sc.exe query MechrevoControl >nul 2>&1
if not errorlevel 1 (
 echo Service already exists. Run Uninstall.cmd before installing this preview again.
 goto failed
)
copy /y "%~dp0MechrevoCheck.exe" "%destination%\MechrevoCheck.exe" || goto failed
sc.exe create MechrevoControl binPath= "\"%destination%\MechrevoCheck.exe\" service" start= auto || goto failed
sc.exe start MechrevoControl || goto failed
echo Run MechrevoCheck.exe as your normal user.
pause
exit /b 0
:failed
echo Installation did not complete. See the message above.
pause
exit /b 1