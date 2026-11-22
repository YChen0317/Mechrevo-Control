# Dove4 Rev05 切档验证

0.1.1 已在 WUJIE Series、Rev05 上通过普通用户命名管道读取 performance，离电，电量 72%。Windows 服务以 LocalSystem 运行。普通用户直接查询 root/wmi 返回拒绝访问。

从同一台机器注册表读取 DSDT，SHA-256 为 `46CCAD1C826A0911A1D2C69BE98793521B24796F1AAB99292FFB37D57FDF6DD6`。十六进制文件偏移 0x23605 的 WMBB 方法将 Arg1 转成方法 ID，将 Arg2 转成整数。方法 1 的输入 1 和 2 均触发 EC PPMD 1，输入 3 触发 EC PPMD 2。方法 2 从输出字节偏移 2 返回 PPMD。方法 1 的 RTNC 成功值是 0。测试使用输入 1 和 3。

在空闲、插电时双击 SwitchTest.cmd，同意 Windows 提权。关闭原厂控制中心窗口，输入 SWITCH 后，脚本验证 BIOS 和 WMI 结构，记录起始 PPMD，切到另一档并独立读回，随后恢复起始档。桌面报告会记录每步结果。通过条件是确认另一档与起始档。原厂后台退出后的功耗对照是后续实机验收项。

## 2026-11-22 实机结果

| 路径 | 环境 | 结果 |
|---|---|---|
| 独立 Windows CIM | WUJIE Series，Dove4 Rev05，管理员会话 | getter 131072 → 65536 → 131072；Data=1 和 Data=3 的 setter 均返回 True、Data=0；恢复已确认 |
| 0.2.0 命名管道 | 同一台电脑，LocalSystem 服务，普通交互用户，插电 | 两次 setPerformanceMode 都返回目标档；中间快照读到 balanced；恢复到 performance；Service switch test passed=True |
| 只读快照 | 0.1.1 普通交互用户，离电；0.2.0 普通交互用户，插电 | ac=false/true，电量 72%/73%，mode=performance；直接 root/wmi 访问按权限被拒绝 |

测试时原厂控制中心窗口关闭，原厂后台组件未做停用对照。睡眠恢复、功耗对照、热键、前端联调有各自的验收项。
