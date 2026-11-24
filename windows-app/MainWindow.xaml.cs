using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using MechrevoControl.Frontend.Client;
using MechrevoControl.Frontend.Contracts;

namespace MechrevoControl.Frontend;

public partial class MainWindow : Window
{
    private readonly App _app;
    private bool _isSwitching;

    public MainWindow(App app)
    {
        InitializeComponent();
        _app = app;
        SetSwitchEnabled(false);
        bool demo = app.DeviceClient.DataSource == "demo";
        Title = demo ? "无界 14 MAX 控制台 · 演示" : "无界 14 MAX 控制台";
        DemoControls.Visibility = demo ? Visibility.Visible : Visibility.Collapsed;
        _app.DeviceClient.StatusChanged += OnStatusChanged;
        Loaded += async (_, _) => await RefreshInitialAsync();
        Closed += (_, _) => _app.DeviceClient.StatusChanged -= OnStatusChanged;
    }

    private async Task RefreshInitialAsync()
    {
        try
        {
            var (_, snap) = await _app.DeviceClient.ReconnectAsync();
            RenderSnapshot(snap, _app.DeviceClient.ConnectionState);
        }
        catch (Exception ex)
        {
            ShowError($"读取设备状态失败：{ex.Message}");
            ReconnectBtn.Visibility = Visibility.Visible;
        }
    }

    private void OnStatusChanged(StatusEvent evt)
    {
        Dispatcher.BeginInvoke(() =>
        {
            if (evt.Error is not null) ShowError($"{evt.Error.Code} · {evt.Error.Message}");
            if (evt.Capabilities is not null && evt.ConnectionState == ConnectionState.Connected)
                HideError();
            if (evt.Snapshot is not null) RenderSnapshot(evt.Snapshot, evt.ConnectionState);
            else if (evt.ConnectionState == ConnectionState.Disconnected)
            {
                ReconnectBtn.Visibility = Visibility.Visible;
                SetSwitchEnabled(false);
            }
        });
    }

    private void RenderSnapshot(DeviceSnapshot snap, ConnectionState conn)
    {
        var offline = conn == ConnectionState.Disconnected;
        var modeText = App.ModeLabel(snap.HardwareMode);
        var policyText = snap.SelectedPolicy switch
        {
            UserPolicyMode.DailySmooth => "日用流畅",
            UserPolicyMode.Smart => "智能选档",
            _ => "手动控制"
        };

        ConfirmedModeText.Text = $"{policyText} · {modeText}" + (snap.IsStale ? "（数据已过期）" : "");
        PowerText.Text = $"{snap.PowerSource} · {snap.ChargingState}";
        var powerW = snap.CpuPackagePowerWatts.HasValue ? $"{snap.CpuPackagePowerWatts.Value:F2} W" : "不可用";
        var bat = snap.BatteryPercent.HasValue ? $"{snap.BatteryPercent.Value}%" : "不可用";
        TelemetryText.Text = $"{powerW} · {bat}";
        SubtitleText.Text = $"{(snap.DataSource == "demo" ? "演示数据" : "实机")} · Rev #{snap.Revision} · 采集 {snap.CapturedAt:HH:mm:ss}";

        ReconnectBtn.Visibility = offline ? Visibility.Visible : Visibility.Collapsed;
        SetSwitchEnabled(conn == ConnectionState.Connected && !_isSwitching && _app.CanSwitch && snap.HardwareMode != HardwarePerformanceMode.Unknown);

        var activeBrush = new SolidColorBrush(System.Windows.Media.Color.FromRgb(0x25, 0x63, 0xEB));
        var idleBrush = new SolidColorBrush(System.Windows.Media.Color.FromRgb(0x1E, 0x29, 0x3B));
        BalancedBtn.Background = snap.HardwareMode == HardwarePerformanceMode.Balanced ? activeBrush : idleBrush;
        PerformanceBtn.Background = snap.HardwareMode == HardwarePerformanceMode.Performance ? activeBrush : idleBrush;
    }

    internal async Task SwitchModeAsync(HardwarePerformanceMode target)
    {
        if (_isSwitching || !_app.CanSwitch || _app.DeviceClient.ConnectionState != ConnectionState.Connected) return;
        _isSwitching = true;
        SetSwitchEnabled(false);
        HideError();
        SwitchHintText.Text = $"正在请求切换至 {(target == HardwarePerformanceMode.Performance ? "性能" : "平衡")} 并等待硬件读回确认…";

        try
        {
            var result = await _app.DeviceClient.SetPerformanceModeAsync(target);
            RenderSnapshot(result.Snapshot, _app.DeviceClient.ConnectionState);
            if (!result.Ok && result.Error is not null)
            {
                ShowError($"{result.Error.Code} · {result.Error.Message}（{result.Error.Detail}）");
                SwitchHintText.Text = "切档未确认，请查看当前硬件档位。";
            }
            else
            {
                SwitchHintText.Text = "已收到读回确认并更新当前生效档位。";
            }
        }
        catch (Exception ex)
        {
            ShowError(ex.Message);
            SwitchHintText.Text = "切档结果未知，请重新连接查看当前档位。";
        }
        finally
        {
            _isSwitching = false;
            SetSwitchEnabled(_app.DeviceClient.ConnectionState == ConnectionState.Connected && _app.CanSwitch);
        }
    }

    private void SetSwitchEnabled(bool enabled)
    {
        BalancedBtn.IsEnabled = enabled;
        PerformanceBtn.IsEnabled = enabled;
    }

    private void ShowError(string message)
    {
        ErrorText.Text = message;
        ErrorBanner.Visibility = Visibility.Visible;
    }

    private void HideError() => ErrorBanner.Visibility = Visibility.Collapsed;

    private async void OnBalancedClick(object sender, RoutedEventArgs e) => await SwitchModeAsync(HardwarePerformanceMode.Balanced);
    private async void OnPerformanceClick(object sender, RoutedEventArgs e) => await SwitchModeAsync(HardwarePerformanceMode.Performance);

    private async void OnReconnectClick(object sender, RoutedEventArgs e)
    {
        HideError();
        await RefreshInitialAsync();
    }

    private void OnOutcomeChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_app?.DeviceClient is not DemoDeviceClient demo) return;
        demo.NextSwitchBehavior = OutcomeCombo.SelectedIndex switch
        {
            1 => DemoSwitchBehavior.ReadbackMismatch,
            2 => DemoSwitchBehavior.PermissionDenied,
            3 => DemoSwitchBehavior.Timeout,
            _ => DemoSwitchBehavior.Success
        };
    }

    private void OnDisconnectClick(object sender, RoutedEventArgs e)
    {
        if (_app.DeviceClient is DemoDeviceClient demo)
            demo.SimulateDisconnect();
    }

    private void OnDemoTouchpadOsdClick(object sender, RoutedEventArgs e)
    {
        if (_app.DeviceClient is DemoDeviceClient demo)
            demo.TriggerDemoHotkey("0x30", "触摸板", "已关闭（固件已执行）", 1000);
    }

    private void OnDemoRefreshOsdClick(object sender, RoutedEventArgs e)
    {
        if (_app.DeviceClient is DemoDeviceClient demo)
            demo.TriggerDemoHotkey("0xA2", "屏幕刷新率", "120 Hz · 2880×1800", 4000);
    }
}
