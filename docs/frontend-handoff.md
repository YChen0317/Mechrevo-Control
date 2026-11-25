# Windows 控制台前端交接

## 接手位置

从 `integration/windows-v1` 分支继续。联调 PR #4 已包含共享协议、0.3.1 服务及 Windows 前端。PR #3 的导入版用于查看原始设计。当前桌面实现为 `windows-app/` 下的 WPF 应用，网页预览在 `src/`。本次前端迭代以 Windows 桌面版为交付入口。[联调 PR #4](https://github.com/YChen0317/Mechrevo-Control/pull/4) · [前端导入 PR #3](https://github.com/YChen0317/Mechrevo-Control/pull/3)

目标机为机械革命无界 14 MAX，Dove4、Intel Core Ultra 7 256V、BIOS `WUJIE14Max_Dove4_LNL326_MC_OLED_Rev05`。普通权限前端已在本机通过命名管道连接 0.3.1 服务。已验收两档双向切换和恢复、插拔电源、电量、RAPL 封装功耗、托盘重开、触摸板和键盘背光 OSD。用户确认正常睡眠唤醒后功耗和背光 OSD 恢复。其他机型及原厂后台退出后的独立功耗对照另行验证。[运行与验收记录](../windows-app/README-INTEGRATION.md)

## 运行入口

- 目标机已有 0.3.1 服务。在桌面 `Mechrevo-0.3.0-Integration` 文件夹普通双击 `Start-Mechrevo.cmd`。文件夹名沿用旧版，里边的检测工具和服务包已更新。用 `Start-Demo.cmd` 进入独立演示。
- 已打包的 Windows x64 联调 ZIP 需要 x64 .NET 10 Desktop Runtime。新装用 `Install.cmd`，旧版服务用 `Update.cmd`。安装和更新需要管理员权限，日常前端以普通权限运行。
- 仓库 WPF 项目仍面向 `net8.0-windows`。GitHub Actions 配置了自包含构建。交接时尚无成功的 Actions 构建记录，已实测的下载包来自本机 Windows 构建。请记录此次前端修改所用的构建方式和运行结果。

[0.3.1 联调包](../backend/dist/Mechrevo-Control-0.3.1-win-x64.zip) · [Windows 构建工作流](../.github/workflows/windows-integration.yml)

## 代码入口

| 文件 | 用途 |
|---|---|
| `windows-app/App.xaml.cs` | 实机和演示客户端选择、托盘、窗口生命周期、OSD 开关。实机为默认，`--demo` 显式进入演示 |
| `windows-app/MainWindow.xaml`、`MainWindow.xaml.cs` | 实机状态、档位读回反馈、断线和重新连接 |
| `windows-app/OsdWindow.xaml`、`OsdWindow.xaml.cs` | OSD 的布局与关闭时间 |
| `windows-app/Client/IDeviceClient.cs` | 窗口和托盘共用的客户端接口 |
| `windows-app/Client/NamedPipeDeviceClient.cs`、`DemoDeviceClient.cs` | 实机协议适配和独立演示数据 |
| `windows-app/Contracts/DeviceContracts.cs` | UI 使用的数据类型 |
| `contracts/v1.json` | 实机服务协议及请求、错误和事件样例 |

前端维护窗口、托盘、OSD、显示偏好和演示客户端。实机适配器、共享协议及服务改动与后端协调。固件调用和设备权限封装在服务内部。

## 前后端接入约定

本机管道为 `\\.\pipe\Mechrevo.Control.v1`，使用 UTF-8 JSON Lines，协议字段为 `v: 1`，响应通过 `requestId` 配对。沿用适配器的窄权限和客户端身份设置。

| 接口 | 前端行为 |
|---|---|
| `getCapabilities` | 以 `readable`、`writable` 和 `reason` 驱动控件与说明。服务重连后重新读取 |
| `getSnapshot` | `packageW` 为 W，`cpuMHz` 为 MHz，`batteryPercent` 为 %。`null` 表示未知或不可用，零值照常显示。用 `instanceId`、`revision` 和 `timestamp` 判断快照新旧 |
| `setPerformanceMode` | 只接受 `balanced`、`performance`。请求期间显示等待读回。收到确认后更新生效档位。遇到超时、失败或断线时重新读取状态，保留最后确认值并在需要时标为过期。写入请求由用户再次发起 |
| `subscribeStatus` | 使用独立连接接收完整快照。断线后恢复订阅，服务重启后重新获取能力和快照，并丢弃旧修订。0.3.1 的 `deviceGeneration` 可用于诊断睡眠与唤醒 |
| `subscribeHotkey` | 独立连接接收 `hotkey` 事件。事件记录 `id`、`timestamp`、`action`、`state`、`code`。`hotkeyHeartbeat` 用于连接保活。重连后只处理新事件 |

[共享协议及样例](../contracts/v1.json)

## 首版能力与显示边界

| 区域 | 当前前端应呈现 |
|---|---|
| 概览、电池 | 机型、当前档位、供电方式、充电状态、电量和采集时间。实际供电和充电状态分别显示 |
| 性能 | 平衡、性能和当前读回档位，以及 CPU 封装功耗。可用时显示频率，注明来源。采用实时 `packageW`，此前双烤的 17 W / 30 W 仅用于研究或显著标注的演示 |
| 热键与 OSD | 触摸板和键盘背光的提示已实机通过。Fn 锁、档位提示等按协议事件显示，尚待本应用实机核对。麦克风及刷新率事件的 `state` 为 `null` 时显示按键已收到、状态未知 |
| 其他控制 | 智能选档、日用流畅、充电上限、风扇、Wi-Fi、蓝牙、摄像头和 Win 键锁等由能力门控。当前保留演示或待接入状态。充放电功率、风扇和温度读数须使用有来源且单位已确认的字段 |

实机启动时本应用 OSD 默认关闭。用户可从托盘开启。需要避免双重提示时，可在原厂控制中心关闭原厂 OSD。现阶段相关硬件动作仍由固件或原厂组件执行，本应用根据事件显示反馈。[热键和原厂行为记录](dove4-hotkeys-and-lighting.md)

## 下一轮前端验收

1. 基于现有实机页面完善窗口、托盘和 OSD，保留演示入口。实机连接失败时显示原因、重连入口和最后确认状态。演示数据始终有清楚标识。
2. 核对档位的等待读回、写入受限、读回不一致、超时以及断线恢复。验证窗口和托盘都使用同一确认状态，快速点击期间保持清晰反馈。
3. 核对未知读数与零值的区分、键盘焦点和状态提示。用演示场景覆盖失败与断线，再在目标机做有针对性的回归。已有实机结果可直接引用。
4. 在前端 PR 或交付说明里写明变更、构建入口、验证环境、通过项和待测项。需要配合实机操作时，一次给出具体按键和应看到的结果。

日用流畅与智能选档后续沿用各自的能力验收。界面分别表达用户选择的策略和当前硬件档位，例如「日用流畅 · 硬件平衡档」。[日用流畅实机验证计划](dove4-daily-smooth.md) · [控制台实现底稿](dove4-implementation-reference.md)

[可直接复制的前端交接 prompt](frontend-agent-prompt.md)
