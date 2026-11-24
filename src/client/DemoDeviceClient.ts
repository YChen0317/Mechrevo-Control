import {
  ClientError,
  ConnectionState,
  DeviceCapabilities,
  DeviceControlRequest,
  DeviceControlResult,
  DeviceSnapshot,
  HardwarePerformanceMode,
  HotkeyActionKind,
  HotkeyEvent,
  IDeviceClient,
  PolicyActionResult,
  SetPerformanceModeResult,
  StatusEvent,
  UserPolicyMode,
} from './contracts';

export type DemoLoadPreset =
  | 'ac_idle'
  | 'ac_dual_burn'
  | 'battery_office'
  | 'sensor_partial_unavailable';

export type DemoSwitchOutcome =
  | 'success'
  | 'readback_mismatch'
  | 'permission_denied'
  | 'device_busy'
  | 'timeout';

export interface DemoFaultConfig {
  loadPreset: DemoLoadPreset;
  nextSwitchOutcome: DemoSwitchOutcome;
  dailySmoothCapable: boolean;
  smartModeCapable: boolean;
  dailySmoothRestoreFails: boolean;
  simulateDisconnected: boolean;
  telemetryTickCount: number;
  telemetryRunning: boolean;
}

const PROTOCOL_VERSION = '1.0.0-draft';
const SERVICE_VERSION = '0.1.0-demo';

function nowIso(): string {
  return new Date().toISOString();
}

function jitter(base: number, span: number): number {
  const delta = (Math.random() - 0.5) * 2 * span;
  return Number((base + delta).toFixed(2));
}

export class DemoDeviceClient implements IDeviceClient {
  readonly id = 'demo-client';
  readonly displayName = '演示客户端（DemoDeviceClient）';
  readonly dataSource = 'demo' as const;

  private serviceInstanceId = 'demo-svc-01';
  private revision = 1;
  private connectionState: ConnectionState = 'connected';
  private telemetryActive = true;
  private telemetryTimer: ReturnType<typeof setInterval> | null = null;
  private telemetryTickCount = 0;
  private isWriteBusy = false;

  private loadPreset: DemoLoadPreset = 'ac_dual_burn';
  private nextSwitchOutcome: DemoSwitchOutcome = 'success';
  private dailySmoothCapable = false;
  private smartModeCapable = false;
  private dailySmoothRestoreFails = false;

  private statusListeners = new Set<(event: StatusEvent) => void>();
  private hotkeyListeners = new Set<(event: HotkeyEvent) => void>();
  private configListeners = new Set<(config: DemoFaultConfig) => void>();

  private capabilities: DeviceCapabilities;
  private snapshot: DeviceSnapshot;

  constructor() {
    this.capabilities = this.buildCapabilities();
    this.snapshot = this.buildInitialSnapshot();
    this.syncTelemetryLoop();
  }

  private buildCapabilities(): DeviceCapabilities {
    const connected = this.connectionState === 'connected';
    return {
      protocolVersion: PROTOCOL_VERSION,
      serviceVersion: SERVICE_VERSION,
      dataSource: 'demo',
      refreshedAt: nowIso(),
      performanceMode: {
        readable: connected,
        writable: connected,
        options: ['balanced', 'performance'],
        confirmation: 'hardware_readback',
        unavailableReason: connected ? undefined : '设备服务已断线，无法读写档位',
      },
      dailySmooth: {
        readable: connected,
        writable: connected && this.dailySmoothCapable,
        options: ['enabled', 'disabled'],
        confirmation: 'os_state',
        unavailableReason: !connected
          ? '设备服务已断线'
          : this.dailySmoothCapable
            ? undefined
            : '待后端完成平衡档帧时间与空闲功耗实机验收后开放',
      },
      smartMode: {
        readable: connected,
        writable: connected && this.smartModeCapable,
        options: ['enabled', 'disabled'],
        confirmation: 'hardware_readback',
        unavailableReason: !connected
          ? '设备服务已断线'
          : this.smartModeCapable
            ? undefined
            : '待后端完成独立切档验证与持续负载阈值测定后开放',
      },
      telemetry: {
        readable: connected,
        writable: false,
        confirmation: 'os_state',
        unavailableReason: connected ? undefined : '设备服务已断线',
      },
      batteryChargeLimit: {
        readable: connected,
        writable: false,
        confirmation: 'unverified',
        unavailableReason: '原厂界面无限充入口；固件 MICP/MXCP/EBCM 读数为 0，待实机停充与恢复验证',
      },
      keyboardBacklight: {
        readable: connected,
        writable: connected,
        options: [0, 1, 2],
        confirmation: 'hardware_readback',
        unavailableReason: connected ? undefined : '设备服务已断线',
      },
      keyboardBacklightTimer: {
        readable: connected,
        writable: connected,
        options: [0, 10, 15, 30, 60, 300],
        confirmation: 'os_state',
        unavailableReason: connected ? undefined : '设备服务已断线',
      },
      winKeyLock: {
        readable: connected,
        writable: connected,
        options: ['unlocked', 'locked'],
        confirmation: 'os_state',
        unavailableReason: connected ? undefined : '设备服务已断线',
      },
      touchpad: {
        readable: connected,
        writable: false,
        options: ['enabled', 'disabled'],
        confirmation: 'event_only',
        unavailableReason: '触摸板由固件执行切换，收到 0x30/0x31 事件后直接同步状态',
      },
      microphoneMute: {
        readable: connected,
        writable: false,
        options: ['unmuted', 'muted'],
        confirmation: 'os_state',
        unavailableReason: '首版只读观察，待确认原厂热键程序退出后接管会话音频静音',
      },
      cameraPresence: {
        readable: connected,
        writable: false,
        options: ['connected', 'disconnected'],
        confirmation: 'os_state',
        unavailableReason: '物理隐私开关会令 USB 复合设备退枚举，界面仅展示 PnP 在线状态',
      },
      refreshRate: {
        readable: connected,
        writable: connected,
        options: [60, 120],
        confirmation: 'os_state',
        unavailableReason: connected ? undefined : '设备服务已断线',
      },
    };
  }

  private buildInitialSnapshot(): DeviceSnapshot {
    const base: DeviceSnapshot = {
      protocolVersion: PROTOCOL_VERSION,
      serviceInstanceId: this.serviceInstanceId,
      revision: this.revision,
      dataSource: 'demo',
      capturedAt: nowIso(),
      isStale: false,
      device: {
        modelName: '机械革命 无界 14 MAX',
        platformCodename: 'Dove4 · Lunar Lake',
        cpuName: 'Intel Core Ultra 7 256V',
        biosVersion: 'WUJIE14Max_Dove4_LNL326_MC_OLED_Rev05',
        panelInfo: 'VXN03E8 · 2880×1800 @ 60/120 Hz',
      },
      power: {
        powerSource: 'ac',
        chargingState: 'not_charging',
        batteryPercent: 86,
        batteryPowerWatts: 0.0,
        windowsPowerPlan: '平衡 (381b4222-f694-41f0-9685-ff5bb260df2e)',
        chargeLimitMinRaw: 0,
        chargeLimitMaxRaw: 0,
        chargeModeRaw: 0,
      },
      mode: {
        hardwareMode: 'balanced',
        firmwarePpmdRaw: 1,
        selectedPolicy: 'manual',
        policyStatus: 'idle',
      },
      telemetry: {
        cpuPackagePowerWatts: 17.09,
        cpuFrequencyMhz: 1320,
        telemetryActive: this.telemetryActive,
        rawSensors: [
          {
            id: 'fan1',
            label: '风扇通道 1',
            rawValue: 3878,
            source: 'EmdAcpi_FanControl.GetFanSpeed (WMAF)',
            calibrated: false,
            note: '原始读数，转速单位与换算比例待核实',
          },
          {
            id: 'fan2',
            label: '风扇通道 2',
            rawValue: 3698,
            source: 'EmdAcpi_FanControl.GetFanSpeed (WMAF)',
            calibrated: false,
            note: '原始读数，转速单位与换算比例待核实',
          },
          {
            id: 'ec_tsr4',
            label: 'EC 温区 TSR4',
            rawValue: 54,
            source: 'EmdAcpi_ECInformation (WMAD)',
            calibrated: false,
            note: '原始读数，传感器物理位置与量纲待核实',
          },
          {
            id: 'typec_vbus',
            label: 'USB-C VBUS',
            rawValue: 200,
            hexPreview: '0xC8',
            source: 'EmdAcpi_GetTypeCVBUS (WMBA)',
            calibrated: false,
            note: '插电实测返回十进制 200（0xC8），离电为 0，量纲待核实',
          },
        ],
      },
      controls: {
        fnLocked: true,
        touchpadEnabled: true,
        micMuted: false,
        keyboardBacklightLevel: 1,
        keyboardCloseTimerSec: 10,
        winKeyLocked: false,
        cameraConnected: true,
        refreshRateHz: 120,
      },
    };
    return this.applyLoadPresetToSnapshot(base, this.loadPreset);
  }

  private applyLoadPresetToSnapshot(snap: DeviceSnapshot, preset: DemoLoadPreset): DeviceSnapshot {
    const isPerf = snap.mode.hardwareMode === 'performance';
    const next: DeviceSnapshot = structuredClone(snap);
    next.capturedAt = nowIso();
    next.telemetry.telemetryActive = this.telemetryActive;

    if (preset === 'ac_idle') {
      next.power.powerSource = 'ac';
      next.power.chargingState = 'charging';
      next.power.batteryPercent = 82;
      next.power.batteryPowerWatts = jitter(24.8, 0.8);
      next.telemetry.cpuPackagePowerWatts = isPerf ? jitter(4.1, 0.3) : jitter(1.35, 0.25);
      next.telemetry.cpuPackagePowerUnavailableReason = undefined;
      next.telemetry.cpuFrequencyMhz = isPerf ? Math.round(jitter(2150, 90)) : Math.round(jitter(1180, 70));
      next.telemetry.cpuFrequencyUnavailableReason = undefined;
      next.telemetry.rawSensors = [
        {
          id: 'fan1',
          label: '风扇通道 1',
          rawValue: 3823,
          source: 'EmdAcpi_FanControl.GetFanSpeed (WMAF)',
          calibrated: false,
          note: '原始读数，单位待核实',
        },
        {
          id: 'fan2',
          label: '风扇通道 2',
          rawValue: isPerf ? 3717 : 3692,
          source: 'EmdAcpi_FanControl.GetFanSpeed (WMAF)',
          calibrated: false,
          note: '原始读数，单位待核实',
        },
        {
          id: 'ec_tsr4',
          label: 'EC 温区 TSR4',
          rawValue: isPerf ? 44 : 39,
          source: 'EmdAcpi_ECInformation (WMAD)',
          calibrated: false,
          note: '原始读数，传感器位置待核实',
        },
        {
          id: 'typec_vbus',
          label: 'USB-C VBUS',
          rawValue: 200,
          hexPreview: '0xC8',
          source: 'EmdAcpi_GetTypeCVBUS (WMBA)',
          calibrated: false,
          note: '插电返回 200（0xC8），量纲待核实',
        },
      ];
    } else if (preset === 'ac_dual_burn') {
      next.power.powerSource = 'ac';
      next.power.chargingState = 'not_charging';
      next.power.batteryPercent = 94;
      next.power.batteryPowerWatts = 0.0;
      // Reference from docs/dove4-mode-measurements.md (17.09W balanced / 29.91W performance)
      next.telemetry.cpuPackagePowerWatts = isPerf ? jitter(29.91, 0.45) : jitter(17.09, 0.35);
      next.telemetry.cpuPackagePowerUnavailableReason = undefined;
      next.telemetry.cpuFrequencyMhz = isPerf ? Math.round(jitter(1960, 40)) : Math.round(jitter(1300, 30));
      next.telemetry.cpuFrequencyUnavailableReason = undefined;
      next.telemetry.rawSensors = [
        {
          id: 'fan1',
          label: '风扇通道 1',
          rawValue: isPerf ? 3906 : 3878,
          source: 'EmdAcpi_FanControl.GetFanSpeed (WMAF)',
          calibrated: false,
          note: '原始读数，单位待核实',
        },
        {
          id: 'fan2',
          label: '风扇通道 2',
          rawValue: isPerf ? 3717 : 3698,
          source: 'EmdAcpi_FanControl.GetFanSpeed (WMAF)',
          calibrated: false,
          note: '原始读数，单位待核实',
        },
        {
          id: 'ec_tsr4',
          label: 'EC 温区 TSR4',
          rawValue: isPerf ? 63 : 56,
          source: 'EmdAcpi_ECInformation (WMAD)',
          calibrated: false,
          note: '原始读数，传感器位置待核实',
        },
        {
          id: 'typec_vbus',
          label: 'USB-C VBUS',
          rawValue: 200,
          hexPreview: '0xC8',
          source: 'EmdAcpi_GetTypeCVBUS (WMBA)',
          calibrated: false,
          note: '插电返回 200（0xC8），量纲待核实',
        },
      ];
    } else if (preset === 'battery_office') {
      next.power.powerSource = 'battery';
      next.power.chargingState = 'discharging';
      next.power.batteryPercent = 67;
      next.power.batteryPowerWatts = isPerf ? -jitter(18.6, 0.6) : -jitter(9.4, 0.5);
      next.telemetry.cpuPackagePowerWatts = isPerf ? jitter(10.2, 0.4) : jitter(4.15, 0.3);
      next.telemetry.cpuPackagePowerUnavailableReason = undefined;
      next.telemetry.cpuFrequencyMhz = isPerf ? Math.round(jitter(2480, 80)) : Math.round(jitter(1640, 65));
      next.telemetry.cpuFrequencyUnavailableReason = undefined;
      next.telemetry.rawSensors = [
        {
          id: 'fan1',
          label: '风扇通道 1',
          rawValue: 0,
          source: 'EmdAcpi_FanControl.GetFanSpeed (WMAF)',
          calibrated: false,
          note: '真实读数为 0（非缺失）',
        },
        {
          id: 'fan2',
          label: '风扇通道 2',
          rawValue: 0,
          source: 'EmdAcpi_FanControl.GetFanSpeed (WMAF)',
          calibrated: false,
          note: '真实读数为 0（非缺失）',
        },
        {
          id: 'ec_tsr4',
          label: 'EC 温区 TSR4',
          rawValue: 41,
          source: 'EmdAcpi_ECInformation (WMAD)',
          calibrated: false,
          note: '原始读数，传感器位置待核实',
        },
        {
          id: 'typec_vbus',
          label: 'USB-C VBUS',
          rawValue: 0,
          hexPreview: '0x00',
          source: 'EmdAcpi_GetTypeCVBUS (WMBA)',
          calibrated: false,
          note: '离电真实读数为 0（非缺失）',
        },
      ];
    } else {
      // sensor_partial_unavailable: demonstrates null (unavailable) vs real 0
      next.power.powerSource = 'ac';
      next.power.chargingState = 'full';
      next.power.batteryPercent = 100;
      next.power.batteryPowerWatts = 0.0;
      next.telemetry.cpuPackagePowerWatts = null;
      next.telemetry.cpuPackagePowerUnavailableReason = 'Windows Energy Meter 计数器暂不可读（权限或采样超时）';
      next.telemetry.cpuFrequencyMhz = Math.round(jitter(1820, 50));
      next.telemetry.cpuFrequencyUnavailableReason = undefined;
      next.telemetry.rawSensors = [
        {
          id: 'fan1',
          label: '风扇通道 1',
          rawValue: null,
          source: 'EmdAcpi_FanControl.GetFanSpeed (WMAF)',
          calibrated: false,
          note: '单路传感器读取超时（返回 null，不影响其余读数）',
          isStale: true,
        },
        {
          id: 'fan2',
          label: '风扇通道 2',
          rawValue: 0,
          source: 'EmdAcpi_FanControl.GetFanSpeed (WMAF)',
          calibrated: false,
          note: '真实零值读数（0 ≠ 不可用）',
        },
        {
          id: 'ec_tsr4',
          label: 'EC 温区 TSR4',
          rawValue: null,
          source: 'EmdAcpi_ECInformation (WMAD)',
          calibrated: false,
          note: '当前未取得有效 EC 温区读数（null）',
          isStale: true,
        },
        {
          id: 'typec_vbus',
          label: 'USB-C VBUS',
          rawValue: 200,
          hexPreview: '0xC8',
          source: 'EmdAcpi_GetTypeCVBUS (WMBA)',
          calibrated: false,
          note: '插电原始值 200（0xC8）',
        },
      ];
    }

    return next;
  }

  private syncTelemetryLoop(): void {
    if (this.telemetryTimer) {
      clearInterval(this.telemetryTimer);
      this.telemetryTimer = null;
    }

    if (this.telemetryActive && this.connectionState === 'connected') {
      this.telemetryTimer = setInterval(() => {
        if (this.connectionState !== 'connected' || !this.telemetryActive) return;
        this.telemetryTickCount += 1;
        this.revision += 1;
        this.snapshot = this.applyLoadPresetToSnapshot(this.snapshot, this.loadPreset);
        this.snapshot.revision = this.revision;
        this.snapshot.isStale = false;
        this.emitStatus({
          type: 'snapshot',
          connectionState: this.connectionState,
          snapshot: structuredClone(this.snapshot),
        });
        this.emitConfig();
      }, 1400);
    }

    this.snapshot.telemetry.telemetryActive = this.telemetryActive && this.connectionState === 'connected';
    this.emitConfig();
  }

  private emitStatus(event: StatusEvent): void {
    this.statusListeners.forEach((listener) => listener(event));
  }

  private emitHotkey(event: HotkeyEvent): void {
    this.hotkeyListeners.forEach((listener) => listener(event));
  }

  private emitConfig(): void {
    const cfg = this.getDemoConfig();
    this.configListeners.forEach((listener) => listener(cfg));
  }

  getDemoConfig(): DemoFaultConfig {
    return {
      loadPreset: this.loadPreset,
      nextSwitchOutcome: this.nextSwitchOutcome,
      dailySmoothCapable: this.dailySmoothCapable,
      smartModeCapable: this.smartModeCapable,
      dailySmoothRestoreFails: this.dailySmoothRestoreFails,
      simulateDisconnected: this.connectionState === 'disconnected',
      telemetryTickCount: this.telemetryTickCount,
      telemetryRunning: Boolean(this.telemetryTimer),
    };
  }

  subscribeDemoConfig(listener: (config: DemoFaultConfig) => void): () => void {
    this.configListeners.add(listener);
    listener(this.getDemoConfig());
    return () => {
      this.configListeners.delete(listener);
    };
  }

  setDemoLoadPreset(preset: DemoLoadPreset): void {
    this.loadPreset = preset;
    if (this.connectionState === 'connected') {
      this.revision += 1;
      this.snapshot = this.applyLoadPresetToSnapshot(this.snapshot, preset);
      this.snapshot.revision = this.revision;
      this.emitStatus({
        type: 'snapshot',
        connectionState: this.connectionState,
        snapshot: structuredClone(this.snapshot),
      });
    }
    this.emitConfig();
  }

  setNextSwitchOutcome(outcome: DemoSwitchOutcome): void {
    this.nextSwitchOutcome = outcome;
    this.emitConfig();
  }

  setPolicyCapabilityGate(target: 'dailySmooth' | 'smartMode', enabled: boolean): void {
    if (target === 'dailySmooth') {
      this.dailySmoothCapable = enabled;
      if (!enabled && this.snapshot.mode.selectedPolicy === 'daily_smooth') {
        this.snapshot.mode.selectedPolicy = 'manual';
        this.snapshot.mode.policyStatus = 'idle';
        this.snapshot.mode.policyStatusDetail = undefined;
      }
    } else {
      this.smartModeCapable = enabled;
      if (!enabled && this.snapshot.mode.selectedPolicy === 'smart') {
        this.snapshot.mode.selectedPolicy = 'manual';
        this.snapshot.mode.policyStatus = 'idle';
        this.snapshot.mode.smartDecisionReason = undefined;
      }
    }

    this.capabilities = this.buildCapabilities();
    if (this.connectionState === 'connected') {
      this.revision += 1;
      this.snapshot.revision = this.revision;
      this.snapshot.capturedAt = nowIso();
      this.emitStatus({
        type: 'capabilities',
        connectionState: this.connectionState,
        capabilities: structuredClone(this.capabilities),
        snapshot: structuredClone(this.snapshot),
      });
    }
    this.emitConfig();
  }

  setDailySmoothRestoreFails(fails: boolean): void {
    this.dailySmoothRestoreFails = fails;
    this.emitConfig();
  }

  simulateDisconnect(): void {
    this.connectionState = 'disconnected';
    this.syncTelemetryLoop();
    this.capabilities = this.buildCapabilities();
    this.snapshot = {
      ...structuredClone(this.snapshot),
      isStale: true,
      telemetry: {
        ...structuredClone(this.snapshot.telemetry),
        telemetryActive: false,
      },
    };
    this.emitStatus({
      type: 'connection',
      connectionState: 'disconnected',
      capabilities: structuredClone(this.capabilities),
      snapshot: structuredClone(this.snapshot),
      error: {
        code: 'SERVICE_OFFLINE',
        message: '设备服务连接已中断',
        detail: '无法连接到本机后端服务（演示模拟断线）。界面保留最后一次确认的状态并标记为过期，写入操作已锁定。',
        retryable: true,
        timestamp: nowIso(),
      },
    });
    this.emitConfig();
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  async getCapabilities(): Promise<DeviceCapabilities> {
    await this.delay(120);
    if (this.connectionState !== 'connected') {
      throw this.makeOfflineError();
    }
    this.capabilities = this.buildCapabilities();
    return structuredClone(this.capabilities);
  }

  async getSnapshot(): Promise<DeviceSnapshot> {
    await this.delay(120);
    if (this.connectionState !== 'connected') {
      throw this.makeOfflineError();
    }
    return structuredClone(this.snapshot);
  }

  async setPerformanceMode(mode: HardwarePerformanceMode): Promise<SetPerformanceModeResult> {
    if (this.connectionState !== 'connected') {
      return {
        ok: false,
        confirmedHardwareMode: this.snapshot.mode.hardwareMode,
        snapshot: structuredClone(this.snapshot),
        error: this.makeOfflineError(mode),
      };
    }

    if (this.isWriteBusy) {
      return {
        ok: false,
        confirmedHardwareMode: this.snapshot.mode.hardwareMode,
        snapshot: structuredClone(this.snapshot),
        error: {
          code: 'DEVICE_BUSY',
          message: '设备操作队列繁忙',
          detail: '上一个固件切档请求尚未完成读回，请稍后重试。',
          requestedValue: mode,
          actualReadbackValue: this.snapshot.mode.hardwareMode,
          retryable: true,
          timestamp: nowIso(),
        },
      };
    }

    this.isWriteBusy = true;
    try {
      // If Daily Smooth is active, switching manual mode must restore Daily Smooth first
      if (this.snapshot.mode.selectedPolicy === 'daily_smooth') {
        if (this.dailySmoothRestoreFails) {
          await this.delay(520);
          this.revision += 1;
          this.snapshot.revision = this.revision;
          this.snapshot.mode.policyStatus = 'restore_failed';
          this.snapshot.mode.policyStatusDetail = '切回手动档前恢复 Windows 交互提示原值失败，保留原档位与错误状态';
          this.emitStatus({
            type: 'snapshot',
            connectionState: this.connectionState,
            snapshot: structuredClone(this.snapshot),
          });
          return {
            ok: false,
            confirmedHardwareMode: this.snapshot.mode.hardwareMode,
            snapshot: structuredClone(this.snapshot),
            error: {
              code: 'RESTORE_FAILED',
              message: '恢复「日用流畅」原配置失败，已中止切档',
              detail: '切换至手动档前需先回滚平衡档内修改的交互提示配置；回滚未确认成功，因此硬件档位保持最后确认值不变。',
              requestedValue: mode,
              actualReadbackValue: this.snapshot.mode.hardwareMode,
              retryable: true,
              timestamp: nowIso(),
            },
          };
        }
      }

      // Already in target hardware mode: return confirmed value directly (per backend-handoff.md)
      if (this.snapshot.mode.hardwareMode === mode && this.snapshot.mode.selectedPolicy === 'manual' && this.nextSwitchOutcome === 'success') {
        await this.delay(220);
        return {
          ok: true,
          confirmedHardwareMode: mode,
          snapshot: structuredClone(this.snapshot),
        };
      }

      // Simulate firmware write + readback latency
      await this.delay(this.nextSwitchOutcome === 'timeout' ? 950 : 560);

      if (this.connectionState !== 'connected') {
        return {
          ok: false,
          confirmedHardwareMode: this.snapshot.mode.hardwareMode,
          snapshot: structuredClone(this.snapshot),
          error: this.makeOfflineError(mode),
        };
      }

      const prevMode = this.snapshot.mode.hardwareMode;

      if (this.nextSwitchOutcome === 'readback_mismatch') {
        const err: ClientError = {
          code: 'READBACK_MISMATCH',
          message: '写后读回不一致，档位未更新',
          detail: `已请求写入「${mode === 'performance' ? '性能' : '平衡'}」，但读回 EmdAcpi_PowerPlanMode.GetPowerPlanMode 仍为「${prevMode === 'performance' ? '性能 (PPMD=2)' : '平衡 (PPMD=1)'}」。界面保持最后确认档位。`,
          requestedValue: mode,
          actualReadbackValue: prevMode,
          retryable: true,
          timestamp: nowIso(),
        };
        return {
          ok: false,
          confirmedHardwareMode: prevMode,
          snapshot: structuredClone(this.snapshot),
          error: err,
        };
      }

      if (this.nextSwitchOutcome === 'permission_denied') {
        const err: ClientError = {
          code: 'PERMISSION_DENIED',
          message: '后端写入权限不足',
          detail: '服务账户或命名管道调用方未通过写操作 ACL 校验，已拒绝固件切档写入。',
          requestedValue: mode,
          actualReadbackValue: prevMode,
          retryable: false,
          timestamp: nowIso(),
        };
        return {
          ok: false,
          confirmedHardwareMode: prevMode,
          snapshot: structuredClone(this.snapshot),
          error: err,
        };
      }

      if (this.nextSwitchOutcome === 'device_busy') {
        const err: ClientError = {
          code: 'DEVICE_BUSY',
          message: '固件通道忙，切档被拒绝',
          detail: 'EC / ACPI 写队列正处理其他指令，本次请求未执行，客户端不会自动重放。',
          requestedValue: mode,
          actualReadbackValue: prevMode,
          retryable: true,
          timestamp: nowIso(),
        };
        return {
          ok: false,
          confirmedHardwareMode: prevMode,
          snapshot: structuredClone(this.snapshot),
          error: err,
        };
      }

      if (this.nextSwitchOutcome === 'timeout') {
        const err: ClientError = {
          code: 'TIMEOUT',
          message: '读回确认超时，结果未知',
          detail: '写入请求在限时内未收到固件读回确认。已重新同步当前快照，界面维持最后确认值且不会自动重放写请求。',
          requestedValue: mode,
          actualReadbackValue: prevMode,
          retryable: true,
          timestamp: nowIso(),
        };
        return {
          ok: false,
          confirmedHardwareMode: prevMode,
          snapshot: structuredClone(this.snapshot),
          error: err,
        };
      }

      // Confirmed readback success!
      this.revision += 1;
      this.snapshot.revision = this.revision;
      this.snapshot.mode.hardwareMode = mode;
      this.snapshot.mode.firmwarePpmdRaw = mode === 'performance' ? 2 : 1;
      // Manual hardware mode selection cancels auto/smart/daily_smooth policy per handoff docs
      this.snapshot.mode.selectedPolicy = 'manual';
      this.snapshot.mode.policyStatus = 'idle';
      this.snapshot.mode.policyStatusDetail = undefined;
      this.snapshot.mode.smartDecisionReason = undefined;
      this.snapshot = this.applyLoadPresetToSnapshot(this.snapshot, this.loadPreset);
      this.snapshot.revision = this.revision;

      this.emitStatus({
        type: 'snapshot',
        connectionState: this.connectionState,
        snapshot: structuredClone(this.snapshot),
      });

      this.emitHotkey({
        eventId: `evt-${Date.now()}`,
        timestamp: nowIso(),
        codeHex: mode === 'performance' ? '0x42' : '0x41',
        action: mode === 'performance' ? 'performance_mode_performance' : 'performance_mode_balanced',
        title: '性能档位已确认',
        stateLabel: mode === 'performance' ? '硬件性能档 (PPMD = 2)' : '硬件平衡档 (PPMD = 1)',
        stateConfirmed: true,
        osdDurationMs: 1000,
        sourceNote: '经 EmdAcpi_PowerPlanMode 读回确认后更新',
      });

      return {
        ok: true,
        confirmedHardwareMode: mode,
        snapshot: structuredClone(this.snapshot),
      };
    } finally {
      this.isWriteBusy = false;
    }
  }

  async setPolicyMode(policy: UserPolicyMode): Promise<PolicyActionResult> {
    if (this.connectionState !== 'connected') {
      return {
        ok: false,
        snapshot: structuredClone(this.snapshot),
        error: this.makeOfflineError(policy),
      };
    }

    if (policy === 'daily_smooth' && !this.capabilities.dailySmooth.writable) {
      return {
        ok: false,
        snapshot: structuredClone(this.snapshot),
        error: {
          code: 'CAPABILITY_UNAVAILABLE',
          message: '「日用流畅」尚未开放实机操作',
          detail: this.capabilities.dailySmooth.unavailableReason,
          retryable: false,
          timestamp: nowIso(),
        },
      };
    }

    if (policy === 'smart' && !this.capabilities.smartMode.writable) {
      return {
        ok: false,
        snapshot: structuredClone(this.snapshot),
        error: {
          code: 'CAPABILITY_UNAVAILABLE',
          message: '「智能选档」尚未开放实机操作',
          detail: this.capabilities.smartMode.unavailableReason,
          retryable: false,
          timestamp: nowIso(),
        },
      };
    }

    // Switching away from daily_smooth requires restoring original Windows interaction hints first
    if (this.snapshot.mode.selectedPolicy === 'daily_smooth' && policy !== 'daily_smooth') {
      const restore = await this.restoreDailySmooth();
      if (!restore.ok) {
        return restore;
      }
    }

    await this.delay(450);

    this.revision += 1;
    this.snapshot.revision = this.revision;
    if (policy === 'daily_smooth') {
      // Daily smooth runs strictly on top of hardware balanced mode
      this.snapshot.mode.hardwareMode = 'balanced';
      this.snapshot.mode.firmwarePpmdRaw = 1;
      this.snapshot.mode.selectedPolicy = 'daily_smooth';
      this.snapshot.mode.policyStatus = 'active';
      this.snapshot.mode.policyStatusDetail = '已在硬件平衡档内应用验证后的交互响应提示，智能选档已自动暂停';
      this.snapshot.mode.smartDecisionReason = undefined;
    } else if (policy === 'smart') {
      const shouldPerf = this.loadPreset === 'ac_dual_burn';
      this.snapshot.mode.selectedPolicy = 'smart';
      this.snapshot.mode.policyStatus = 'active';
      this.snapshot.mode.hardwareMode = shouldPerf ? 'performance' : 'balanced';
      this.snapshot.mode.firmwarePpmdRaw = shouldPerf ? 2 : 1;
      this.snapshot.mode.smartDecisionReason = shouldPerf
        ? '检测到插电持续高负载，智能策略已请求并读回确认硬件性能档'
        : this.loadPreset === 'battery_office'
          ? '离电状态默认偏向平衡，当前维持硬件平衡档'
          : '当前负载平稳，维持硬件平衡档以降低静置功耗';
      this.snapshot.mode.policyStatusDetail = this.snapshot.mode.smartDecisionReason;
    } else {
      this.snapshot.mode.selectedPolicy = 'manual';
      this.snapshot.mode.policyStatus = 'idle';
      this.snapshot.mode.policyStatusDetail = undefined;
      this.snapshot.mode.smartDecisionReason = undefined;
    }

    this.snapshot = this.applyLoadPresetToSnapshot(this.snapshot, this.loadPreset);
    this.snapshot.revision = this.revision;

    this.emitStatus({
      type: 'snapshot',
      connectionState: this.connectionState,
      snapshot: structuredClone(this.snapshot),
    });

    return {
      ok: true,
      snapshot: structuredClone(this.snapshot),
    };
  }

  async restoreDailySmooth(): Promise<PolicyActionResult> {
    if (this.connectionState !== 'connected') {
      return {
        ok: false,
        snapshot: structuredClone(this.snapshot),
        error: this.makeOfflineError('restore_daily_smooth'),
      };
    }

    await this.delay(460);

    if (this.dailySmoothRestoreFails) {
      this.revision += 1;
      this.snapshot.revision = this.revision;
      this.snapshot.mode.policyStatus = 'restore_failed';
      this.snapshot.mode.policyStatusDetail = '恢复原 Windows 电源子设置读回校验失败，保留最后确认状态';
      this.emitStatus({
        type: 'snapshot',
        connectionState: this.connectionState,
        snapshot: structuredClone(this.snapshot),
      });
      return {
        ok: false,
        snapshot: structuredClone(this.snapshot),
        error: {
          code: 'RESTORE_FAILED',
          message: '恢复「日用流畅」原始配置失败',
          detail: '未能确认 PerfLatencyHint / LatencyHintEpp 回滚到基线值。已保留错误和最后确认状态，请重试恢复。',
          retryable: true,
          timestamp: nowIso(),
        },
      };
    }

    this.revision += 1;
    this.snapshot.revision = this.revision;
    this.snapshot.mode.selectedPolicy = 'manual';
    this.snapshot.mode.policyStatus = 'idle';
    this.snapshot.mode.policyStatusDetail = '已成功恢复原始交互配置，交还手动控制';
    this.emitStatus({
      type: 'snapshot',
      connectionState: this.connectionState,
      snapshot: structuredClone(this.snapshot),
    });

    return {
      ok: true,
      snapshot: structuredClone(this.snapshot),
    };
  }

  async setDeviceControl(request: DeviceControlRequest): Promise<DeviceControlResult> {
    if (this.connectionState !== 'connected') {
      return {
        ok: false,
        snapshot: structuredClone(this.snapshot),
        error: this.makeOfflineError(request.control),
      };
    }

    await this.delay(240);
    this.revision += 1;
    this.snapshot.revision = this.revision;
    this.snapshot.capturedAt = nowIso();

    if (request.control === 'keyboardBacklight') {
      this.snapshot.controls.keyboardBacklightLevel = request.value;
      const map = {
        0: { hex: '0x20', action: 'keyboard_backlight_off' as const, label: '关闭' },
        1: { hex: '0x21', action: 'keyboard_backlight_half' as const, label: '半亮' },
        2: { hex: '0x22', action: 'keyboard_backlight_high' as const, label: '高档' },
      }[request.value];
      this.emitHotkey({
        eventId: `evt-${Date.now()}`,
        timestamp: nowIso(),
        codeHex: map.hex,
        action: map.action,
        title: '键盘背光',
        stateLabel: map.label,
        stateConfirmed: true,
        osdDurationMs: 1000,
        sourceNote: '经设备后端读回确认',
      });
    } else if (request.control === 'keyboardBacklightTimer') {
      this.snapshot.controls.keyboardCloseTimerSec = request.value;
    } else if (request.control === 'winKeyLock') {
      this.snapshot.controls.winKeyLocked = request.value;
    } else if (request.control === 'refreshRate') {
      this.snapshot.controls.refreshRateHz = request.value;
      this.emitHotkey({
        eventId: `evt-${Date.now()}`,
        timestamp: nowIso(),
        codeHex: '0xA2',
        action: 'refresh_rate_switch',
        title: '屏幕刷新率',
        stateLabel: `${request.value} Hz (2880×1800)`,
        stateConfirmed: true,
        osdDurationMs: 4000,
        sourceNote: '已确认当前内置面板 VXN03E8 显示模式',
      });
    }

    this.emitStatus({
      type: 'snapshot',
      connectionState: this.connectionState,
      snapshot: structuredClone(this.snapshot),
    });

    return {
      ok: true,
      snapshot: structuredClone(this.snapshot),
    };
  }

  triggerDemoHotkey(action: HotkeyActionKind): void {
    if (this.connectionState !== 'connected') {
      return;
    }

    this.revision += 1;
    this.snapshot.revision = this.revision;
    this.snapshot.capturedAt = nowIso();

    let event: HotkeyEvent;

    switch (action) {
      case 'performance_mode_balanced':
        this.snapshot.mode.hardwareMode = 'balanced';
        this.snapshot.mode.firmwarePpmdRaw = 1;
        this.snapshot = this.applyLoadPresetToSnapshot(this.snapshot, this.loadPreset);
        this.snapshot.revision = this.revision;
        event = {
          eventId: `hk-${Date.now()}`,
          timestamp: nowIso(),
          codeHex: '0x41',
          action,
          title: '性能档位切换',
          stateLabel: '硬件平衡档 (PPMD = 1)',
          stateConfirmed: true,
          osdDurationMs: 1000,
          sourceNote: 'OemWMIEvent.Force = 0x41',
        };
        break;
      case 'performance_mode_performance':
        this.snapshot.mode.hardwareMode = 'performance';
        this.snapshot.mode.firmwarePpmdRaw = 2;
        this.snapshot = this.applyLoadPresetToSnapshot(this.snapshot, this.loadPreset);
        this.snapshot.revision = this.revision;
        event = {
          eventId: `hk-${Date.now()}`,
          timestamp: nowIso(),
          codeHex: '0x42',
          action,
          title: '性能档位切换',
          stateLabel: '硬件性能档 (PPMD = 2)',
          stateConfirmed: true,
          osdDurationMs: 1000,
          sourceNote: 'OemWMIEvent.Force = 0x42',
        };
        break;
      case 'fn_lock_unlocked':
        this.snapshot.controls.fnLocked = false;
        event = {
          eventId: `hk-${Date.now()}`,
          timestamp: nowIso(),
          codeHex: '0x50',
          action,
          title: 'Fn 模式锁',
          stateLabel: '已解锁（F1–F12 功能键优先）',
          stateConfirmed: true,
          osdDurationMs: 1000,
          sourceNote: 'OemWMIEvent.Force = 0x50',
        };
        break;
      case 'fn_lock_locked':
        this.snapshot.controls.fnLocked = true;
        event = {
          eventId: `hk-${Date.now()}`,
          timestamp: nowIso(),
          codeHex: '0x51',
          action,
          title: 'Fn 模式锁',
          stateLabel: '已锁定（多媒体热键优先）',
          stateConfirmed: true,
          osdDurationMs: 1000,
          sourceNote: 'OemWMIEvent.Force = 0x51',
        };
        break;
      case 'touchpad_disabled':
        this.snapshot.controls.touchpadEnabled = false;
        event = {
          eventId: `hk-${Date.now()}`,
          timestamp: nowIso(),
          codeHex: '0x30',
          action,
          title: '触摸板',
          stateLabel: '已关闭（固件已执行）',
          stateConfirmed: true,
          osdDurationMs: 1000,
          sourceNote: 'OemWMIEvent.Force = 0x30 · 仅同步状态，不重复执行',
        };
        break;
      case 'touchpad_enabled':
        this.snapshot.controls.touchpadEnabled = true;
        event = {
          eventId: `hk-${Date.now()}`,
          timestamp: nowIso(),
          codeHex: '0x31',
          action,
          title: '触摸板',
          stateLabel: '已开启（固件已执行）',
          stateConfirmed: true,
          osdDurationMs: 1000,
          sourceNote: 'OemWMIEvent.Force = 0x31 · 仅同步状态，不重复执行',
        };
        break;
      case 'mic_mute_toggle': {
        const nextMuted = !this.snapshot.controls.micMuted;
        this.snapshot.controls.micMuted = nextMuted;
        event = {
          eventId: `hk-${Date.now()}`,
          timestamp: nowIso(),
          codeHex: '0xA1',
          action,
          title: '麦克风',
          stateLabel: nextMuted ? '已静音（待确认唯一音频执行方）' : '已取消静音',
          stateConfirmed: true,
          osdDurationMs: 1000,
          sourceNote: 'OemWMIEvent.Force = 0xA1',
        };
        break;
      }
      case 'keyboard_backlight_off':
        this.snapshot.controls.keyboardBacklightLevel = 0;
        event = {
          eventId: `hk-${Date.now()}`,
          timestamp: nowIso(),
          codeHex: '0x20',
          action,
          title: '键盘背光',
          stateLabel: '已关闭',
          stateConfirmed: true,
          osdDurationMs: 1000,
          sourceNote: 'OemWMIEvent.Force = 0x20',
        };
        break;
      case 'keyboard_backlight_half':
        this.snapshot.controls.keyboardBacklightLevel = 1;
        event = {
          eventId: `hk-${Date.now()}`,
          timestamp: nowIso(),
          codeHex: '0x21',
          action,
          title: '键盘背光',
          stateLabel: '半亮',
          stateConfirmed: true,
          osdDurationMs: 1000,
          sourceNote: 'OemWMIEvent.Force = 0x21',
        };
        break;
      case 'keyboard_backlight_high':
        this.snapshot.controls.keyboardBacklightLevel = 2;
        event = {
          eventId: `hk-${Date.now()}`,
          timestamp: nowIso(),
          codeHex: '0x22',
          action,
          title: '键盘背光',
          stateLabel: '高档亮',
          stateConfirmed: true,
          osdDurationMs: 1000,
          sourceNote: 'OemWMIEvent.Force = 0x22（本机已实测）',
        };
        break;
      case 'refresh_rate_switch': {
        const nextHz: 60 | 120 = this.snapshot.controls.refreshRateHz === 120 ? 60 : 120;
        this.snapshot.controls.refreshRateHz = nextHz;
        event = {
          eventId: `hk-${Date.now()}`,
          timestamp: nowIso(),
          codeHex: '0xA2',
          action,
          title: '屏幕刷新率',
          stateLabel: `${nextHz} Hz · 2880×1800`,
          stateConfirmed: true,
          osdDurationMs: 4000,
          sourceNote: 'OemWMIEvent.Force = 0xA2（OSD 停留 4000 ms）',
        };
        break;
      }
      case 'camera_connected':
        this.snapshot.controls.cameraConnected = true;
        event = {
          eventId: `hk-${Date.now()}`,
          timestamp: nowIso(),
          codeHex: '4000',
          action,
          title: '内置摄像头',
          stateLabel: 'USB 复合设备已连接 (Started)',
          stateConfirmed: true,
          osdDurationMs: 1000,
          sourceNote: 'PnP 轮询/事件 · VID_1BAF&PID_28C8',
        };
        break;
      case 'camera_disconnected':
        this.snapshot.controls.cameraConnected = false;
        event = {
          eventId: `hk-${Date.now()}`,
          timestamp: nowIso(),
          codeHex: '4001',
          action,
          title: '内置摄像头',
          stateLabel: '已断开 / 退枚举 (Disconnected)',
          stateConfirmed: true,
          osdDurationMs: 1000,
          sourceNote: 'PnP 轮询/事件 · 隐私开关触发整机 USB 退枚举',
        };
        break;
    }

    this.emitStatus({
      type: 'snapshot',
      connectionState: this.connectionState,
      snapshot: structuredClone(this.snapshot),
    });
    this.emitHotkey(event);
  }

  subscribeStatus(listener: (event: StatusEvent) => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  subscribeHotkey(listener: (event: HotkeyEvent) => void): () => void {
    this.hotkeyListeners.add(listener);
    return () => {
      this.hotkeyListeners.delete(listener);
    };
  }

  setTelemetryActive(active: boolean): void {
    if (this.telemetryActive === active) return;
    this.telemetryActive = active;
    this.syncTelemetryLoop();
    if (this.connectionState === 'connected') {
      this.snapshot.telemetry.telemetryActive = active;
      this.emitStatus({
        type: 'snapshot',
        connectionState: this.connectionState,
        snapshot: structuredClone(this.snapshot),
      });
    }
  }

  async reconnect(): Promise<{ capabilities: DeviceCapabilities; snapshot: DeviceSnapshot }> {
    this.connectionState = 'reconnecting';
    this.emitStatus({
      type: 'connection',
      connectionState: 'reconnecting',
    });

    await this.delay(520);

    // Per backend-handoff.md: reconnect refreshes capabilities + full snapshot with new instance/revision
    this.serviceInstanceId = `demo-svc-${String(Math.floor(Math.random() * 90) + 10)}`;
    this.connectionState = 'connected';
    this.revision += 1;
    this.capabilities = this.buildCapabilities();
    this.snapshot = this.applyLoadPresetToSnapshot(this.snapshot, this.loadPreset);
    this.snapshot.serviceInstanceId = this.serviceInstanceId;
    this.snapshot.revision = this.revision;
    this.snapshot.isStale = false;
    this.syncTelemetryLoop();

    const caps = structuredClone(this.capabilities);
    const snap = structuredClone(this.snapshot);

    this.emitStatus({
      type: 'capabilities',
      connectionState: 'connected',
      capabilities: caps,
      snapshot: snap,
    });
    this.emitConfig();

    return { capabilities: caps, snapshot: snap };
  }

  dispose(): void {
    if (this.telemetryTimer) {
      clearInterval(this.telemetryTimer);
      this.telemetryTimer = null;
    }
    this.statusListeners.clear();
    this.hotkeyListeners.clear();
    this.configListeners.clear();
  }

  private makeOfflineError(requestedValue?: string): ClientError {
    return {
      code: 'SERVICE_OFFLINE',
      message: '无法连接到设备后端服务',
      detail: '后端服务当前离线。请先重新连接或确认 MechrevoControlService 正在运行。',
      requestedValue,
      actualReadbackValue: this.snapshot.mode.hardwareMode,
      retryable: true,
      timestamp: nowIso(),
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
