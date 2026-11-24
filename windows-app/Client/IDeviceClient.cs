using MechrevoControl.Frontend.Contracts;

namespace MechrevoControl.Frontend.Client;

public interface IDeviceClient : IDisposable
{
    string DisplayName { get; }
    string DataSource { get; }
    ConnectionState ConnectionState { get; }

    event Action<StatusEvent>? StatusChanged;
    event Action<HotkeyEvent>? HotkeyReceived;

    Task<DeviceCapabilities> GetCapabilitiesAsync(CancellationToken ct = default);
    Task<DeviceSnapshot> GetSnapshotAsync(CancellationToken ct = default);
    Task<SetPerformanceModeResult> SetPerformanceModeAsync(HardwarePerformanceMode mode, CancellationToken ct = default);
    Task<(DeviceCapabilities Capabilities, DeviceSnapshot Snapshot)> ReconnectAsync(CancellationToken ct = default);

    /// <summary>
    /// Enables or pauses high-frequency telemetry polling when the MainWindow is opened/closed.
    /// Closing MainWindow immediately pauses telemetry to keep background CPU near 0%.
    /// </summary>
    void SetTelemetryActive(bool active);
}
