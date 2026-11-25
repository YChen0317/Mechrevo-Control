@echo off
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0Update.ps1"
set "result=%ERRORLEVEL%"
pause
exit /b %result%
