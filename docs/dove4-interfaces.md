# Dove4 原厂接口与运行路径

范围是本机 BIOS `WUJIE14Max_Dove4_LNL326_MC_OLED_Rev05`、EmOSDFunction 1.0.0.10 和随附 WinUI 包 5.56.1.24。本页记录已找到的接口和对应证据。固件方法的实机返回值、运行时消息内容和 EC 内部逻辑仍有待核实。

## 组件与调用方向

| 层 | 已确认的接口或现象 | 尚待确定 |
|---|---|---|
| WinUI 原厂控制台 | ViewModel 构造主题和请求，发送队列委托给 MQTTDataService。状态主题涉及风扇、设置、键盘、灯效、显示、触控板区域、游戏配置和 OSD | 本机启用的订阅、消息负载、状态回传来源与错误码 |
| GCUBridge | 实机运行，服务配置为自动启动。其 PID 监听 TCP 13688，绑定到 0.0.0.0 | 将监听端口与客户端握手关联。监听绑定本身无法判断防火墙是否允许外部连接 |
| GCUService | 实机运行。静态可定位不同风扇管理器和电池保护接口，多个相关方法在磁盘中只有异常占位 | 谁消费各主题、如何选择本机配置、如何桥接具体硬件 |
| EmOSDFunction 和 EmOSDFunctionService | 两个进程同时运行，后者是自动启动的服务。前者程序包含直接调用 WMI 的帮助类，以及独立的 Windows 电源模式监听和切换函数 | 哪些 Fn 输入会进入哪个分支、两个进程如何传递事件 |
| Windows 电源层 | 两次切档时 OEM 的 ModeSet 从 1 变为 2，Windows 活动计划和有效 overlay GUID 均相同。OSD 另有 PowerGetEffectiveOverlayScheme、PowerSetActiveOverlayScheme 和电源通知接口 | 两者在其他电源条件下是否同步，Intel IPF/DTT 如何施加功耗与热管理约束 |
| ACPI 固件 | 本机 HWMI 设备绑定 Microsoft wmiacpi.sys。DSDT 中找到三个 _WDG 表，共 28 条描述记录 | WMI 类与 GUID、AML 方法及 EC 操作之间的逐项映射 |
| UEFI 与备用驱动 | 通用包另有 UEFI 变量 API 线索与匹配 INOU0000 的 UWACPIDriver。此前实机未枚举到该 INOU 设备，也未安装对应服务 | UEFI 模块实际调用者、读写变量与适用机型 |

部分已确认主题包括 `Fan/Status`、`Setting/Status`、`Setting/Control`、`BatteryProtection/Control`、`Keyboard/Status`、`Display/Status`、`TouchPadWorkArea/Status` 和 `OSD/Status`。主题存在表明客户端含相应代码。机型是否支持需结合实际状态回报和事件验证。

## OSD 厂商 WMI 协议

反汇编安装后的 EmOSDFunction.exe，确认 WMIHelper 枚举 `root\wmi` 中 Active 为 TRUE 的 OemWMIMethod 实例，调用 OemWMIfun，参数名 u8Input，返回字段 u8Output。当前已看到的调用构造 64 字节数组。帮助方法接受至少 4 字节的返回。类初始化将 Success 设为 0，Failure 设为 1。

| 操作 | 输入前缀 | 静态结果 |
|---|---|---|
| 读取档位 | `03 09 00 00` | 原厂方法把返回第 2 字节的 1、2 原样返回，其他值映射到 3。界面截图与注册表实测支持 1 为平衡、2 为性能，仍需核对固件读回 |
| 设置档位 | `03 0A <档位> 00` | 原厂方法用返回第 1 字节判断成功 |
| 风扇速度 | 组 03，子命令 0F | 已确认存在调用。还需核实调用路径、参数单位与本机支持状态 |
| 键盘背光 | 常量 0B、0C | 原厂常量名分别标识读取和设置。当前证据限于常量，尚缺本机调用与实际效果 |

本轮只做静态检查、监听端口枚举及只读查询。Codex 工具进程的管理员角色检查返回 False，root/wmi 查询仍报访问拒绝。未验证固件返回。

## 电池限制线索

实机 DSDT 中的 `6b40a935-7fef-42b6-b08d-6c79b57d6c35` 是对象 DA 的 ACPI-WMI 方法记录。其他无界机型的公开研究把相同 GUID 前缀关联到 EmdAcpi_BatteryChargeRationing。与此前仅有的同品牌经验相比，本次发现了可在本机固件表定位的候选接口。接下来以本机 WMI 类的 GUID 限定符、实例和只读方法核实身份。完整报告需继续追踪 DA 的 AML 实现、值的单位、存储位置和实际停充行为。[其他无界机型的 WMI 记录](https://github.com/Leo-stro/mechrevo-charge-limit)

## DSDT WMI 描述符清单

从注册表提供的本机 DSDT 中提取 AML Name/Buffer 形式的 _WDG 表，按每条 20 字节解码。标志 2 表示方法，标志 8 表示事件。本节仅覆盖该 DSDT 中识别出的表，整机还可能通过 SSDT 提供其他记录。[Linux 内核 ACPI-WMI 接口文档](https://docs.kernel.org/wmi/acpi-interface.html)

```text
WDG offset 112822 length 60
2bc49def-7b15-4f05-8bb7-ee37b9547c0b DE instances=1 flags=2
a6fea33e-dabf-46f5-bfc8-460d961bec9f D0 instances=1 flags=8
05901221-d566-11d1-b2f0-00a0c9062910 CC instances=1 flags=0
WDG offset 114167 length 40
1f13ab7f-6220-4210-8f8e-8bb5e71ee969 DE instances=1 flags=2
05901221-d566-11d1-b2f0-00a0c9062910 CC instances=1 flags=0
WDG offset 130745 length 460
05901221-d566-11d1-b2f0-00a0c9062910 AB instances=1 flags=0
72ccf8d6-ff88-4b77-aed9-702724da0925 AA instances=1 flags=2
c60b0bc4-b53b-41a6-9d24-51e33c742906 AC instances=1 flags=2
861f913e-1b25-41e5-b4dd-d1fd9091713f AD instances=1 flags=2
971f2336-4433-4124-8b8e-28fb454e88aa AE instances=1 flags=2
d06385de-bc53-4b9b-85dc-674936d9549f AF instances=1 flags=2
5399e2b7-1046-4058-936d-882ee7492c5b BA instances=1 flags=2
87a5e402-3681-432a-9d27-b5d40ee8c489 BB instances=1 flags=2
67daf0ca-a83e-4d58-b462-cd7201a2e6d6 BC instances=1 flags=2
2c70be1b-c60e-452d-9413-ee888a830cbd BD instances=1 flags=2
666d92bd-f6e0-4979-9b9f-0436a9a379d0 BE instances=1 flags=2
8be9e7f1-b926-492b-8f7b-3e34243acdc7 BF instances=1 flags=2
dbcdebcc-2eb0-44a7-9413-7e566b42e2cd CA instances=1 flags=2
c75665a3-4382-4646-adc8-c81ae146e455 CC instances=1 flags=2
0b30fd67-1b62-4fca-b10b-50dc7ade6a39 CD instances=1 flags=2
e25665a3-4382-4646-adc8-c81ae14653df CE instances=1 flags=2
a654f3a7-8548-4e33-b464-6d8b21b2da88 CF instances=1 flags=2
6b40a935-7fef-42b6-b08d-6c79b57d6c35 DA instances=1 flags=2
6377f67e-da51-45f6-8898-33ef5f1f5a16 DB instances=1 flags=2
a9135b56-66a2-48f0-a74b-f940f0ccf167 DC instances=1 flags=2
0b30fd67-1b62-4fca-b10b-50dc7ade6ddd D0 instances=1 flags=8
c75665d0-4382-4646-adc8-c81ae1579ac1 D1 instances=1 flags=8
c75665d0-4382-4646-adc8-c81ae146e984 D3 instances=1 flags=8
```
