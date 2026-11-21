# 无界 14 MAX 整机软件替代评估

## 实机与驱动包核对

桌面 driver/Package 中有 25 个编号目录。1–19 是 Intel 平台、图形、功耗策略、音频、网络、摄像头等设备支持软件。20 是独立的 EmOSDFunction，21 是机械革命控制中心，22–25 分别是星界智联、电子保修卡、应用商店和樱桃 AI 语音助手。Driver Center 是整套软件的安装入口。把项目目标定义为接管 OEM 硬件控制与系统交互，保留 Windows、Intel 及外设厂商支持。售后账号、云端服务与商店属于独立产品。

21 号包的 CCU.WinUI.msix 的 SHA-256 为 E0A4C69784C1D3A1185CB4D281600D7642FF2877B246AEE55D6F9302DDFD0195，与此前在原厂安装目录检查的文件相同。setup.ini 指定 CustomizeTarget 56。这把已有 WinUI 代码分析与本次整机安装介质联系起来。20 号包的安装脚本启动 EmOSDFunction 1.0.0.10，本机也注册了同版本，含 UI 与服务两个程序。重做 Fn 和屏幕提示时，应同时观察它与 GCUService 的职责。

## 固件通道实证

本机设备实例 ACPI\\PNP0C14\\HWMI 绑定 WmiAcpi，驱动提供方 Microsoft，INF 为 wmiacpi.inf。另有 DSarDev 和 TestDev 实例。DSDT 字节中检出 HWMI、EWMI、_WDG 及多个 WM 开头的方法名。随包 Uniwill 驱动匹配的 INOU0000 在此前枚举中未出现。因此优先核对微软 ACPI-WMI 桥公开的本机功能。设备绑定是实证，方法用途和机械革命后台实际调用路径还要逐项验证。当前会话读取 root/wmi 类元数据被系统拒绝，本次没有执行固件写操作。

## 功能与软件边界

详见[功能逐项分析](features-firmware-charging.md)。首页档位、部分风扇配置与电池保护均在通用界面中有消息发送逻辑。实际执行需要本机后端。Windows 电源计划已可独立读取。热键应分别检查标准 HID 事件、OEM 事件与屏幕提示。显示、亮度、声音和电池基础信息优先采用系统接口，机型特定的风扇、档位和限充独立探测。独显、液冷、灯带等通用页面需要能力证据才能列为本机功能。

## 两进程设计及验收

普通权限 UI 展示状态和发起请求。后台按具体功能实现读取、应用和恢复，具备原厂后台独立性后再标记为可替代。进程间只暴露类型明确的功能命令，可用具有访问控制的本机命名管道。UI 区分用户目标、固件读回值和物理效果。首版允许某个功能显示未知或不可用。保留原厂服务期间仅能完成共存验证；最终验收要在可恢复条件下停用相关 OEM 组件，逐项检验冷启动、睡眠恢复、插拔电源、热键单次响应及散热自动控制。

电池优先查 EmdAcpi_BatteryChargeRationing 或同用途类，再查方法签名与状态读回。无界 14 SE 的公开项目提供候选类名，Lark4-LNL 的内核 RFC 提供近似平台的 EWMI 参考，两者均需与 Dove4 固件比对。只有达到阈值后实际停充，并在适当电量恢复充电，才能确认限充有效。尚未验证自定义风扇曲线、任意百分比限充及完全停用 OEM 服务后的功能覆盖率。

参考：[Windows 充电上限项目](https://github.com/Leo-stro/mechrevo-charge-limit) · [Emdoor Intel EWMI 驱动 RFC](https://lkml.iu.edu/hypermail/linux/kernel/2611.1/20853.html)
