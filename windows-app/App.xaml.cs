using System.Drawing;
using System.Windows;
using MechrevoControl.Frontend.Client;
using MechrevoControl.Frontend.Contracts;
using Forms = System.Windows.Forms;

namespace MechrevoControl.Frontend;

/// <summary>
/// Single-process Windows frontend host:
/// - Owns one replaceable IDeviceClient (hardware by default, demo on request).
/// - Owns one resident Win32 NotifyIcon tray menu (0% idle CPU, minimal working set).
/// - Creates MainWindow strictly on demand and destroys it on close while pausing telemetry.
/// - Shows lightweight topmost OsdWindow on hotkey confirmation and closes it after 1000/4000ms.
/// </summary>
public partial class App : System.Windows.Application
{
    public IDeviceClient DeviceClient { get; private set; } = null!;
    public bool OsdEnabled { get; set; } = true;

    private Forms.NotifyIcon? _trayIcon;
    private MainWindow? _mainWindow;
    private OsdWindow? _osdWindow;
    private Forms.ToolStripMenuItem? _statusItem;
    private Forms.ToolStripMenuItem? _balancedItem;
    private Forms.ToolStripMenuItem? _performanceItem;
    public bool CanSwitch { get; private set; }

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        // Single replaceable client entry point
        DeviceClient = e.Args.Contains("--demo") ? new DemoDeviceClient() : new NamedPipeDeviceClient();
        OsdEnabled = DeviceClient.DataSource == "demo";
        DeviceClient.StatusChanged += OnClientStatusChanged;
        DeviceClient.HotkeyReceived += OnClientHotkeyReceived;

        InitTrayIcon();
        ShowOrActivateMainWindow();
    }

    private void InitTrayIcon()
    {
        var menu = new Forms.ContextMenuStrip();
        _statusItem = new Forms.ToolStripMenuItem("正在读取设备状态…") { Enabled = false };
        menu.Items.Add(_statusItem);
        menu.Items.Add(new Forms.ToolStripSeparator());

        menu.Items.Add("打开主窗口", null, (_, _) => Dispatcher.Invoke(ShowOrActivateMainWindow));
        _balancedItem = new Forms.ToolStripMenuItem("切换至平衡档") { Enabled = false };
        _performanceItem = new Forms.ToolStripMenuItem("切换至性能档") { Enabled = false };
        _balancedItem.Click += async (_, _) => await SwitchFromTrayAsync(HardwarePerformanceMode.Balanced);
        _performanceItem.Click += async (_, _) => await SwitchFromTrayAsync(HardwarePerformanceMode.Performance);
        menu.Items.Add(_balancedItem);
        menu.Items.Add(_performanceItem);

        var osdToggle = new Forms.ToolStripMenuItem("启用本应用 OSD 提示") { Checked = OsdEnabled, CheckOnClick = true };
        osdToggle.CheckedChanged += (_, _) => OsdEnabled = osdToggle.Checked;
        menu.Items.Add(osdToggle);

        menu.Items.Add(new Forms.ToolStripSeparator());
        menu.Items.Add("退出控制台", null, (_, _) => Dispatcher.Invoke(ExitApplication));

        _trayIcon = new Forms.NotifyIcon
        {
            Icon = SystemIcons.Application,
            Text = DeviceClient.DataSource == "demo" ? "无界 14 MAX 控制台（演示）" : "无界 14 MAX 控制台",
            Visible = true,
            ContextMenuStrip = menu
        };
        _trayIcon.DoubleClick += (_, _) => Dispatcher.Invoke(ShowOrActivateMainWindow);
    }

    public void ShowOrActivateMainWindow()
    {
        if (_mainWindow is null)
        {
            _mainWindow = new MainWindow(this);
            _mainWindow.Closed += (_, _) =>
            {
                // Completely release MainWindow visual tree & stop high-frequency telemetry!
                _mainWindow = null;
                DeviceClient.SetTelemetryActive(false);
            };
            _mainWindow.Show();
            DeviceClient.SetTelemetryActive(true);
        }
        else
        {
            if (_mainWindow.WindowState == WindowState.Minimized)
                _mainWindow.WindowState = WindowState.Normal;
            _mainWindow.Activate();
        }
    }

    private async Task SwitchFromTrayAsync(HardwarePerformanceMode mode)
    {
        ShowOrActivateMainWindow();
        if (_mainWindow is not null) await _mainWindow.SwitchModeAsync(mode);
    }

    internal static string ModeLabel(HardwarePerformanceMode mode) => mode switch
    {
        HardwarePerformanceMode.Balanced => "硬件平衡档",
        HardwarePerformanceMode.Performance => "硬件性能档",
        _ => "硬件档位未知"
    };

    private void OnClientStatusChanged(StatusEvent evt)
    {
        Dispatcher.BeginInvoke(() =>
        {
            if (_statusItem is null) return;
            if (evt.Capabilities is not null) CanSwitch = evt.Capabilities.PerformanceMode.Writable;
            var canWrite = evt.ConnectionState == ConnectionState.Connected && CanSwitch;
            if (_balancedItem is not null) _balancedItem.Enabled = canWrite;
            if (_performanceItem is not null) _performanceItem.Enabled = canWrite;
            if (evt.ConnectionState == ConnectionState.Disconnected)
            {
                _statusItem.Text = "服务已断线（快照已过期）";
                return;
            }
            if (evt.Snapshot is not null)
            {
                var modeLabel = ModeLabel(evt.Snapshot.HardwareMode);
                var prefix = evt.Snapshot.DataSource == "demo" ? "演示数据" : "实机";
                _statusItem.Text = $"{prefix} · {modeLabel} · {evt.Snapshot.PowerSource}";
            }
        });
    }

    private void OnClientHotkeyReceived(HotkeyEvent evt)
    {
        Dispatcher.BeginInvoke(() =>
        {
            if (!OsdEnabled) return;
            _osdWindow?.Close();
            var osd = new OsdWindow(evt);
            _osdWindow = osd;
            osd.Closed += (_, _) => { if (_osdWindow == osd) _osdWindow = null; };
            osd.Show();
        });
    }

    private void ExitApplication()
    {
        DeviceClient.SetTelemetryActive(false);
        DeviceClient.Dispose();
        _osdWindow?.Close();
        _mainWindow?.Close();
        if (_trayIcon is not null)
        {
            _trayIcon.Visible = false;
            _trayIcon.Dispose();
        }
        Shutdown();
    }
}
