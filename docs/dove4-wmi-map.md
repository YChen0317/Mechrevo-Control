# Dove4 实机 WMI 类与 ACPI 方法

管理员 PowerShell 5.1 的本机类枚举与 BIOS Rev05 的 DSDT _WDG 描述符按 GUID 匹配。名称来自 Windows 实机输出，方法标识来自 DSDT。下表覆盖此次枚举的 22 个类。

| WMI 类 | ACPI 标识 | Windows 方法 |
|---|---|---|
| AcpiTest_EcLid | WMAA | SetEcTestMode, GetLidStatus |
| EmdAcpi_LoadDefault | WMAC | LoadDefault |
| EmdAcpi_ECInformation | WMAD | GetEcVersion, GetPdVersion, GetCpuTemperature |
| EmdAcpi_LedControl | WMAE | LedControl |
| EmdAcpi_FanControl | WMAF | GetFanSpeed, FanControl, GetFanSpeedByAPP |
| EmdAcpi_GetTypeCVBUS | WMBA | GetTypeCVbus |
| EmdAcpi_PowerPlanMode | WMBB | SetPowerPlanMode, GetPowerPlanMode, PowerPlanMode |
| EmdAcpi_FunctionKey | WMBC | FunctionKey, GetFunctionKeyStatus, FunctionKeyByAPP |
| EmdAcpi_Keyboard_BackLight | WMBD | Keyboard_BackLight, Keyboard_BackLightByAPP |
| EmdAcpi_Battery_Charge_Mode | WMBE | Battery_Charge_Mode, Get_Battery_Charge_Mode |
| EmdAcpi_Keyboard_BackLight_Status | WMBF | Keyboard_BackLight_Status |
| EmdAcpi_SetSecureBoot | WMCA | SetSecureBoot |
| EmdAcpi_AutoPowerOn | WMCC | AutoPowerOn |
| OemWMIMethod | WMCD | OemWMIfun |
| EmdAcpi_MEUnlock | WMCE | MEUnlock |
| EmdAcpi_ShipMode | WMCF | GetShipModeFlag, SetShipModeFlag |
| EmdAcpi_BatteryChargeRationing | WMDA | GetBatteryChargeRationing, SetBatteryChargeRationing |
| EmdAcpi_BatteryInfo | WMDB | GetBatteryBasicInfo, GetBatterySN, GetBatteryRealtimeInfo, GetBatteryLifecapacity, GetBatteryCellVoltage |
| EmdAcpi_SetPxeControl | WMDC | SetPxeControl, GetPxeControl |
| OemWMIEvent | D0 事件 | 待解析事件负载 |
| EmdAcpi_WmiEvent | D1 事件 | 待解析事件负载 |
| EmdAcpi_NotifiyUSBOC | D3 事件 | 待解析事件负载 |

## 限充的两条接口

BatteryChargeRationing 与 Battery_Charge_Mode 是两个独立的类，对应 WMDA 与 WMBE。WMDA 的 AML 读取分支通过 EC 读取 MICP、MXCP，将值分别放入返回字段 ECVN、ECVM。另一分支会写 MXCP 和相邻的 MICP，后者用输入值减 1 计算，再读回 MXCP 判定状态。由此可以确认 AML 会读写 EC 字段。Windows 参数类型、值的含义、边界条件、掉电保持和实际停充都还需要本机验证。WMBE 引用了独立的 EC 字段 EBCM。不能把其模式值与 WMDA 的阈值字段互换。

## 性能与风扇

固件同时提供 WMBB 专用性能档位方法和 WMCD 通用命令接口。WMBB 引用 PPMD、ODV0、IETM、CMSW。WMCD 的方法引用包括 GPFM、SPFM、GTPS、STPS 等内部函数。之前对 EmOSDFunction 的静态分析确认它的 WMIHelper 通过 WMCD 读写档位。Windows 厂商 WMI 类的存在不能确定 WinUI 发送的哪条 MQTT 消息最终调用 WMBB 或 WMCD。WMAF 引用 F1RL/F1RH 和 F2RL/F2RH，表明固件方法包含两组风扇测量字段。是否装有两路可读风扇、计算关系和转速单位仍需实机返回值确认。

本轮未调用任何写入方法。功耗限制数值、事件负载、返回字段在 Windows 的投影及持久化行为待验证。

## 读取参数与方法分派

管理员实机查询显示，GetBatteryChargeRationing、Get_Battery_Charge_Mode 和 GetPowerPlanMode 均声明 UInt64 类型的 Data 输入。DSDT 中，这三个读取分支按 WMI 方法编号分派，读取分支不取用输入缓冲区。因此，在 Windows 的 WmiMethodId 与下表匹配时，Data 可传 UInt64 的 0 作为占位。方法编号仍需通过 Windows 元数据核实。

| ACPI 方法 | 读取分支编号 | 返回缓冲区 |
|---|---:|---|
| WMDA | 1 | 偏移 0 的状态字段，偏移 2 读取 MICP，偏移 3 读取 MXCP |
| WMBE | 2 | 偏移 0 的状态字段，偏移 2 读取 EBCM |
| WMBB | 2 | 偏移 0 的状态字段，偏移 2 读取 PPMD。读取分支还经 CMSW 写入通信字段 CMS0、CMS1。该分支没有写 PPMD |

返回缓冲区的字段位置来自 AML。Windows 如何将该缓冲区投影到 CIM 属性，需以实机输出为准。实机返回值见下节。

## 管理员会话实测

Windows PowerShell 5.1 中，三个方法的 WmiMethodId 与上述 AML 分支编号相符。调用活动实例并传入 UInt64 的 0，结果如下。

| 方法 | WmiMethodId | ReturnValue | 返回 Data | 按 AML 解码 |
|---|---:|---|---:|---|
| GetBatteryChargeRationing | 1 | True | 0 | 固件状态 0，MICP 0，MXCP 0 |
| Get_Battery_Charge_Mode | 2 | True | 0 | 固件状态 0，EBCM 0 |
| GetPowerPlanMode | 2 | True | 131072 | 0x0000000000020000。固件状态 0，PPMD 2 |

Data 同时是输入占位与调用返回字段。性能值 0x20000 对应小端缓冲区偏移 2 的 02，验证了字段位置。原厂设置的 ModeSet 紧接这次采集仍为 2，与此前已标记为性能的状态一致。随后通过原厂界面切到平衡，GetPowerPlanMode 返回 True 和 Data 65536，即 0x0000000000010000。偏移 2 为 01，确认本机 PPMD 的映射为 1 = 平衡、2 = 性能。这也与原厂 ModeSet 的两档记录一致。该读取方法返回档位标识，未返回 PL1、PL2 或时间窗口。固件返回的零阈值和零模式仅描述这一次采样，尚未通过改变原厂电池保护配置或观察电流证实它的行为含义。

驱动包中找到 Intel IPF 的 dsp.dv、DTT 的 AdaptivePerformance、IntelligentThermalManagement 和 PowerBoss 等策略模块，以及 Lunar Lake PPM 配置包。这些文件支持继续追踪平台策略。包内存在某个策略模块并不能确定不同档位的 PL1 或 PL2。

## 本机控制台没有电池保护入口

用户检查原厂控制台后确认，本机界面没有电池保护选项。随附 WinUI 程序的通用电源页仍包含 BatteryProtection/Control 以及 Healthy、Balanced、Performance 请求代码。静态反编译确认该页面存在机型与支持值判断，但目前未定位控制这组预设可见性的具体条件。原厂后台程序仍含阈值读写方法名。上述程序证据和实机界面结果均已保留。

独立固件读回已验证。两档插电和离电双烤下，WMDA 的 MICP/MXCP 及 WMBE 的 EBCM 都为 0。这些样本未切换限充设置。AML 显示 WMDA 设置分支把输入低字节传给 MXCP，并把减一结果传给 MICP。该分支未见对输入零值的单独处理，且其成功检查针对 MXCP 读回。通过该 setter 写入 0 是否能恢复原先的两个 0，尚未证实。应先核实字段的边界和恢复语义，再考虑一次受控写入验证。当前没有写入限充值，也没有证实设备会在某个百分比停充。
