# Dove4 Rev05 切档验证

0.1.1 已在 WUJIE Series、Rev05 上通过普通用户命名管道读取 performance，离电，电量 72%。Windows 服务以 LocalSystem 运行。普通用户直接查询 root/wmi 返回拒绝访问。

从同一台机器注册表读取 DSDT，SHA-256 为 `46CCAD1C826A0911A1D2C69BE98793521B24796F1AAB99292FFB37D57FDF6DD6`。十六进制文件偏移 0x23605 的 WMBB 方法将 Arg1 转成方法 ID，将 Arg2 转成整数。方法 1 的输入 1 和 2 均触发 EC PPMD 1，输入 3 触发 EC PPMD 2。方法 2 从输出字节偏移 2 返回 PPMD。方法 1 的 RTNC 成功值是 0。测试使用输入 1 和 3。

在空闲、插电时双击 SwitchTest.cmd，同意 Windows 提权。关闭原厂控制中心窗口，输入 SWITCH 后，脚本验证 BIOS 和 WMI 结构，记录起始 PPMD，切到另一档并独立读回，随后恢复起始档。桌面报告会记录每步结果。通过条件是确认另一档与起始档。原厂后台退出后的功耗对照是后续实机验收项。
