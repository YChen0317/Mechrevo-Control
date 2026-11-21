# 原厂功能、固件通信与充电限制可行性

研究对象是无界 14 MAX 系列 Intel Core Ultra 7 256V，BIOS 标识为 `WUJIE14Max_Dove4_LNL326_MC_OLED_Rev05`，随附控制中心为 5.56.1.24。本次采用只读调查。适配依据包括随附 MSIX 的 .NET 指令和符号、服务程序、驱动 INF、系统设备枚举以及本机 ACPI 表。

## 功能与实现依据

| 功能 | 在原厂软件中找到的依据 | 对本机的判断 |
|---|---|---|
| 性能模式 | 首页切档命令有 Office、Gaming、Turbo、Customize 分支。请求经发送队列进入 MQTT 发布函数，随后更新界面档位 | WinUI 发送逻辑已确认。服务端应用的功耗值、可选档位及电池供电时的限制待实测 |
| 温度、风扇和系统监测 | 首页包含监控启动、停止及 CPU、GPU、风扇等区域。后台含多个平台风扇管理类及 SetFanMode | 可确定软件按平台组织风扇功能。转速读取来源、风扇数量和可调范围尚待验证 |
| 电池保护 | 电源页通过 BatteryProtection/Control 请求当前状态，也能选择 Healthy、Balanced、Performance。服务端含 BatteryProtection_Status 与充电上下限相关符号 | 原厂预设具备前端实现。尚无本机预设数值、能力回报或停充曲线 |
| 电池信息 | 电量、健康、循环次数、剩余时间、容量和当前功率具有界面字段，后台有容量与寿命读取函数 | 界面按支持标志显示部分字段。校准有界面文本，执行流程待核实 |
| 电源策略 | 电源页含 Type-C 充电或性能优先、深度睡眠、USB 充电和高性能开关相关项。高性能开关进入 PowerSwitching。安装包另含电源配置包 | 各开关的能力标志、配置包实际部署情况和策略值待核实 |
| 显示与 GPU | 存在 DisplayViewModel、GpuSettingPageViewModel，安装目录含显示工具、GPU 信息与 NVIDIA 设置库 | 证明通用包覆盖这些模块。具体面板控制、独显功能要按本机硬件判断 |
| 自定义性能与外设 | 有自定义设置、超频子模式和液冷页面。液冷风扇命令可追踪到消息发送队列 | 外设和对应机型能力决定可用性 |
| 灯效 | 键盘灯、灯带同步、转轴与 Logo 灯各有界面模型 | 数据模型存在。本机灯区、颜色、控制接口待验证 |
| 快捷控制与维护 | 有 QuickSwitch、托盘、OSD、快捷键相关符号，以及 OTA 和系统辅助程序 | 后台职责线索明确。各热键及更新流程尚未逐项验证 |

## 固件通信

1. **前端到后台。** 已读到 WinUI 的档位与电池保护方法构造消息并经发送队列发布到 MQTT。已观察到 GCUBridge 和 GCUService 运行。消息接收方与最终固件操作间缺少运行时证据。
2. **厂商 ACPI 驱动路径。** 安装目录的 UWACPIDriver.inf 声明匹配 `ACPI\INOU0000`，服务名为 UWACPIDriver，对应 UWACPIDriver.sys。ACPIDriverDll.dll 含 CreateFileW 和 DeviceIoControl 名称，与通过设备句柄请求驱动操作相符。实机查询该服务返回 1060，ACPI 枚举中也未找到该硬件 ID。因此这是一条随包提供的设计路径，尚不能认定本机使用它。
3. **本机 ACPI 证据。** 系统注册表可读出的 DSDT 表为 164143 字节，其中可检出 _BST、_DSM、ECRW 和 PNP0C14 等字串。系统枚举含 PNP0C09、PNP0C0A、PNP0C14，分别对应嵌入式控制器、电池和 ACPI-WMI 设备类型。字串检索无法定位 AML 方法所属设备、参数或调用者，也无法说明 ECRW 与充电有关。确认实际链路需要关联 DSDT/SSDT 中的设备、已绑定驱动以及原厂操作时的事件。[微软 ACPI 控制方法说明](https://learn.microsoft.com/en-us/windows-hardware/drivers/acpi/evaluating-acpi-control-methods)
4. **UEFI 变量路径。** 随包 UEFI_Firmware.dll 中出现 GetFirmwareEnvironmentVariableW 和 SetFirmwareEnvironmentVariableW。这提供了读写 UEFI 变量的线索。尚无证据把这条路径与充电限制、风扇或任一具体设置相连。

## 充电限制设计

**预设模式是最值得先实现的功能。** 原厂界面已经定义查询与切换流程，可先设计沿用原厂后台的适配器。执行前读取当前模式，应用后重新查询，界面分别显示请求值、后台报告值和实际充电状态。连接中断或读回失败时显示状态未知，避免把用户选择当作已生效。该方案仍依赖原厂服务。

**自定义百分比有明确线索。** GCUService.exe 的符号包含 SetBatteryChargingLimit、SetBatteryChargingLimit_Up 和 SetBatteryChargingLimit_Down。它们提示通用服务可能处理阈值，但符号不足以确定其所属平台、允许范围、步长、上下限含义或固件是否采纳。应在获得本机支持的阈值范围和读回证据后再开放数值输入。完全脱离原厂服务需要另外确认本机驱动接口和固件方法。

**验收分三层。** 首先记录原始模式和供电条件，用原厂界面切换单个预设，核对后台读回并恢复。其次从低于目标上限的电量开始，连续记录插电状态、电量和可用的充电功率或充电状态，观察到达上限后停充，以及电量自然下降后何时恢复；电量已经高于设定值时也需单独测试。最后复测拔插适配器、睡眠唤醒、重启和恢复原设置，分别记录策略是否保持。具体百分比应由本机实测给出。

其他无界型号的研究记录了设置值与 EC 实际停充行为不一致的情形，可用作设计验收实验的参考。该研究对象是 14XA，寄存器地址与固件版本不适合作为本机参数。[14XA 充电限制研究](https://gist.github.com/w568w/957976b59906e0ce5d6c13ad342e1593)
