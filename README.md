# Mechrevo-Control

机械革命笔记本的第三方 Windows 控制台项目。首个目标是弄清无界 14 MAX 原厂性能档位和电池保护如何工作，并为后续替代界面验证可用的控制接口。

## 当前进度

- `Get-PowerPlan.ps1` 读取当前 Windows 电源计划。已在目标机器验证输出与 `powercfg /getactivescheme` 一致。
- `analysis/Read-OemIl.ps1` 使用 PowerShell 7 和 .NET 元数据 API 读取原厂程序集中的方法指令，运行时只打开文件。
- [调查记录](docs/oem-research.md) 记录已确认的 WinUI 消息路径、服务端限制与复查命令。厂商档位和充电设置的实际写入还有待验证。

## 运行只读脚本

在仓库目录的 PowerShell 中运行 `./Get-PowerPlan.ps1`。这个脚本显示的是 Windows 电源计划。原厂档位的界面逻辑另外通过 MQTT 发送请求。
