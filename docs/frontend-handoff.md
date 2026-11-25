# Windows 前端重写交接

## 从哪里开始

从 `integration/windows-v1` 开新前端分支。这个基线包含 0.3.1 Windows 服务、IPC v1 契约和后端检测工具。旧 WPF 控制台、网页演示和对应构建配置已从当前树移除。新前端可自行选择技术栈、目录和打包方式。首版交付是独立设计的简体中文 Windows 桌面应用，普通权限运行。

[后端与协议基线 PR #4](https://github.com/YChen0317/Mechrevo-Control/pull/4) · [后端安装与检测](../backend/README.md) · [IPC 契约](../contracts/v1.json)

## 已验证的基线

目标机为机械革命无界 14 MAX，Dove4、Intel Core Ultra 7 256V、BIOS `WUJIE14Max_Dove4_LNL326_MC_OLED_Rev05`。0.3.1 已验证普通权限客户端可以连接服务，读取实际档位、供电、电量和 RAPL 封装功耗，并完成平衡与性能的双向切换及恢复。触摸板、键盘背光事件和睡眠唤醒后的功耗与背光提示也已有实机结果。这些是后端与此前联调的基线，新程序仍需走自己的最小回归。原厂后台退出后的独立功耗对照和其他机型支持另行验收。

目标机上已有 0.3.1 服务。新机安装时解压后端包，右键 `Install.cmd` 并以管理员身份运行。服务已安装时直接用普通权限运行新前端，也可双击 `MechrevoCheck.exe` 核对服务状态和快照。[0.3.1 服务包](../backend/dist/Mechrevo-0.3.1.zip) · [切档实机记录](../backend/switch-validation.md)

## 首版范围

| 区域 | 交付 |
|---|---|
| 主窗口 | 显示机型、当前档位、供电方式、电量、充电状态、CPU 封装功耗和采集时间。状态清楚时可同时显示频率 |
| 性能 | 提供平衡与性能两档，显示请求等待、固件确认和失败原因。生效档位以固件最后一次有效读回为准 |
| 托盘 | 可打开主窗口、查看当前档位、控制本应用 OSD 和退出。关闭主窗口后托盘和订阅继续工作 |
| OSD | 首先支持触摸板与键盘背光状态。实机默认关闭本应用提示，可手动开启。麦克风和刷新率事件的状态未知时，只显示已收到按键和状态未知 |
| 演示 | 提供显式启动入口，清楚标注「演示数据」，覆盖成功、读回失败、断线、OSD 和不可用读数 |
| 后续功能 | 智能选档、日用流畅、充电上限、风扇、无线、摄像头和 Win 键锁等按后端能力开放 |

未知读数用不可用或未知表达，零值照常显示。实时封装功耗只来自 `packageW`。此前约 17 W / 30 W 的双烤读数供研究引用或显式演示。实机的触摸板、背光等动作由固件或原厂组件处理，前端用事件显示反馈。需要验证本应用 OSD 时可关闭原厂 OSD 来避免重复提示。

## IPC 接入顺序

管道为 `\\.\pipe\Mechrevo.Control.v1`。使用 UTF-8 JSON Lines，消息带 `v: 1`，请求和响应通过 `requestId` 配对。连接权限与客户端身份按现有服务 ACL 申请，底层示例见 `backend/ControlService.cs` 中的 `Request`。避免申请会映射到创建管道实例的通用写权限，保留 Windows Identification 身份级别供服务验证本地交互用户。

1. 实现实机与演示共用的设备客户端接口。先接 `getSnapshot`、`getCapabilities` 和 `subscribeStatus`。快照以 `instanceId`、`revision`、`timestamp` 判断新旧。`packageW` 用 W，`cpuMHz` 用 MHz，`batteryPercent` 用 %。
2. 接 `setPerformanceMode`，请求值只有 `balanced` 和 `performance`。写后读回成功再更新状态。超时或断线时保留并标记最后确认的快照，恢复连接后重新取能力和快照。再次写入由用户发起。
3. 接 `subscribeHotkey`。状态和热键各用独立连接。热键修订号与状态修订号分别维护。支持 `hotkeyHeartbeat`，重连后从新的事件开始，`state: null` 显示未知。
4. 界面按能力里的 `readable`、`writable` 和 `reason` 表达状态。若协议需要调整，在前端 PR 记录请求、回复和复现步骤，与后端确认后再变更契约。

## 交付与复核

提交可双击运行的 Windows 构建、源码、启动说明和演示入口。先用演示或模拟管道覆盖成功、失败、断线、重连和未知值，再用目标机验证真实读数、两个方向切档、恢复起始档、托盘与 OSD。真实响应来自 0.3.1 服务，前端安装权限按新技术栈的实际需要写清楚。对需要用户参与的操作，给出具体按键和预期结果。

[控制台实现底稿](dove4-implementation-reference.md) · [热键行为](dove4-hotkeys-and-lighting.md) · [双烤记录](dove4-mode-measurements.md) · [可复制的前端交接 prompt](frontend-agent-prompt.md)
