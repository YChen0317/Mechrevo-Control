using MechrevoControl.Frontend.Contracts;

namespace MechrevoControl.Frontend.Client;

public enum DemoSwitchBehavior
{
    Success,
    ReadbackMismatch,
    PermissionDenied,
    Timeout
}

public sealed class DemoDeviceClient : IDeviceClient
{
    private readonly object _gate = new();
    private readonly Random _rng = new();
    private System.Threading.Timer? _telemetryTimer;
    private long _revision = 1;
    private string _instanceId = "demo-svc-01";
    private bool _telemetryActive;
    private DeviceSnapshot _snapshot;
    private DeviceCapabilities _capabilities;

    public string DisplayName => "演示客户端（DemoDeviceClient）";
    public string DataSource => "demo";
    public ConnectionState ConnectionState { get; private set; } = ConnectionState.Connected;
    public DemoSwitchBehavior NextSwitchBehavior { get; set; } = DemoSwitchBehavior.Success;

    public event Action<StatusEvent>? StatusChanged;
    public event Action<HotkeyEvent>? HotkeyReceived;

    public DemoDeviceClient()
    {
        _capabilities = BuildCapabilities(true);
        _snapshot = new DeviceSnapshot(
            ProtocolVersion: "1.0.0-draft",
            ServiceInstanceId: _instanceId,
            Revision: _revision,
            DataSource: "demo",
            CapturedAt: DateTimeOffset.Now,
            IsStale: false,
            ModelName: "机械革命 无界 14 MAX（Dove4）",
            CpuName: "Intel Core Ultra 7 256V",
            PowerSource: "交流电源 (AC)",
            ChargingState: "已接电 · 未充电",
            BatteryPercent: 92,
            BatteryPowerWatts: 0.0,
            HardwareMode: HardwarePerformanceMode.Balanced,
            FirmwarePpmdRaw: 1,
            SelectedPolicy: UserPolicyMode.Manual,
            PolicyStatus: "idle",
            CpuPackagePowerWatts: 17.09,
            CpuFrequencyMhz: 1300,
            TelemetryActive: false);
    }

    private static DeviceCapabilities BuildCapabilities(bool connected) =>
        new(
            ProtocolVersion: "1.0.0-draft",
            ServiceVersion: "0.1.0-demo",
            DataSource: "demo",
            RefreshedAt: DateTimeOffset.Now,
            PerformanceMode: new FeatureCapability(connected, connected, "hardware_readback", connected ? null : "服务已断线"),
            DailySmooth: new FeatureCapability(connected, false, "os_state", "待后端实机验证后开放"),
            SmartMode: new FeatureCapability(connected, false, "hardware_readback", "待后端完成独立切档验证后开放"),
            BatteryChargeLimit: new FeatureCapability(connected, false, "unverified", "固件读数为 0，待停充与恢复验证"));

    public Task<DeviceCapabilities> GetCapabilitiesAsync(CancellationToken ct = default)
    {
        if (ConnectionState != ConnectionState.Connected)
            throw new InvalidOperationException("SERVICE_OFFLINE");
        return Task.FromResult(_capabilities);
    }

    public Task<DeviceSnapshot> GetSnapshotAsync(CancellationToken ct = default)
    {
        if (ConnectionState != ConnectionState.Connected)
            throw new InvalidOperationException("SERVICE_OFFLINE");
        lock (_gate) return Task.FromResult(_snapshot);
    }

    public async Task<SetPerformanceModeResult> SetPerformanceModeAsync(
        HardwarePerformanceMode mode,
        CancellationToken ct = default)
    {
        if (ConnectionState != ConnectionState.Connected)
        {
            return new SetPerformanceModeResult(
                false,
                _snapshot.HardwareMode,
                _snapshot,
                new ClientError("SERVICE_OFFLINE", "后端设备服务已断线，无法切换档位"));
        }

        await Task.Delay(NextSwitchBehavior == DemoSwitchBehavior.Timeout ? 950 : 520, ct);

        if (ConnectionState != ConnectionState.Connected)
        {
            return new SetPerformanceModeResult(
                false,
                _snapshot.HardwareMode,
                _snapshot,
                new ClientError("SERVICE_OFFLINE", "切档期间连接中断，保留最后确认档位"));
        }

        if (NextSwitchBehavior == DemoSwitchBehavior.ReadbackMismatch)
        {
            return new SetPerformanceModeResult(
                false,
                _snapshot.HardwareMode,
                _snapshot,
                new ClientError(
                    "READBACK_MISMATCH",
                    "写后读回不一致，界面保留最后确认档位",
                    $"请求 {mode}，但 GetPowerPlanMode 仍读回 {_snapshot.HardwareMode}",
                    mode.ToString(),
                    _snapshot.HardwareMode.ToString(),
                    Retryable: true));
        }

        if (NextSwitchBehavior == DemoSwitchBehavior.PermissionDenied)
        {
            return new SetPerformanceModeResult(
                false,
                _snapshot.HardwareMode,
                _snapshot,
                new ClientError("PERMISSION_DENIED", "写操作权限校验未通过", Retryable: false));
        }

        if (NextSwitchBehavior == DemoSwitchBehavior.Timeout)
        {
            return new SetPerformanceModeResult(
                false,
                _snapshot.HardwareMode,
                _snapshot,
                new ClientError("TIMEOUT", "读回确认超时，结果未知（不自动重放写请求）", Retryable: true));
        }

        DeviceSnapshot updated;
        lock (_gate)
        {
            _revision++;
            var isPerf = mode == HardwarePerformanceMode.Performance;
            updated = _snapshot with
            {
                Revision = _revision,
                CapturedAt = DateTimeOffset.Now,
                HardwareMode = mode,
                FirmwarePpmdRaw = isPerf ? 2 : 1,
                SelectedPolicy = UserPolicyMode.Manual,
                CpuPackagePowerWatts = isPerf ? 29.91 : 17.09,
                CpuFrequencyMhz = isPerf ? 1960 : 1300
            };
            _snapshot = updated;
        }

        StatusChanged?.Invoke(new StatusEvent("snapshot", ConnectionState, updated));
        HotkeyReceived?.Invoke(new HotkeyEvent(
            Guid.NewGuid().ToString("N"),
            DateTimeOffset.Now,
            mode == HardwarePerformanceMode.Performance ? "0x42" : "0x41",
            "性能档位已确认",
            mode == HardwarePerformanceMode.Performance ? "硬件性能档 (PPMD = 2)" : "硬件平衡档 (PPMD = 1)",
            true,
            1000));

        return new SetPerformanceModeResult(true, mode, updated);
    }

    public void SimulateDisconnect()
    {
        ConnectionState = ConnectionState.Disconnected;
        SetTelemetryActive(false);
        _capabilities = BuildCapabilities(false);
        lock (_gate)
        {
            _snapshot = _snapshot with { IsStale = true, TelemetryActive = false };
        }
        StatusChanged?.Invoke(new StatusEvent(
            "connection",
            ConnectionState.Disconnected,
            _snapshot,
            _capabilities,
            new ClientError("SERVICE_OFFLINE", "模拟后端服务断线，数据已标记为过期")));
    }

    public async Task<(DeviceCapabilities Capabilities, DeviceSnapshot Snapshot)> ReconnectAsync(CancellationToken ct = default)
    {
        ConnectionState = ConnectionState.Reconnecting;
        StatusChanged?.Invoke(new StatusEvent("connection", ConnectionState.Reconnecting));
        await Task.Delay(450, ct);

        _instanceId = $"demo-svc-{_rng.Next(10, 99)}";
        ConnectionState = ConnectionState.Connected;
        _capabilities = BuildCapabilities(true);
        lock (_gate)
        {
            _revision++;
            _snapshot = _snapshot with
            {
                ServiceInstanceId = _instanceId,
                Revision = _revision,
                CapturedAt = DateTimeOffset.Now,
                IsStale = false
            };
        }
        StatusChanged?.Invoke(new StatusEvent("capabilities", ConnectionState.Connected, _snapshot, _capabilities));
        return (_capabilities, _snapshot);
    }

    public void TriggerDemoHotkey(string codeHex, string title, string stateLabel, int durationMs = 1000)
    {
        if (ConnectionState != ConnectionState.Connected) return;
        HotkeyReceived?.Invoke(new HotkeyEvent(
            Guid.NewGuid().ToString("N"),
            DateTimeOffset.Now,
            codeHex,
            title,
            stateLabel,
            true,
            durationMs));
    }

    public void SetTelemetryActive(bool active)
    {
        lock (_gate)
        {
            _telemetryActive = active;
            _telemetryTimer?.Dispose();
            _telemetryTimer = null;

            if (active && ConnectionState == ConnectionState.Connected)
            {
                _telemetryTimer = new System.Threading.Timer(_ =>
                {
                    if (ConnectionState != ConnectionState.Connected || !_telemetryActive) return;
                    DeviceSnapshot snap;
                    lock (_gate)
                    {
                        _revision++;
                        var baseW = _snapshot.HardwareMode == HardwarePerformanceMode.Performance ? 29.9 : 17.1;
                        var nextW = Math.Round(baseW + (_rng.NextDouble() - 0.5) * 0.7, 2);
                        snap = _snapshot with
                        {
                            Revision = _revision,
                            CapturedAt = DateTimeOffset.Now,
                            CpuPackagePowerWatts = nextW,
                            TelemetryActive = true
                        };
                        _snapshot = snap;
                    }
                    StatusChanged?.Invoke(new StatusEvent("snapshot", ConnectionState, snap));
                }, null, TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(1.5));
            }
        }
    }

    public void Dispose()
    {
        _telemetryTimer?.Dispose();
        _telemetryTimer = null;
    }
}
