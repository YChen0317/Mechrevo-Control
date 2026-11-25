# Windows 后端 0.3.1

机械革命无界 14 MAX Dove4 Rev05 的实机基线。普通交互用户通过本机服务读取档位、供电、电量和 RAPL 封装功耗，并可请求平衡与性能两档切换。服务提供状态订阅、已识别的热键事件，以及睡眠唤醒后的重新采样和事件恢复。

- 新装时解压后端包，右键 `Install.cmd` 选择以管理员身份运行。已有旧版服务时双击 `Update.cmd`，同意 Windows 提权。
- 普通双击 `MechrevoCheck.exe` 查看服务状态、IPC 版本和源自实机的快照。输入 S 保存报告到桌面。
- 插电并关闭原厂控制中心窗口后，普通双击 `ServiceSwitchTest.cmd`，输入 SWITCH。工具经服务切到另一档、读回并恢复起始档。以 `Service switch test passed=True` 为通过。
- 右键 `Uninstall.cmd` 选择以管理员身份运行可移除服务。
- 在 Windows、.NET Framework 4.8 和 Windows PowerShell 5.1 环境，从本目录运行 `Build.ps1` 可构建设备服务和检测工具。

IPC 使用 `Mechrevo.Control.v1`。客户端按服务 ACL 请求读取、写入数据和同步所需的权限，提供 Identification 级别身份供服务检查。客户端请求示例见 `ControlService.cs` 的 `Request`。切档后刷新快照。断线恢复后，先读取实际档位再处理下一次用户请求。

[0.3.1 后端包](dist/Mechrevo-0.3.1.zip) · [IPC v1](../contracts/v1.json) · [切档实机记录](switch-validation.md) · [前端重写交接](../docs/frontend-handoff.md)

后端 ZIP SHA-256 `D350FD02E23DAB007DC5405297E28EBBFD798516AC6E3C86C63C2CC2D54688CD`
