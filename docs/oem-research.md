# 原厂控制中心调查

## 目标机器

Windows 设备信息报告 `WUJIE Series`，处理器为 Intel Core Ultra 7 256V，BIOS 标识为 `WUJIE14Max_Dove4_LNL326_MC_OLED_Rev05`。具体销售款待核对。原厂控制中心安装条目和随附 WinUI 包版本均为 `5.56.1.24`。初次读取时，Windows 只列出「平衡」电源计划。

## 已确认的静态证据

- `GamingCenter/ControlCenterU.exe` 是启动器。其 `LanchUWPAP` 方法通过 Windows 应用入口启动包标识为 `ControlCenter3` 的应用。控制中心目录另外附带 `PreinstallKit/CCU.WinUI.msix`，其清单声明入口 `CCUWinUI.exe`。随附包和当前账户实际启动的应用包是否相同，还有待核对。
- 随附包内的 `CCUWinUI.dll` 含有 `HomePageViewModel.ModeSwitchCommand`。其异步方法包含 `Office`、`Gaming`、`Turbo`、`Customize` 分支，调用 `TopicSendToServerQueue` 发送消息。发送队列调用 `MQTTDataService.PublishTopic`。
- `PowerManageViewModel.SetBatteryMode` 另有 `Healthy`、`Balanced`、`Performance` 分支，使用电池保护主题。初始化逻辑也通过消息请求电池保护状态。
- 本机观察到 `GCUBridge` 与 `GCUService` 进程。静态读取 `GCUService.exe` 时，多个 `UserSet_Mode*`、`SetFanMode` 和托盘点击方法的指令只构造并抛出异常。`GCUBridge.exe` 部分方法体的格式也无法由标准读取器解析。服务端收包和应用档位的路径仍待确认，前端更新显示也不能单独证明硬件已应用。

## 复查

使用 PowerShell 7。先定位原厂控制中心安装目录，再从随附 MSIX 中读取界面程序集。下面的命令将程序集短暂解包到临时目录，检查后删除。

```powershell
$oem = Join-Path $env:ProgramFiles 'OEM\机械革命控制中心'
$package = Join-Path $oem 'PreinstallKit\CCU.WinUI.msix'
$zip = [IO.Compression.ZipFile]::OpenRead($package)
$tempDll = Join-Path ([IO.Path]::GetTempPath()) ('CCUWinUI-' + [guid]::NewGuid() + '.dll')
try {
    [IO.Compression.ZipFileExtensions]::ExtractToFile($zip.GetEntry('CCUWinUI.dll'), $tempDll)
    ./analysis/Read-OemIl.ps1 -AssemblyPath $tempDll -MethodPattern 'ModeSwitchCommand|SetBatteryMode|PublishTopic' -ShowIl
} finally {
    $zip.Dispose()
    if (Test-Path -LiteralPath $tempDll) { Remove-Item -LiteralPath $tempDll }
}
```

下一轮可在插电状态下记录原厂档位切换前后的服务活动，并用 `powercfg /getactivescheme` 和 `powercfg /query` 检查 Windows 电源设置有无同步变化。切换完成后恢复原档位。

## 参考项目

- 同属无界系列的 14XA 有公开的托盘切档与服务端逆向记录，研究对象使用 AMD 8845HS，和本项目的 Intel 平台不同。 [无界 14XA 逆向记录](https://gist.github.com/w568w/b2fc5f9d1f4dff13efe751abec27b396)
- Windows 下的 FanSlider 记录了同类控制中心组件和驱动边界，其公开实测机型是蛟龙 16 Pro 2025。 [Open-Mechrevo-FanSlider](https://github.com/nemoiwkryang/Open-Mechrevo-FanSlider)
- Uniwill Control Utility 可参考界面与硬件控制服务的结构，机型兼容性需按该项目清单核对。 [Uniwill Control Utility](https://github.com/Uniwill-Control-Utility/Uniwill-Control-Utility)
