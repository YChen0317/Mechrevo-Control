using System.Text.Json.Serialization;

namespace MechrevoControl.Frontend.Contracts;

public enum HardwarePerformanceMode
{
    Unknown,
    Balanced,
    Performance
}

public enum UserPolicyMode
{
    Manual,
    Smart,
    DailySmooth
}

public enum ConnectionState
{
    Connected,
    Reconnecting,
    Disconnected
}

public sealed record ClientError(
    string Code,
    string Message,
    string? Detail = null,
    string? RequestedValue = null,
    string? ActualReadbackValue = null,
    bool Retryable = true);

public sealed record FeatureCapability(
    bool Readable,
    bool Writable,
    string Confirmation,
    string? UnavailableReason = null);

public sealed record DeviceCapabilities(
    string ProtocolVersion,
    string ServiceVersion,
    string DataSource,
    DateTimeOffset RefreshedAt,
    FeatureCapability PerformanceMode,
    FeatureCapability DailySmooth,
    FeatureCapability SmartMode,
    FeatureCapability BatteryChargeLimit);

public sealed record DeviceSnapshot(
    string ProtocolVersion,
    string ServiceInstanceId,
    long Revision,
    string DataSource,
    DateTimeOffset CapturedAt,
    bool IsStale,
    string ModelName,
    string CpuName,
    string PowerSource,
    string ChargingState,
    int? BatteryPercent,
    double? BatteryPowerWatts,
    HardwarePerformanceMode HardwareMode,
    int? FirmwarePpmdRaw,
    UserPolicyMode SelectedPolicy,
    string PolicyStatus,
    double? CpuPackagePowerWatts,
    int? CpuFrequencyMhz,
    bool TelemetryActive);

public sealed record HotkeyEvent(
    string EventId,
    DateTimeOffset Timestamp,
    string CodeHex,
    string Title,
    string StateLabel,
    bool StateConfirmed,
    int OsdDurationMs);

public sealed record SetPerformanceModeResult(
    bool Ok,
    HardwarePerformanceMode ConfirmedHardwareMode,
    DeviceSnapshot Snapshot,
    ClientError? Error = null);

public sealed record StatusEvent(
    string Type,
    ConnectionState ConnectionState,
    DeviceSnapshot? Snapshot = null,
    DeviceCapabilities? Capabilities = null,
    ClientError? Error = null);

public sealed record PipeEnvelope<T>(
    [property: JsonPropertyName("protocolVersion")] string ProtocolVersion,
    [property: JsonPropertyName("requestId")] string RequestId,
    [property: JsonPropertyName("method")] string Method,
    [property: JsonPropertyName("payload")] T Payload);
