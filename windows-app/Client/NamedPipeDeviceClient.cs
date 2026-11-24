using System.ComponentModel;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using Microsoft.Win32.SafeHandles;
using MechrevoControl.Frontend.Contracts;

namespace MechrevoControl.Frontend.Client;

public sealed class NamedPipeDeviceClient : IDeviceClient
{
    public const string DefaultPipeName = "Mechrevo.Control.v1";

    private readonly string _pipePath;
    private readonly CancellationTokenSource _stop = new();
    private readonly SemaphoreSlim _refresh = new(1);
    private readonly SemaphoreSlim _write = new(1);
    private readonly object _stateLock = new();
    private DeviceSnapshot? _last;
    private string _serviceVersion = "未知";
    private Task? _watch;

    public NamedPipeDeviceClient(string pipeName = DefaultPipeName) => _pipePath = @"\\.\pipe\" + pipeName;

    public string DisplayName => "实机命名管道";
    public string DataSource => "hardware";
    public ConnectionState ConnectionState { get; private set; } = ConnectionState.Disconnected;
    public event Action<StatusEvent>? StatusChanged;
    // Backend 0.2.0 returns CapabilityUnavailable for hotkey subscriptions.
    public event Action<HotkeyEvent>? HotkeyReceived { add { } remove { } }

    public async Task<DeviceSnapshot> GetSnapshotAsync(CancellationToken ct = default) =>
        AcceptSnapshot(await CallAsync("getSnapshot", null, ct).ConfigureAwait(false));

    public async Task<DeviceCapabilities> GetCapabilitiesAsync(CancellationToken ct = default)
    {
        var result = await CallAsync("getCapabilities", null, ct).ConfigureAwait(false);
        var mode = result.GetProperty("mode");
        var unavailable = new FeatureCapability(false, false, "unavailable", "此服务版本未开放");
        return new("1", _serviceVersion, DataSource, DateTimeOffset.Now,
            new(mode.GetProperty("readable").GetBoolean(), mode.GetProperty("writable").GetBoolean(),
                "hardware_readback", ReadText(mode, "reason")), unavailable, unavailable, unavailable);
    }

    public async Task<(DeviceCapabilities Capabilities, DeviceSnapshot Snapshot)> ReconnectAsync(CancellationToken ct = default)
    {
        await _refresh.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            Publish("connection", ConnectionState.Reconnecting);
            var snapshot = await GetSnapshotAsync(ct).ConfigureAwait(false);
            var capabilities = await GetCapabilitiesAsync(ct).ConfigureAwait(false);
            Publish("capabilities", ConnectionState.Connected, snapshot, capabilities);
            _watch ??= Task.Run(() => WatchAsync(_stop.Token));
            return (capabilities, snapshot);
        }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            PublishOffline(ex);
            throw;
        }
        finally { _refresh.Release(); }
    }

    public async Task<SetPerformanceModeResult> SetPerformanceModeAsync(HardwarePerformanceMode mode, CancellationToken ct = default)
    {
        await _write.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            var wireMode = mode switch
            {
                HardwarePerformanceMode.Balanced => "balanced",
                HardwarePerformanceMode.Performance => "performance",
                _ => throw new ArgumentOutOfRangeException(nameof(mode))
            };
            string? confirmed = null;
            ClientError? failure = null;
            try
            {
                confirmed = ReadText(await CallAsync("setPerformanceMode", wireMode, ct).ConfigureAwait(false), "mode");
                if (confirmed != wireMode)
                    failure = new("ReadbackMismatch", "固件回读与请求档位不同", ActualReadbackValue: confirmed);
            }
            catch (PipeReplyException ex) { failure = new(ex.Code, ex.Message); }
            catch (Exception ex) when (!ct.IsCancellationRequested)
            {
                failure = new("OutcomeUnknown", "切档结果未知，可查看刷新后的档位", ex.Message, Retryable: false);
            }

            try
            {
                var snapshot = await GetSnapshotAsync(ct).ConfigureAwait(false);
                Publish("status", ConnectionState.Connected, snapshot);
                return new(failure is null, ParseMode(confirmed), snapshot, failure);
            }
            catch (Exception ex) when (!ct.IsCancellationRequested)
            {
                var stale = PublishOffline(ex);
                if (stale is null) throw;
                return new(false, ParseMode(confirmed), stale,
                    failure ?? new("RefreshFailed", "无法刷新切档后的状态", ex.Message, Retryable: false));
            }
        }
        finally { _write.Release(); }
    }

    // V1 sends one low-frequency service snapshot to all clients.
    public void SetTelemetryActive(bool active) { }
    public void Dispose() => _stop.Cancel();

    private async Task WatchAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                using var pipe = await ConnectAsync(ct).ConfigureAwait(false);
                using var reader = new StreamReader(pipe, Encoding.UTF8, false, 4096, true);
                using var writer = CreateWriter(pipe);
                await SendAsync(writer, "subscribeStatus", null, ct, reader).ConfigureAwait(false);
                while (!ct.IsCancellationRequested)
                {
                    using var frame = await ReadFrameAsync(reader, ct).ConfigureAwait(false);
                    var root = frame.RootElement;
                    if (root.GetProperty("v").GetInt32() != 1 || ReadText(root, "event") != "status")
                        throw new IOException("状态订阅响应无效");
                    var data = root.GetProperty("data");
                    DeviceSnapshot? previous;
                    lock (_stateLock) previous = _last;
                    if (previous?.ServiceInstanceId == ReadText(data, "instanceId") &&
                        previous.Revision >= data.GetProperty("revision").GetInt64() &&
                        ConnectionState == ConnectionState.Connected)
                        continue;
                    var snapshot = AcceptSnapshot(data);
                    var caps = previous?.ServiceInstanceId != snapshot.ServiceInstanceId ||
                        previous?.HardwareMode == HardwarePerformanceMode.Unknown || snapshot.HardwareMode == HardwarePerformanceMode.Unknown ||
                        ConnectionState != ConnectionState.Connected
                        ? await GetCapabilitiesAsync(ct).ConfigureAwait(false) : null;
                    Publish("status", ConnectionState.Connected, snapshot, caps);
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { return; }
            catch (Exception ex)
            {
                PublishOffline(ex);
                try { await Task.Delay(1500, ct).ConfigureAwait(false); }
                catch (OperationCanceledException) { return; }
            }
        }
    }

    private DeviceSnapshot AcceptSnapshot(JsonElement row)
    {
        var mode = ParseMode(ReadText(row, "mode"));
        var snapshot = new DeviceSnapshot("1", row.GetProperty("instanceId").GetString()!,
            row.GetProperty("revision").GetInt64(), DataSource, row.GetProperty("timestamp").GetDateTimeOffset(),
            false, ReadText(row, "model") ?? "未知机型", "未知",
            ReadFlag(row, "ac") switch { true => "交流电源", false => "电池供电", _ => "供电未知" },
            ReadFlag(row, "charging") switch { true => "正在充电", false => "未充电", _ => "充电状态未知" },
            ReadInt(row, "batteryPercent"), null, mode,
            mode switch { HardwarePerformanceMode.Balanced => 1, HardwarePerformanceMode.Performance => 2, _ => null },
            UserPolicyMode.Manual, "manual", ReadNumber(row, "packageW"), ReadInt(row, "cpuMHz"), false);
        lock (_stateLock)
        {
            if (_last?.ServiceInstanceId == snapshot.ServiceInstanceId && _last.Revision > snapshot.Revision)
                return _last;
            _serviceVersion = ReadText(row, "serviceVersion") ?? "未知";
            _last = snapshot;
            return snapshot;
        }
    }

    private DeviceSnapshot? PublishOffline(Exception ex)
    {
        DeviceSnapshot? stale;
        lock (_stateLock) stale = _last is null ? null : _last with { IsStale = true };
        Publish("connection", ConnectionState.Disconnected, stale,
            error: new("ServiceOffline", "无法读取后端服务", ex.Message));
        return stale;
    }

    private void Publish(string type, ConnectionState state, DeviceSnapshot? snapshot = null,
        DeviceCapabilities? caps = null, ClientError? error = null)
    {
        ConnectionState = state;
        StatusChanged?.Invoke(new(type, state, snapshot, caps, error));
    }

    private async Task<JsonElement> CallAsync(string method, string? mode, CancellationToken ct)
    {
        using var pipe = await ConnectAsync(ct).ConfigureAwait(false);
        using var reader = new StreamReader(pipe, Encoding.UTF8, false, 4096, true);
        using var writer = CreateWriter(pipe);
        return await SendAsync(writer, method, mode, ct, reader).ConfigureAwait(false);
    }

    private static StreamWriter CreateWriter(Stream stream) =>
        new(stream, new UTF8Encoding(false), 4096, true) { NewLine = "\n", AutoFlush = true };

    private static async Task<JsonElement> SendAsync(StreamWriter writer, string method, string? mode,
        CancellationToken ct, StreamReader reader)
    {
        var id = Guid.NewGuid().ToString("N");
        var request = JsonSerializer.Serialize(new { v = 1, requestId = id, method, mode });
        await writer.WriteLineAsync(request.AsMemory(), ct).ConfigureAwait(false);
        using var frame = await ReadFrameAsync(reader, ct).ConfigureAwait(false);
        var root = frame.RootElement;
        if (root.GetProperty("v").GetInt32() != 1 || ReadText(root, "requestId") != id)
            throw new IOException("服务回复的协议或请求编号不匹配");
        if (root.TryGetProperty("error", out var error))
            throw new PipeReplyException(ReadText(error, "code") ?? "ServiceError", ReadText(error, "message") ?? "服务拒绝了请求");
        return root.GetProperty("result").Clone();
    }

    private static async Task<JsonDocument> ReadFrameAsync(StreamReader reader, CancellationToken ct)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadline.CancelAfter(TimeSpan.FromSeconds(32));
        return JsonDocument.Parse(await reader.ReadLineAsync(deadline.Token).ConfigureAwait(false)
            ?? throw new EndOfStreamException("后端服务已关闭连接"));
    }

    private async Task<NamedPipeClientStream> ConnectAsync(CancellationToken ct)
    {
        // GENERIC_WRITE includes FILE_CREATE_PIPE_INSTANCE. Request the narrower rights
        // granted by the service ACL and supply an identification-level client token.
        const uint serviceClientAccess = 0x0012019B;
        const uint openExisting = 3;
        const uint overlappedIdentification = 0x40110000;
        for (int attempt = 0; ; attempt++)
        {
            ct.ThrowIfCancellationRequested();
            var handle = CreateFile(_pipePath, serviceClientAccess, 0, IntPtr.Zero,
                openExisting, overlappedIdentification, IntPtr.Zero);
            if (!handle.IsInvalid)
            {
                var pipe = new SafePipeHandle(handle.DangerousGetHandle(), true);
                handle.SetHandleAsInvalid();
                handle.Dispose();
                try { return new NamedPipeClientStream(PipeDirection.InOut, true, true, pipe); }
                catch { pipe.Dispose(); throw; }
            }
            var error = Marshal.GetLastWin32Error();
            handle.Dispose();
            if (attempt >= 19 || error is not (2 or 231)) throw new Win32Exception(error);
            await Task.Delay(100, ct).ConfigureAwait(false);
        }
    }

    [DllImport("kernel32.dll", EntryPoint = "CreateFileW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFile(string fileName, uint access, uint share,
        IntPtr security, uint disposition, uint flags, IntPtr template);

    private static string? ReadText(JsonElement row, string field) =>
        row.TryGetProperty(field, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
    private static int? ReadInt(JsonElement row, string field) =>
        row.TryGetProperty(field, out var value) && value.ValueKind == JsonValueKind.Number ? value.GetInt32() : null;
    private static double? ReadNumber(JsonElement row, string field) =>
        row.TryGetProperty(field, out var value) && value.ValueKind == JsonValueKind.Number ? value.GetDouble() : null;
    private static bool? ReadFlag(JsonElement row, string field) =>
        row.TryGetProperty(field, out var value) && value.ValueKind is JsonValueKind.True or JsonValueKind.False ? value.GetBoolean() : null;
    private static HardwarePerformanceMode ParseMode(string? mode) => mode switch
    {
        "balanced" => HardwarePerformanceMode.Balanced,
        "performance" => HardwarePerformanceMode.Performance,
        _ => HardwarePerformanceMode.Unknown
    };

    private sealed class PipeReplyException(string code, string message) : IOException(message)
    {
        public string Code { get; } = code;
    }
}
