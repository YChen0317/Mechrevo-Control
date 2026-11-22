export type HardwarePerformanceMode = 'balanced' | 'performance';
export type ConfirmedHardwareMode = HardwarePerformanceMode | 'unknown';
export type UserPolicyMode = 'manual' | 'smart' | 'daily_smooth';
export type PolicyRuntimeStatus = 'idle' | 'applying' | 'active' | 'restore_failed';

export type PowerSource = 'ac' | 'battery' | 'unknown';
export type ChargingState = 'charging' | 'discharging' | 'full' | 'not_charging' | 'unknown';
export type DataSourceKind = 'demo' | 'hardware';
export type ConnectionState = 'connected' | 'reconnecting' | 'disconnected';
export type ConfirmationKind = 'hardware_readback' | 'os_state' | 'event_only' | 'unverified';

export type ClientErrorCode =
  | 'SERVICE_OFFLINE'
  | 'PROTOCOL_MISMATCH'
  | 'PERMISSION_DENIED'
  | 'CAPABILITY_UNAVAILABLE'
  | 'DEVICE_BUSY'
  | 'TIMEOUT'
  | 'READBACK_MISMATCH'
  | 'RESTORE_FAILED';

export interface ClientError {
  code: ClientErrorCode;
  message: string;
  detail?: string;
  requestedValue?: string;
  actualReadbackValue?: string;
  retryable: boolean;
  timestamp: string;
}

export interface FeatureCapability<TOption extends string | number = string> {
  readable: boolean;
  writable: boolean;
  options?: TOption[];
  confirmation: ConfirmationKind;
  unavailableReason?: string;
}

export interface DeviceCapabilities {
  protocolVersion: string;
  serviceVersion: string;
  dataSource: DataSourceKind;
  refreshedAt: string;
  performanceMode: FeatureCapability<HardwarePerformanceMode>;
  dailySmooth: FeatureCapability<'enabled' | 'disabled'>;
  smartMode: FeatureCapability<'enabled' | 'disabled'>;
  telemetry: FeatureCapability;
  batteryChargeLimit: FeatureCapability<number>;
  keyboardBacklight: FeatureCapability<0 | 1 | 2>;
  keyboardBacklightTimer: FeatureCapability<number>;
  winKeyLock: FeatureCapability<'locked' | 'unlocked'>;
  touchpad: FeatureCapability<'enabled' | 'disabled'>;
  microphoneMute: FeatureCapability<'muted' | 'unmuted'>;
  cameraPresence: FeatureCapability<'connected' | 'disconnected'>;
  refreshRate: FeatureCapability<60 | 120>;
}

export interface UncalibratedSensorReading {
  id: string;
  label: string;
  rawValue: number | null;
  hexPreview?: string;
  source: string;
  calibrated: false;
  note: string;
  isStale?: boolean;
}

export interface DeviceSnapshot {
  protocolVersion: string;
  serviceInstanceId: string;
  revision: number;
  dataSource: DataSourceKind;
  capturedAt: string;
  isStale: boolean;

  device: {
    modelName: string;
    platformCodename: string;
    cpuName: string;
    biosVersion: string;
    panelInfo: string;
  };

  power: {
    powerSource: PowerSource;
    chargingState: ChargingState;
    batteryPercent: number | null;
    batteryPowerWatts: number | null;
    windowsPowerPlan: string;
    chargeLimitMinRaw: number | null;
    chargeLimitMaxRaw: number | null;
    chargeModeRaw: number | null;
  };

  mode: {
    hardwareMode: ConfirmedHardwareMode;
    firmwarePpmdRaw: number | null;
    selectedPolicy: UserPolicyMode;
    policyStatus: PolicyRuntimeStatus;
    policyStatusDetail?: string;
    smartDecisionReason?: string;
  };

  telemetry: {
    cpuPackagePowerWatts: number | null;
    cpuPackagePowerUnavailableReason?: string;
    cpuFrequencyMhz: number | null;
    cpuFrequencyUnavailableReason?: string;
    rawSensors: UncalibratedSensorReading[];
    telemetryActive: boolean;
  };

  controls: {
    fnLocked: boolean | null;
    touchpadEnabled: boolean | null;
    micMuted: boolean | null;
    keyboardBacklightLevel: 0 | 1 | 2 | null;
    keyboardCloseTimerSec: number | null;
    winKeyLocked: boolean | null;
    cameraConnected: boolean | null;
    refreshRateHz: 60 | 120 | null;
  };
}

export type HotkeyActionKind =
  | 'performance_mode_balanced'
  | 'performance_mode_performance'
  | 'fn_lock_unlocked'
  | 'fn_lock_locked'
  | 'touchpad_disabled'
  | 'touchpad_enabled'
  | 'mic_mute_toggle'
  | 'keyboard_backlight_off'
  | 'keyboard_backlight_half'
  | 'keyboard_backlight_high'
  | 'refresh_rate_switch'
  | 'camera_connected'
  | 'camera_disconnected';

export interface HotkeyEvent {
  eventId: string;
  timestamp: string;
  codeHex: string;
  action: HotkeyActionKind;
  title: string;
  stateLabel: string;
  stateConfirmed: boolean;
  osdDurationMs: number;
  sourceNote: string;
}

export interface StatusEvent {
  type: 'snapshot' | 'capabilities' | 'connection';
  connectionState: ConnectionState;
  snapshot?: DeviceSnapshot;
  capabilities?: DeviceCapabilities;
  error?: ClientError;
}

export interface SetPerformanceModeResult {
  ok: boolean;
  confirmedHardwareMode: ConfirmedHardwareMode;
  snapshot: DeviceSnapshot;
  error?: ClientError;
}

export interface PolicyActionResult {
  ok: boolean;
  snapshot: DeviceSnapshot;
  error?: ClientError;
}

export type DeviceControlRequest =
  | { control: 'keyboardBacklight'; value: 0 | 1 | 2 }
  | { control: 'keyboardBacklightTimer'; value: number }
  | { control: 'winKeyLock'; value: boolean }
  | { control: 'refreshRate'; value: 60 | 120 };

export interface DeviceControlResult {
  ok: boolean;
  snapshot: DeviceSnapshot;
  error?: ClientError;
}

export interface IDeviceClient {
  readonly id: string;
  readonly displayName: string;
  readonly dataSource: DataSourceKind;
  getConnectionState(): ConnectionState;
  getCapabilities(): Promise<DeviceCapabilities>;
  getSnapshot(): Promise<DeviceSnapshot>;
  setPerformanceMode(mode: HardwarePerformanceMode): Promise<SetPerformanceModeResult>;
  setPolicyMode(policy: UserPolicyMode): Promise<PolicyActionResult>;
  restoreDailySmooth(): Promise<PolicyActionResult>;
  setDeviceControl(request: DeviceControlRequest): Promise<DeviceControlResult>;
  subscribeStatus(listener: (event: StatusEvent) => void): () => void;
  subscribeHotkey(listener: (event: HotkeyEvent) => void): () => void;
  setTelemetryActive(active: boolean): void;
  reconnect(): Promise<{ capabilities: DeviceCapabilities; snapshot: DeviceSnapshot }>;
  dispose(): void;
}
