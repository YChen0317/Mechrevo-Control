# Windows 实机联调

解压 GitHub Actions 的 Windows x64 联调包。已安装 0.2.0 后端时直接双击 `MechrevoControl.Frontend.exe`。新装时右键 `Install.cmd` 并以管理员身份运行，0.1.x 服务可双击 `Update.cmd` 更新。

确认窗口显示「实机」和当前硬件档位。记下起始档，点另一档并确认读回后切回。拔插电源可观察供电更新，关闭窗口后可以从托盘重新打开。服务断线时切档按钮禁用，旧快照标为过期。

使用 `--demo` 启动可进入演示场景和 OSD。实机热键和封装功耗待后端开放。

[共享协议](../contracts/v1.json) · [后端说明](../backend/README.md) · [后端实机验证](../backend/switch-validation.md)
