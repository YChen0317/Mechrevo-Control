# Dove4 剩余实机验证

适用板型是 Dove4 Lunar Lake，BIOS Rev05。此文补充[热键与灯光](dove4-hotkeys-and-lighting.md)、[WMI 接口](dove4-wmi-map.md)和[功耗策略](dove4-power-policy.md)的尚未验证项。

## 已定位的读数

- WMAF 方法编号 1 根据选择值 1 或 2 分别读取 F1RL/F1RH 或 F2RL/F2RH，并放入返回缓冲区偏移 2、3。已找到两路字段。未确认本机物理风扇数量或换算单位。
- WMBA 方法编号 1 将 EC VBUS 字段放到偏移 2。需要比较 USB-C 电源未插、已插时的原始值。暂不能把它直接换算为伏特或瓦。
- WMAD 方法编号 3 的选择值 0x62 读取 EC TSR4，并把原始值放到偏移 2。未确认 TSR4 传感器位置或温标。Windows ACPI TZ00 是另一条温区计数器。
- WMCC 的 AutoPowerOn 分支调用 EC 写方法并检查 ATPU。确认本机有设置路径。当前只读研究阶段用既有状态和原厂界面做比对。
- Windows 计数器已在本机读到封装功耗、实际频率、性能限制标志和 ACPI 温区。RAPL 的封装功耗计数器提供实测功耗。Intel 的 PL1、PL2 和时间窗口属于配置读数，需要单独从平台支持的读数或寄存器证据确认。[Intel 架构软件开发手册](https://www.intel.com/content/dam/www/public/us/en/documents/manuals/64-ia-32-architectures-software-developer-vol-3b-part-2-manual.pdf)

## 研究采集顺序

1. 在相同插电状态下，依次测试平衡和性能。双方开测前先让机器回到相近的空闲状态，用同一份 45 秒 CPU 负荷，自采功耗、频率、温区、限制标志及空闲/负载风扇和 EC 温度原始字节。初步比对后决定是否需要独立读取 PL1、PL2。脚本为 [Capture-Dove4Research.ps1](../analysis/Capture-Dove4Research.ps1)。Windows PowerShell 5.1 管理员会话能够读取该机型的固件 WMI。Codex 当前工具会话的 WMI 调用返回访问拒绝。
2. 电池保持在适合实测的电量，记录原始预设。通过原厂界面逐档切换，并每次运行脚本的默认模式记录阈值与充电模式。后续观察充电电流、电量平台、重启后保持及恢复充电时的条件。USB-C 读数可在同次采样增加一次已知适配器对照。电芯电压需先核对 WMDB 方法的输入选择器与回包，避免把其他电池数据误认为电芯值。
3. 飞行模式、独立 Wi-Fi、蓝牙、Win 键锁、睡眠键按需要逐项观察，动作后恢复原状态。记录 Windows 无线电状态、适配器枚举、Win 键是否被接收、睡眠与唤醒事件。飞行和睡眠先单项安排，避免切断远程工作。用原厂 UI 设置一个短背光超时，记录熄灭及再次唤醒时间。内屏 60/120 Hz 均已证实，仍需定位实体触发键。
4. 通过原厂界面、BIOS 项目或插电试验核实来电自启，记录开关与适用电源状态。摄像头已证实整个 USB 设备退枚举。若需区分断电与 USB 隔离，需板级资料、电路测量或确定实际控制引脚的固件证据。

采集脚本调用固定的固件读取分支，并检查 Windows 方法编号。档位 getter 会在固件内部使用通信字段。脚本的负荷选项会短时使用 CPU 并记录计数器。
