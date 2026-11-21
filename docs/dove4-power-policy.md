# Dove4 功耗策略追踪

本机固件 Rev05 的 DSDT 与 SSDT 共同实现性能选择及平台功耗策略。已通过管理员会话实测，平衡档返回 PPMD 1，性能档返回 PPMD 2。

## 固件路径

- 专用 WMI 方法 WMBB 的设置分支写入 EC 的 PPMD 字段并读回，更新 ODV0，同时对 IETM 发出 ACPI 通知 0x88。多个分支对外部枚举到 EC 档位的映射不同。已经验证的是原厂界面的最终读回，尚未将界面 MQTT 请求与具体 WMBB 分支关联。
- 本机的 DptfTabl SSDT 定义 IETM 平台热管理设备，并提供 _ART、_TRT 和 GDDV。其 PPSS 方法在 ODV0 与 ODV1 同为 1 时选择 PPS3。PPS 表包含充电器电流或电压档位，不能用来表示 CPU 封装功耗。
- DptfTabl 的 CPU 参与设备提供 PPCC。PPCC 条件读取 CBMI、CLVL 并调用 CPL0、CPL1 或 CPL2，随后返回 NPCC。三个 CPL 方法分别引用 PL10、PL11、PL12，时间字段 PLW0、PLW1、PLW2，以及 PL20、PL21、PL22。可见固件支持动态组装功耗能力包，静态 NPCC 初始值不能直接等同于实际档位的运行功率。
- NPCC 的静态首个条目为索引 0、35000、45000、28000、32000、1000。第二项为索引 1、56250、56250、0、0、1000。PPCC 能力范围的字段定义可与 Intel 平台驱动源码核对。这两项没有证据能与平衡、性能一一对应。[Intel 平台 PPCC 解析代码](https://git.ti.com/cgit/ti-linux-kernel/ti-linux-kernel-next/tree/drivers/thermal/intel/int340x_thermal/processor_thermal_device.c?h=ti-linux-4.4.y-next&id=9f452150cb6f0ca6adb56eb3f04590f1a78373e3)

## Windows 端

驱动注册路径表明本机安装了 Intel IPF CPU 和 ACPI 驱动，并配置 IPF 用户态服务与 DTT 组件。驱动包中存在 Intel DTT 配置数据和 Lunar Lake PPM 配置包。现有证据连接了固件档位、IETM 通知和 CPU 功耗能力接口。仍需运行时证据判断 Windows 在两档下采用的 PL1、PL2 和时间窗口，以及 OEM 设定是否还受装载、温度或供电状态覆盖。

实测 CPU 封装功率见[两档对照](dove4-mode-measurements.md)。RAPL 计数器提供实际采样功率，配置上限需另行读取。
