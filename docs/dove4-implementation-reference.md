# Dove4 控制台实现底稿

适用机器为无界 14 MAX、Intel Core Ultra 7 256V、Dove4 Lunar Lake，已验证 BIOS 为 WUJIE14Max_Dove4_LNL326_MC_OLED_Rev05。原厂控制中心 5.56.1.24，EmOSDFunction 1.0.0.10。此页供后续设计 UI 和设备后端参考。

| 功能 | 可用依据 | 后续实现需要的验证 |
|---|---|---|
| 两档性能模式 | 管理员 Windows WMI 的 EmdAcpi_PowerPlanMode.GetPowerPlanMode 已实测。Data 偏移 2 的 1 为平衡、2 为性能。原厂 OSD 的 OemWMIMethod 也有档位读写路径。双烤稳定约 17 W 和 30 W | 原厂切档已验证。自建后端的写入权限、返回状态和输入映射仍需受控验证。PL1、PL2 的精确值属于独立研究项 |
| 风扇与温度 | 已实测两个风扇原始读数、EC 温区读数，以及 Windows 封装功耗和频率计数器 | 扇速单位与温区含义。风扇控制需核实有效范围和恢复自动模式 |
| 电池与供电 | Windows BatteryStatus 已读到供电和充放电状态。厂商 WMI 已成功读到 MICP、MXCP、EBCM 和 USB-C VBUS 原始值 | 本机原厂界面无限充入口。独立写阈值前需确认边界、恢复原状态和实际停充。电芯数据的方法仍需复核 |
| 键盘背光 | OEM 事件解码有关闭、半亮、高档。实测高档事件 0x22。可从 WMBD、WMBF 或 WMCD 继续确认背光操作 | 三档的直接读写映射。10 秒熄灭与按键恢复已实测，原厂计时经 Setting/Control 配置 |
| Fn 锁、触摸板、麦克风 | 原厂事件 0x50/0x51、0x30、0xA1 已实测。固件切换触摸板后发通知。麦克风静音由原厂热键程序调用 Windows 音频 | 实现前确认各接口分别承担动作还是告知状态，避免对固件已执行的事件重复切换 |
| OSD | 原厂程序监听 OemWMIEvent.Force，按编号选择提示。OSDHidden=1 已实测隐藏提示 | 自定义提示可使用同一事件源。现有代码还处理部分热键动作，替换时应分别接管动作和反馈 |
| Wi-Fi、蓝牙、屏幕与音量 | 原厂无线开关与 Windows 设置同步。亮度已定位 Intel HID 路径，音量使用 Windows 音频栈的证据见热键研究。面板 EDID 确认 2880×1800 的 60/120 Hz | 优先按 Windows 标准能力建模，必要时观察独立开关的状态回报 |
| Win 键锁、摄像头 | WinKeyLock=1 时实测 Win 键无反应。摄像头开关会使整个 USB 复合设备退枚举。PnP 适合检测摄像头当前是否可用 | Win 键的独立执行接口仍待查。摄像头开关的独立控制路径未验证 |

优先使用 Windows 自带的 WMI/ACPI、音频、显示与无线接口。该机型的 HWMI 绑定微软 wmiacpi.sys，已有多项固件读取通过管理员会话验证。待实现具体功能时，再判断是否需要额外服务或设备驱动。原厂通用包带有其他机型路径，涉及写入的接口须按本机固件与方法编号核实。

细节见[原厂接口与运行路径](dove4-interfaces.md)、[WMI 类与固件方法](dove4-wmi-map.md)、[双烤数据](dove4-mode-measurements.md)和[热键与灯光](dove4-hotkeys-and-lighting.md)。
