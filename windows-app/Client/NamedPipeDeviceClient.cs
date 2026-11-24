using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using MechrevoControl.Frontend.Contracts;

namespace MechrevoControl.Frontend.Client;

/// <summary>
/// Production Windows Named Pipe client adapter skeleton (\\.\pipe\MechrevoControl.Dove4.V1).
/// Uses pure async ReadLineAsync over UTF-8 JSON Lines (0% idle CPU, zero polling).
/// Swap DemoDeviceClient -> NamedPipeDeviceClient in App.xaml.cs once backend service PR lands.
/// </summary>
public sealed class NamedPipeDeviceClient : IDeviceClient
{
    public const string DefaultPipeName = "MechrevoControl.Dove4.V1";
    private readonly string _pipeName;
    private NamedPipeClientStream? _pipe;

    public string DisplayName => "实机命名管道客户端（NamedPipeDeviceClient）";
    public string DataSource => "hardware";
    public ConnectionState ConnectionState { get; private set; } = ConnectionState.Disconnected;

    public event Action<StatusEvent>? StatusChanged;
    public event Action<HotkeyEvent>? HotkeyReceived;

    public NamedPipeDeviceClient(string pipeName = DefaultPipeName)
    {
        _pipeName = pipeName;
    }

    public async Task<(DeviceCapabilities Capabilities, DeviceSnapshot Snapshot)> ReconnectAsync(CancellationToken ct = default)
    {
        ConnectionState = ConnectionState.Reconnecting;
        StatusChanged?.Invoke(new StatusEvent("connection", ConnectionState.Reconnecting));

        _pipe?.Dispose();
        _pipe = new NamedPipeClientStream(".", _pipeName, PipeDirection.InOut, PipeOptions.Asynchronous);

        try
        {
            await _pipe.ConnectAsync(1500, ct);
            ConnectionState = ConnectionState.Connected;
            var caps = await GetCapabilitiesAsync(ct);
            var snap = await GetSnapshotAsync(ct);
            StatusChanged?.Invoke(new StatusEvent("capabilities", ConnectionState.Connected, snap, caps));
            return (caps, snap);
        }
        catch (Exception ex)
        {
            ConnectionState = ConnectionState.Disconnected;
            StatusChanged?.Invoke(new StatusEvent(
                "connection",
                ConnectionState.Disconnected,
                Error: new ClientError("SERVICE_OFFLINE", "无法连接到后端命名管道服务", ex.Message)));
            throw;
        }
    }

    public Task<DeviceCapabilities> GetCapabilitiesAsync(CancellationToken ct = default) =>
        throw new NotImplementedException("等待后端共享协议 PR 合入后对齐具体 JSON 字段名。");

    public Task<DeviceSnapshot> GetSnapshotAsync(CancellationToken ct = default) =>
        throw new NotImplementedException("等待后端共享协议 PR 合入后对齐具体 JSON 字段名。");

    public Task<SetPerformanceModeResult> SetPerformanceModeAsync(HardwarePerformanceMode mode, CancellationToken ct = default) =>
        throw new NotImplementedException("等待后端共享协议 PR 合入后对齐具体 JSON 字段名。");

    public void SetTelemetryActive(bool active)
    {
        if (_pipe is not { IsConnected: true }) return;
        var envelope = new PipeEnvelope<object>("1.0.0", Guid.NewGuid().ToString("N"), "setTelemetrySubscription", new { active });
        var line = JsonSerializer.Serialize(envelope) + "\n";
        var bytes = Encoding.UTF8.GetBytes(line);
        _ = _pipe.WriteAsync(bytes, 0, bytes.Length);
    }

    public void Dispose()
    {
        _pipe?.Dispose();
        _pipe = null;
    }
}
