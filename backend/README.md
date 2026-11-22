# Windows 后端 0.2.0

首版支持 Dove4 Rev05 两档切换，安装后普通交互用户可通过本机服务读状态和切档。

- 新安装时解压发布包，右键 `Install.cmd` 选择以管理员身份运行。已安装 0.1.x 时双击 `Update.cmd`，同意 Windows 提权。
- 普通双击 `MechrevoCheck.exe` 显示服务状态、命名管道协议版本、硬件档位、供电和电量。输入 S 保存报告到桌面。
- 插电、关闭原厂控制中心窗口后，普通双击 `ServiceSwitchTest.cmd` 并输入 SWITCH，会切到另一档、读回并恢复起始档。以 `Service switch test passed=True` 为通过。恢复失败时控制台会提示通过原厂控制中心恢复起始档。
- 右键 `Uninstall.cmd` 选择以管理员身份运行可移除服务。
- 在 Windows、`.NET Framework 4.8` 和 Windows PowerShell 5.1 环境，从本目录执行 `Build.ps1` 可重新编译检测程序和服务。

IPC 使用 `Mechrevo.Control.v1`。原生客户端打开管道时申请读取数据、写入数据及同步所需的权限，保留允许服务识别客户端身份的安全服务质量设置。C# 客户端可参考 `ControlService.cs` 的 `Request`。切档调用等服务确认后刷新快照，遇到断线时先重连并读取当前档位。

[协议](../contracts/v1.json) · [实机验证记录](switch-validation.md) · [0.2.0 发布包](dist/Mechrevo-0.2.0.zip)

ZIP SHA-256 `F25AB0590E5F6B111FC286455814FDCFF6CDFB806F2EC2534329C62CFA3BD6E3`
