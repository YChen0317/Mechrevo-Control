import {
  ClientError,
  ConnectionState,
  DeviceCapabilities,
  DeviceControlRequest,
  DeviceControlResult,
  DeviceSnapshot,
  HardwarePerformanceMode,
  HotkeyEvent,
  IDeviceClient,
  PolicyActionResult,
  SetPerformanceModeResult,
  StatusEvent,
  UserPolicyMode,
} from './contracts';

/**
 * Production Named Pipe client adapter stub for the shared IDeviceClient contract.
 * Demonstrates that the exact same UI swaps cleanly between DemoDeviceClient and a real
 * Windows Named Pipe client (\\.\pipe\MechrevoControl.Dove4.V1, UTF-8 JSON Lines).
 * The real Windows C# .NET 8 counterpart lives in /windows-app/Client/NamedPipeDeviceClient.cs.
 */
export class NamedPipeDeviceClient implements IDeviceClient {
  readonly id = 'named-pipe-client';
  readonly displayName = '实机命名管道客户端（NamedPipeDeviceClient）';
  readonly dataSource = 'hardware' as const;
  readonly pipeName = '\\\\.\\pipe\\MechrevoControl.Dove4.V1';

  private connectionState: ConnectionState = 'disconnected';
  private statusListeners = new Set<(event: StatusEvent) => void>();
  private hotkeyListeners = new Set<(event: HotkeyEvent) => void>();

  private buildUnavailableError(actionName?: string): ClientError {
    return {
      code: 'SERVICE_OFFLINE',
      message: '未检测到本机设备后端服务',
      detail: `当前运行在浏览器演示环境，无法直接打开 Windows 命名管道 ${this.pipeName}（或后端服务尚未安装启动）。请切换回「演示客户端」试用，或在 Windows 本机运行 C# 原生客户端。`,
      requestedValue: actionName,
      retryable: true,
      timestamp: new Date().toISOString(),
    };
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  async getCapabilities(): Promise<DeviceCapabilities> {
    await this.delay(260);
    throw this.buildUnavailableError('getCapabilities');
  }

  async getSnapshot(): Promise<DeviceSnapshot> {
    await this.delay(260);
    throw this.buildUnavailableError('getSnapshot');
  }

  async setPerformanceMode(mode: HardwarePerformanceMode): Promise<SetPerformanceModeResult> {
    await this.delay(260);
    throw this.buildUnavailableError(`setPerformanceMode:${mode}`);
  }

  async setPolicyMode(policy: UserPolicyMode): Promise<PolicyActionResult> {
    await this.delay(260);
    throw this.buildUnavailableError(`setPolicyMode:${policy}`);
  }

  async restoreDailySmooth(): Promise<PolicyActionResult> {
    await this.delay(260);
    throw this.buildUnavailableError('restoreDailySmooth');
  }

  async setDeviceControl(request: DeviceControlRequest): Promise<DeviceControlResult> {
    await this.delay(260);
    throw this.buildUnavailableError(`setDeviceControl:${request.control}`);
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

  setTelemetryActive(_active: boolean): void {
    // In native C# implementation, sends {"type":"setTelemetrySubscription","active":boolean}
  }

  async reconnect(): Promise<{ capabilities: DeviceCapabilities; snapshot: DeviceSnapshot }> {
    this.connectionState = 'reconnecting';
    this.statusListeners.forEach((l) =>
      l({
        type: 'connection',
        connectionState: 'reconnecting',
      }),
    );

    await this.delay(450);

    this.connectionState = 'disconnected';
    const error = this.buildUnavailableError('reconnect');
    this.statusListeners.forEach((l) =>
      l({
        type: 'connection',
        connectionState: 'disconnected',
        error,
      }),
    );
    throw error;
  }

  dispose(): void {
    this.statusListeners.clear();
    this.hotkeyListeners.clear();
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
