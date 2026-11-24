@echo off
chcp 65001 >nul
echo 正在构建无界 14 MAX 控制台单进程演示版 (.NET 8 Win64)...
dotnet publish "%~dp0MechrevoControl.Frontend.csproj" -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true -o "%~dp0dist-win"
if %errorlevel% neq 0 (
  echo 构建失败，请确认本机已安装 .NET 8 Desktop SDK (https://dotnet.microsoft.com/download/dotnet/8.0)。
  pause
  exit /b 1
)
echo.
echo 构建成功！双击运行：%~dp0dist-win\MechrevoControl.Frontend.exe
start "" "%~dp0dist-win\MechrevoControl.Frontend.exe"
