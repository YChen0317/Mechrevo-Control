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
