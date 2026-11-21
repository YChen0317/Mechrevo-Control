# Dove4 快捷键、OSD、设备开关和灯光

范围为本机 BIOS Rev05、控制中心 5.56.1.24 和 EmOSDFunction 1.0.0.10。证据来自已安装程序的静态指令、实机设备与注册表枚举、用户提供的 WMI 枚举和随附 MSIX。同一功能有时同时包含固件动作、Windows 动作和单独的屏幕反馈。

## 路径与功能

| 功能 | 当前确认的实现 | 尚待实测 |
|---|---|---|
| 屏幕亮度 Fn | 实机有 Intel HID Event Filter。原厂 GCU 有 BacklightLevel、AC/DC BacklightLevelChanged 等背光控制符号。OSD 的已解出的事件图标中没有屏幕亮度项 | 采集亮度键的 HID/WMI 事件，确认 Windows 内建亮度处理的入口和该 GCU 模块是否参与 |
| 音量与扬声器静音 | EmOSD 的 AudioHelper 使用 NAudio CoreAudio，枚举或获取默认音频端点，可读写音量与静音 | 哪些物理键由 Windows 接收，哪些会调用 OEM 帮助方法 |
| 麦克风静音 | EmOSD 的 0xA1 事件分支调用音频帮助方法，处理采集端点静音，并在两个图标之间选择 | 逐键验证端点选择、静音指示灯及外接麦克风行为 |
| 飞行模式 | OSD RadioManager 的通用代码调用同目录 AirMode.exe。控制中心另带 root/VHIDMINI 虚拟 HID 软件包。本轮在已安装目录未找到 AirMode.exe，在已连接设备未看到该虚拟设备 | 确认本机飞行模式键是否经实际 HID Radio Control 或其他固件路径进入 Windows |
| 独立 Wi-Fi / 蓝牙 | WinUI QuickSwitch 的 Wi-Fi 和蓝牙分支更新 UI，通过 Setting/Control 发布请求。实机枚举 Intel AX211 与 Intel Wireless Bluetooth | GCU 消费消息后是设置无线电状态，还是改变设备启用状态。飞行模式还需单独追踪 |
| 触摸板 | WinUI 代码同时有 Windows 设备开关项和 OEM TouchpadToggle 项。后者有注册表状态，GCU 有初始化与更新符号。OSD 0x30/0x31 显示关/开。通用 AML WMCD 引用 GTPS/STPS | 需以本机热键与控制台开关的独立操作，核实是否共享同一状态，及是否用 PnP |
| Win 键 | WinUI 经 Setting/Control 发送开关。实机读到 WinKeyLock=0，GCU 有 WinKeyLock_Trigger 符号。近似 Lark4 平台有 WMI 独立实现 | 本机执行端及切档后的锁定机制，避免把其他机型的编码套入 |
| Fn 模式锁 | WinUI 经 Setting/Control。实机 FnKeyStatus=1。有 EmdAcpi_FunctionKey / WMBC 及通用 WMCD 路径线索。OSD 0x50/0x51 对应解锁/锁定图标 | 实测 Fn+对应键是否写入 WMBC、WMCD 或 EC 自行切换，及状态值的极性 |
| 睡眠按键 | Windows 当前插电和电池的睡眠按钮策略均是睡眠。实机提供 S0 低功耗待机和休眠 | 按键究竟从标准睡眠键事件还是 OEM 处理进入系统，需一次可恢复的按键观察 |
| 摄像头 | WinUI 有 Webcam 开关并通过 Setting/Control 发送。GCU 有 WebCamEnable 与提示符号，注册表有 ECWebCamSwitch=1。已枚举到历史 USB Camera 实例，采样时设备处于 Disconnected。EmOSD 通过 Win32_PnPEntity 查询摄像头类 GUID 与 USB/PCI 设备，并轮询变化 | 观察隐私控制开关两侧的 PnP 快照。只有结合驱动事件或固件代码才可区分断电、USB 逻辑断开、设备禁用以及其他原因 |
| OSD 开关 | QuickSwitch 通过 Setting/Control 请求。GCU 有 SetOSDHiddenREG，EmOSD 的 GetOSDState 读取 MySetting/OSDHidden，ShowOSD 载入时据该值隐藏窗口 | OEM OSD 关闭时 Windows 自带音量/亮度提示是否仍显示，及相同事件是否也由 GCU 的另一套托盘模块显示 |
| 键盘背光 | 原厂 OSD 将三个背光事件映射到关、半亮、亮。WinUI 含 Keyboard/Ctrl，固件有 WMBD、WMBF，通用 WMCD 也含 GKBT/SKBT。注册表 KeyboardSupport=1、KeyboardType=0，灯带支持标志为 0 | 实测三档的数值、是否实际使用 WMBD 或 WMCD、不同供电与唤醒时的行为 |

系统可通过 HID Radio Control 处理飞行模式键。该机制与本机实际事件来源是两个独立问题。[Microsoft 飞行模式 HID 文档](https://learn.microsoft.com/en-us/windows-hardware/drivers/hid/airplane-mode-radio-management)  
Lark4-LNL 的 Emdoor Linux RFC 记录了热键、Fn/Win 锁、触摸板和来电自启。该研究是近似平台的对照资料。[Emdoor Intel EWMI RFC](https://lists.openwall.net/linux-kernel/2026/11/13/3408)

## EmOSD 提示的执行顺序

EmOSDFunction.exe 在 root/WMI 订阅 OemWMIEvent。固件 _WDG 中对应 D0 事件。监听回调从属性 Force 取整数并转给 MainWindow。窗口通过 WPF Dispatcher 切到 UI 线程，关闭旧的提示，新建置顶 ShowOSD，按代码选取内置图片并通过 DispatcherTimer 关闭。普通提示定时器常量为 1000 ms，刷新率分支为 4000 ms。摄像头还有独立的 PnP 轮询，状态变化调用同一提示处理器，摄像头提示编号是内部合成的。

| Force 或内部编号 | 图标与行为 |
|---|---|
| 0x20 / 0x21 / 0x22 | 键盘灯关 / 半亮 / 亮 |
| 0x30 / 0x31 | 触摸板关 / 开 |
| 0x41 / 0x42 | 两个性能模式的提示资源 |
| 0x50 / 0x51 | Fn 解锁 / 锁定 |
| 0xA1 | 麦克风静音路径 |
| 0xA2 | 60/120 Hz 分支，读取及调整显示刷新率后选择对应提示 |
| 4000 / 4001 | 摄像头开 / 关的轮询提示 |

这是原厂代码的解码映射。待实机按键采集确认每个代码能否在本机产生。WinUI 还订阅 OSD/Status，GCU 包含自有提示代码，因此发现两条软件提示路径。

## 背光熄灭计时

WinUI 的 LightViewModel.SetCloseTime 将下拉选项转成秒数。程序集支持 10、15、20、30、45 秒，1、2、5、10、20、30 分钟，1、2、3 小时，以及 0 表示关闭自动计时。设置后向 Setting/Control 发送 KEYBOARD_LIGHTBAR_TIMER_ON 和数值，或 KEYBOARD_LIGHTBAR_TIMER_OFF。当前注册表 CloseTimer=0。GCU 包含 SetKeyboardCloseTime、StartCloseTimer、CloseTimer_Elapsed 和键盘亮度/电源事件处理符号，说明后台具备软件定时逻辑。是否还同步 EC，及是否在 OEM 服务退出、系统锁屏和睡眠恢复后继续计时，尚需对照测试。计时是键盘灯和灯带功能复用的命令名，与系统进入睡眠的计时分开。

## 可能未显示的本机功能

| 候选 | 本机证据与范围 |
|---|---|
| 60/120 Hz 快捷切换 | 本机已安装 OSD 有具体刷新率处理和两张提示图。已从本机 EDID 核实 60 Hz 和 120 Hz，实际按键切换尚待验证 |
| 自定义电池限充与电池详情 | 本机已回读独立的限充及充电模式接口。电池明细类还包含基本信息、实时数据、寿命容量及电芯电压方法。独立阈值控制与原厂界面的三个预设之间的关系仍待实测 |
| 来电自启 | 本机 WMI 类 AutoPowerOn 和控制中心 AcRecoverySwitchSupport=1 同时存在，AcRecoverySwitchBiosSupport=0。应区分 UI 后台路径、BIOS 设置入口与实际 AC 恢复条件 |
| 风扇和传感器 | WMI 已公开风扇转速、CPU 温度、EC/PD 版本、USB-C VBUS 与盖子状态。风扇控制接口也存在，可用风扇数量、单位和方式尚待读取 |
| 固件专用能力 | 本机公开 LED、PXE、出货模式、加载默认、Secure Boot 和 ME 解锁类。确认的是接口存在。保养、制造或设置用途的接口不作为日常功能逐个执行 |
| 通用页面按机型隐藏 | WinUI QuickSwitch 有数字区、Copilot、局部调光和麦克风降噪等支持筛选。实机 NumPadSupport=0、LightbarSupport=0、RGBLightbarSupport=0、LiquidCoolingSupport=0、TurboModeSupport=0。部分其他通用标志为 1，仍须和设备枚举交叉核对 |

本轮未切换设备或设置。现有信息可确定 UI、服务、WMI 和记账状态的主要边界。要确认每个物理按键和摄像头电控，需要下一轮配对事件、状态与实际设备变化。

## 摄像头开关实机对照

用户打开摄像头开关后，同一个 USB Camera 功能节点 `USB\VID_1BAF&PID_28C8&MI_00` 从此前的 Disconnected 变为 Started。开启态同时枚举到上游 USB Composite Device，服务为 usbccgp。摄像头功能节点使用微软 usbvideo.inf 和 usbvideo 服务。机械革命的扩展 INF oem52.inf 为 MEP Camera Opt In，相关安装节把 FSMEnableMsEffects 设为 1。该节提供 Windows 摄像头效果配置。

两次采样的 ECWebCamSwitch 均为 1，因此这个注册表值在本次对照中无法反映实际可见性。原厂 OSD 实际通过 PnP 设备是否存在来显示摄像头开关。设备节点从断开到启动表明开关改变了摄像头的 USB 枚举状态。用户再次关闭同一个开关后，复合设备与 Camera 功能节点均显示 Disconnected，已连接设备查询无匹配，上游 USB 根集线器仍为 Started。这确认了整个摄像头 USB 复合设备随开关退枚举。ECWebCamSwitch 仍为 1。

固件 ACPI 表 I2Pm_Rvp 中有 CAMERA_V3P3、CAMERA_V1P8 标签。当前尚无调用证据把这两个电源标签和此 USB 摄像头开关关联。即使复合节点整体退枚举，也需进一步区分断电、端口隔离和其他导致 USB 断开的实现。

## 实机固件按键分派

DSDT 的 EC 查询方法和已安装 OSD 的编号可以直接对照。以下是静态分派。实际按键组合、机器型号的键帽布局与 Windows 同时产生的其他事件仍待采集。

| ACPI 方法 | BIOS 行为 | 软件中的对应 |
|---|---|---|
| _Q06、_Q07、_Q08 | 调用 Intel HIDD.HPEM，参数分别为 0x14、0x13、0x08。HPEM 写 HIDX 并通知 HIDD 0xC0 | Intel 公开驱动将 0x14 和 0x13 映射为亮度降低和升高。0x08 已定位到 Intel HID 路径，其本机键位需配对核实。[Intel HID 事件驱动](https://github.com/torvalds/linux/blob/master/drivers/platform/x86/intel/hid.c) |
| _QF4 | 根据 EC PPMD 1/2 设 EWMI 载荷 0x41/0x42、更新 ODV0 并通知 IETM，随后发出 EWMI D0 | 原厂 OSD 显示平衡或性能，同时固件通知平台热管理 |
| _QF5 | EWMI D0 载荷 0xA2 | 刷新率切换路径 |
| _QF6 | 根据 ECA0，EWMI D0 载荷 0x51 或 0x50 | Fn 锁提示 |
| _QF7 | 切换 I2C1.TPD0.TPEN，通过 CMSW 传递状态，再发出 EWMI D0 载荷 0x31 或 0x30 | BIOS 自身已更改触摸板状态，原厂 OSD 提示开或关 |
| _QAD | 切换同一个 TPEN 并写入 ECB9 | 存在另一条触摸板路径，需确认哪个实体键或条件触发 |
| _QF8 | EWMI D0 载荷 0xA1 | EmOSD 通过 Windows 音频端点处理麦克风静音并显示反馈 |
| _QF9 | 根据固件 TIZT 状态，EWMI D0 载荷 0x20、0x21 或 0x22 | 键盘灯关、半亮、亮的提示 |
| _Q99 | EWMI D0 载荷 0xA0 | 已检查的 ShowOSD 分支中未找到对应图标，动作待验证 |
| _Q54 | 若存在 ACPI 电源按钮设备 PWRB，向它发 0x80 通知 | 固件中存在独立的电源按钮路径，无法由此认定 Fn 睡眠键也使用它 |
| _Q0C、_Q0D | 更新盖子状态，通知显卡和 LID0 | 固件有独立的盖子状态事件 |

## 屏幕和当前设备

Windows 枚举到内置面板 VXN03E8。其 EDID 的 DisplayID Type VII 详细时序包含 **2880×1800 @ 60 Hz 和 120 Hz** 两组。原厂 OSD 固件分派和屏幕能力已同时确认，快捷键实际切换仍待观察。[DisplayID 时序解析参考](https://code.googlesource.com/linux/torvalds/linux/%2B/4bf54e47525dcacd4c6cdd97fb5902592414dd7a/drivers/gpu/drm/drm_edid.c)

本机当前枚举到 Intel Arc 140V、Realtek Audio、Intel Smart Sound、指纹设备、AX211 Wi-Fi、Intel Bluetooth、标准 ACPI 电池和适配器。系统无线电、WLAN、蓝牙服务均在运行。当前显示设备列表没有独显，控制中心 DGpuDirectConnectionSupport=1 不能单独证明本机有独显直连功能。系统当前摄像头重新处于连接状态。

## 物理按键实测

管理员 PowerShell 监听 OemWMIEvent 时，用户实际按了亮度、音量、Fn 锁、触摸板、麦克风和键盘灯键。未找到刷新率快捷键。结果如下。

| 实测编号 | 与静态路径对应 |
|---|---|
| 0x50、0x51 | Fn 解锁、锁定。两个方向均实际触发 |
| 0x30 | 关闭触摸板。随后读取原厂 TouchpadToggle 为 0 |
| 0xA1 | 麦克风静音热键。未同时采集音频端点状态 |
| 0x22 | 键盘灯高档提示。其余两档得自静态映射 |
| 无事件 | 用户按下亮度和音量键时，此订阅没有收到厂商 OemWMIEvent。亮度另有已定位的 Intel HID 路径。Windows 也枚举到 Intel HID Consumer Control 集合，音量是否来自其中某个具体集合仍待按键采集 |

后续的 PnP 枚举发现 Intel HID INTC816 的集合包括 Generic Desktop Wireless Radio Controls（usage page 1、usage 0x0C）及 System Control（usage page 1、usage 0x80）。系统同时公开 ACPI Sleep Button（PNP0C0E）。结合原厂虚拟 HID 未枚举的事实，Windows 有可用的原生飞行模式和睡眠输入路径。但仍需要逐键验证哪个集合发送报告、系统是否执行对应动作。刷新率功能的固件事件、程序和面板能力均已确认，实体触发组合未知。

## 键盘背光计时实测

用户在原厂灯光页选 10 秒并让键盘闲置。约 9.6 秒后背光熄灭，按普通键后背光重新亮起。这验证了原厂设置可在本机生效，以及普通键盘活动能恢复背光。随后读取原厂注册表 CloseTimer 为 10。尚未验证该设置能否跨重启保持，以及退出原厂后台后的表现。
