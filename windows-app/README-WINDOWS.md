# 无界 14 MAX（Dove4）Windows 原生单进程前端（C# .NET 8 WPF）

面向机械革命无界 14 MAX 的极低资源占用单进程桌面控制台：窗口、系统托盘与 OSD 统一位于单个普通权限进程内；主窗口关闭后立即销毁 UI 树并调用 `IDeviceClient.SetTelemetryActive(false)` 暂停高频遥测，后台仅留 Win32 托盘与命名管道异步监听。

## 双击构建与启动（演示版）

无需管理员权限，也不依赖无界 14 MAX 目标机型：

1. 安装 Windows 端 [.NET 8 Desktop SDK](https://dotnet.microsoft.com/download/dotnet/8.0)。
2. 直接双击本目录下的 `build-demo.bat`。
3. 脚本会自动打包单文件演示版 `dist-win\MechrevoControl.Frontend.exe` 并自动启动；后续直接双击该 `.exe` 即可打开。

## 后端 Agent 对接入口与文件归属建议

- **前端客户端语言**：C# (.NET 8 LTS / WPF)，与后端服务同栈，可直接在单进程托盘内宿主后端提供的用户会话动作库。
- **契约与可替换适配器位置**：
  - `windows-app/Contracts/DeviceContracts.cs`（前端当前 DTO，待后端 `contracts/` 协议 PR 合入后对齐）
  - `windows-app/Client/IDeviceClient.cs`（统一数据访问接口，归前端维护）
  - `windows-app/Client/DemoDeviceClient.cs`（演示数据实现，归前端维护）
  - `windows-app/Client/NamedPipeDeviceClient.cs`（实机命名管道实现骨架，建议后端合入协议后由前后端在联调 PR 中共同确认归属并补全）
- 实机切换仅需在 `windows-app/App.xaml.cs` 中将 `new DemoDeviceClient()` 替换为 `new NamedPipeDeviceClient()`，主窗口、托盘与 OSD 零改动复用。
