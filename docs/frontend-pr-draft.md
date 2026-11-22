## [Draft PR] feat(frontend): 无界 14 MAX（Dove4）单进程 Windows 控制台前端演示版与 IDeviceClient 契约

### 1. 本次交付概述
- **检查主仓库状态**：已阅读 `docs/frontend-handoff.md`、`docs/backend-handoff.md`、`docs/dove4-daily-smooth.md`、`docs/dove4-hotkeys-and-lighting.md`、`docs/dove4-mode-measurements.md` 与 `docs/dove4-wmi-map.md`。当前仓库尚无后端提交的 `contracts/` 定义或协议样例，因此前端先以可替换接口抽象独立交付完整演示版。
- **极低前后台资源占用的单进程架构**：
  - 窗口、系统托盘与 OSD 统一置于单个普通权限前端 App 进程内。
  - **Windows 生产端采用 C# .NET 8 LTS + 原生 WPF（按需创建与销毁主窗口）+ 原生 Win32 `NotifyIcon` 托盘 + 轻量置顶分层 OSD**（源码见 `windows-app/`）。关闭主窗口时彻底释放主界面视觉树，并调用 `IDeviceClient.SetTelemetryActive(false)` 立即暂停高频遥测，后台仅留命名管道异步事件监听（空闲 CPU 趋近 0%、内存约 12–22 MB，且可进程内直接宿主后端提供的 C# 会话动作库，避免 Electron 或常驻 WebView2 的资源开销）。
  - 同时提供可立即在浏览器运行的交互桌面模拟版（`npm install && npm run dev`），便于无需 Windows 构建环境即可评审全部 UI、托盘、OSD 与异常态。
- **单一可替换客户端（`IDeviceClient`）**：全部界面复用 `getCapabilities`、`getSnapshot`、`setPerformanceMode`、`subscribeStatus`、`subscribeHotkey` 与 `setTelemetryActive`。演示模式注入 `DemoDeviceClient`，后端服务就绪后仅需切换为 `NamedPipeDeviceClient`。
- **严格读回确认状态机**：
  - 点击「平衡 / 性能」仅进入等待读回态，**绝不提前乐观修改已生效档位**。
  - 完整演示：**切换成功**、**写后读回不一致 (`READBACK_MISMATCH`)**、**权限不足 (`PERMISSION_DENIED`)**、**设备忙 (`DEVICE_BUSY`)**、**读回超时 (`TIMEOUT`)** 与 **服务断线 (`SERVICE_OFFLINE`) / 自动重连刷新**。
  - 失败时保持最后一次读回确认值，提供手动重试，绝不自动静默重放写请求。
- **策略与硬件档位分离**：「智能选档」与「日用流畅」默认依据后端能力表门控锁定，界面独立显示用户选择的策略和硬件实际档位（如 `日用流畅 · 硬件平衡档`），并在演示调试台支持模拟开放能力与恢复原配置失败 (`RESTORE_FAILED`)。
- **客户端语言与适配器位置（供后端 Agent 对齐文件归属）**：
  - Windows 原生前端语言：**C# (.NET 8 LTS / WPF)**（与后端同栈，支持进程内直接宿主后端会话动作库，不增加常驻进程）。
  - 适配器位置：`windows-app/Client/IDeviceClient.cs`（前端维护）、`windows-app/Client/DemoDeviceClient.cs`（前端维护）、`windows-app/Client/NamedPipeDeviceClient.cs`（实机管道适配器骨架，待后端 `contracts/` 协议 PR 合入后与后端约定归属并接通）。
  - 交互预览前端对应适配器：`src/client/contracts.ts`、`src/client/DemoDeviceClient.ts`、`src/client/NamedPipeDeviceClient.ts`。
  - 未提前创建 `contracts/` 目录，避免与后端首次协议 PR 冲突。

### 2. 需要与后端 Agent 一起核对的接口字段与行为

| 编号 | 优先级 | 核对主题 | 前端当前假设 | 请后端确认 |
|---|---|---|---|---|
| Q-01 | 必须先定 | 命名管道名与协议版本协商 | 暂定 `\\.\pipe\MechrevoControl.Dove4.V1`，UTF-8 JSON Lines，每条消息带 `protocolVersion` 与 `requestId`，重启刷新 `serviceInstanceId` | 正式管道名、本机交互用户 ACL 规则，以及主版本不兼容时的精确错误码 |
| Q-02 | 必须先定 | `setPerformanceMode` 超时与延迟生效 | 写后限时读回，超时返回 `TIMEOUT` 且客户端不重放；不一致返回 `READBACK_MISMATCH` 并附 `requestedValue` / `actualReadbackValue` | 读回超时上限（如 1500/3000 ms），以及超时后若硬件延迟生效是否立即经 `subscribeStatus` 推更高 `revision` 快照 |
| Q-03 | 必须先定 | 遥测订阅门控节能 | 主窗口关闭至托盘或切离性能页时调用 `setTelemetryActive(false)` 暂停高频遥测 | 后端是否支持按连接粒度声明 `idle_events_only` / `active_telemetry` 订阅级别 |
| Q-04 | 联调确认 | 未校准传感器与真实零值 | 缺失字段严格用 `null`（显示「不可用」），真实零值保留 `0`；未校准风扇/EC TSR4/USB-C VBUS 放 `rawSensors` 并带 `source`、`calibrated: false`、`isStale` | 是否同意此结构；单通道超时时保留旧值并标 `isStale: true` 还是直接置 `null` |
| Q-05 | 联调确认 | 「日用流畅」「智能选档」互斥与回滚 | 启用日用流畅暂停智能选档；切离日用流畅前若回滚失败返回 `RESTORE_FAILED` 并保留最后确认状态 | 从「日用流畅」直接点手动「性能」时，是由后端原子回滚再切档，还是前端先调 `restoreDailySmooth()` 再调 `setPerformanceMode()` |
| Q-06 | 联调确认 | 热键动作归属与会话库接口 | 触摸板 (`0x30/0x31`) 仅刷状态不执行；麦克风 (`0xA1`) 等会话动作由后端 C# 库宿主在前端托盘进程内；关闭本 App OSD 不影响动作执行 | 会话动作库的 C# 接口约定，以及重连后 `subscribeHotkey` 是否严格不补放历史事件 |
| Q-07 | 后续阶段 | 电池限充字段扩展 | 首版 `batteryChargeLimit.writable = false`，只读呈现 `MICP=0 / MXCP=0 / EBCM=0` | 后续验证通过后，限充是离散预设还是连续区间，是否提供显式“恢复原厂默认 0”动作 |

### 3. 可运行构建与双击启动说明

#### 方式 A：Windows 原生单进程演示版（推荐，极低内存/CPU 占用）
1. 在 Windows 10/11 安装 `.NET 8 Desktop SDK`（无需管理员权限，不依赖无界 14 MAX 实机）。
2. 双击仓库内的 `windows-app\build-demo.bat`（或在终端执行 `dotnet publish windows-app/MechrevoControl.Frontend.csproj -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true -o dist-win`）。
3. 双击打开生成的 `dist-win\MechrevoControl.Frontend.exe`。
4. **试用清单**：
   - 主窗口直接标注「演示数据」，测试「平衡 / 性能」切换、在顶部故障模拟下拉中切换「读回不一致 / 权限不足 / 超时 / 模拟断线」验证档位仅在确认后更新；
   - 点击主窗口右上角 `×` 关闭主窗口（主窗彻底销毁、高频遥测立即停止），在任务栏右下角系统托盘右键/单击体验快捷切档、触发 OSD、重新打开主窗口或彻底退出单进程。

#### 方式 B：跨平台在线/本地交互桌面演示（含完整场景调试台）
1. 在仓库根目录执行 `npm install && npm run dev`。
2. 浏览器访问 `http://localhost:3000`，即可直接体验主窗口、关闭至托盘低功耗态、托盘弹层、置顶 OSD、右侧演示调试台以及 `DemoDeviceClient` ↔ `NamedPipeDeviceClient` 一键替换验证。
