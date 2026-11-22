import React from 'react';
import {
  AlertTriangle,
  BatteryCharging,
  Cpu,
  Gauge,
  Loader2,
  Plug,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  WifiOff,
  Zap,
} from 'lucide-react';
import {
  ClientError,
  ConnectionState,
  DeviceCapabilities,
  DeviceSnapshot,
  HardwarePerformanceMode,
  UserPolicyMode,
} from '../client/contracts';

interface OverviewPerformanceViewProps {
  connectionState: ConnectionState;
  capabilities: DeviceCapabilities | null;
  snapshot: DeviceSnapshot | null;
  lastError: ClientError | null;
  pendingMode: HardwarePerformanceMode | null;
  pendingPolicy: UserPolicyMode | 'restore' | null;
  telemetryRunning: boolean;
  onSelectMode: (mode: HardwarePerformanceMode) => void;
  onSelectPolicy: (policy: UserPolicyMode) => void;
  onRestoreDailySmooth: () => void;
  onReconnect: () => void;
  onDismissError: () => void;
}

export function formatHardwareModeLabel(mode: DeviceSnapshot['mode']['hardwareMode'] | undefined): string {
  if (mode === 'balanced') return '硬件平衡档';
  if (mode === 'performance') return '硬件性能档';
  return '待确认';
}

export function formatPolicyLabel(policy: UserPolicyMode | undefined): string {
  if (policy === 'daily_smooth') return '日用流畅';
  if (policy === 'smart') return '智能选档';
  return '手动控制';
}

export function formatPowerSource(source: DeviceSnapshot['power']['powerSource']): string {
  if (source === 'ac') return '交流电源 (AC)';
  if (source === 'battery') return '电池供电 (DC)';
  return '未知';
}

export function formatChargingState(state: DeviceSnapshot['power']['chargingState']): string {
  switch (state) {
    case 'charging':
      return '充电中';
    case 'discharging':
      return '放电中';
    case 'full':
      return '已充满';
    case 'not_charging':
      return '已接电 · 未充电';
    default:
      return '状态未知';
  }
}

function formatTime(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('zh-CN', { hour12: false });
}

export const OverviewPerformanceView: React.FC<OverviewPerformanceViewProps> = ({
  connectionState,
  capabilities,
  snapshot,
  lastError,
  pendingMode,
  pendingPolicy,
  telemetryRunning,
  onSelectMode,
  onSelectPolicy,
  onRestoreDailySmooth,
  onReconnect,
  onDismissError,
}) => {
  const isOffline = connectionState === 'disconnected';
  const isReconnecting = connectionState === 'reconnecting';
  const isPerfWritable = Boolean(capabilities?.performanceMode.writable) && !isOffline;
  const confirmedMode = snapshot?.mode.hardwareMode ?? 'unknown';
  const selectedPolicy = snapshot?.mode.selectedPolicy ?? 'manual';
  const policyStatus = snapshot?.mode.policyStatus ?? 'idle';

  const dailySmoothWritable = Boolean(capabilities?.dailySmooth.writable) && !isOffline;
  const smartModeWritable = Boolean(capabilities?.smartMode.writable) && !isOffline;

  return (
    <div className="space-y-6">
      {/* Service offline banner */}
      {(isOffline || isReconnecting) && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200"
        >
          <div className="flex items-start gap-3">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="font-semibold">
                {isReconnecting ? '正在重新连接设备后端服务…' : '设备后端服务已断线（仅保留最后确认快照）'}
              </p>
              <p className="mt-0.5 text-xs text-amber-800/90 dark:text-amber-200/80">
                {lastError?.detail ??
                  '当前展示的档位与传感器数据已标记为过期，所有硬件写入控件已锁定。重连后将自动重新拉取能力表和完整快照。'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onReconnect}
            disabled={isReconnecting}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-amber-500/50 bg-amber-600 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:opacity-60 whitespace-nowrap"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isReconnecting ? 'animate-spin' : ''}`} />
            {isReconnecting ? '重连中' : '重新连接'}
          </button>
        </div>
      )}

      {/* Structured write / readback / restore error banner */}
      {lastError && !isOffline && !isReconnecting && (
        <div
          role="alert"
          className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-900 dark:text-red-200"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{lastError.message}</span>
                <span className="font-mono-num text-xs text-red-700/80 dark:text-red-300/80">
                  {lastError.code}
                </span>
              </div>
              {lastError.detail && (
                <p className="text-xs leading-relaxed text-red-800/90 dark:text-red-200/85">
                  {lastError.detail}
                </p>
              )}
              {(lastError.requestedValue || lastError.actualReadbackValue) && (
                <p className="font-mono-num text-xs text-red-700/90 dark:text-red-300/90">
                  请求目标：{lastError.requestedValue ?? '—'} · 实际读回确认：
                  {lastError.actualReadbackValue ?? '—'}
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {lastError.retryable &&
              (lastError.requestedValue === 'balanced' || lastError.requestedValue === 'performance') && (
                <button
                  type="button"
                  onClick={() => onSelectMode(lastError.requestedValue as HardwarePerformanceMode)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 whitespace-nowrap"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  手动重试
                </button>
              )}
            {lastError.code === 'RESTORE_FAILED' && (
              <button
                type="button"
                onClick={onRestoreDailySmooth}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 whitespace-nowrap"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                重试恢复原配置
              </button>
            )}
            <button
              type="button"
              onClick={onDismissError}
              className="rounded-md border border-red-500/30 px-2.5 py-1.5 text-xs font-medium text-red-800 transition-colors hover:bg-red-500/10 dark:text-red-200 whitespace-nowrap"
            >
              知道了
            </button>
          </div>
        </div>
      )}

      {/* Row 1: Device & Power Overview Strip (single elevation flat grid) */}
      <section aria-label="设备与供电概览">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Device & Combined Status */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#151A21]">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>当前生效组合（策略 · 硬件档位）</span>
              <span className="font-mono-num">
                Rev #{snapshot?.revision ?? '—'}
              </span>
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <p className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                {formatPolicyLabel(selectedPolicy)} · {formatHardwareModeLabel(confirmedMode)}
              </p>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span>{snapshot?.device.modelName ?? '无界 14 MAX'}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-num">
                PPMD={snapshot?.mode.firmwarePpmdRaw ?? '—'}
              </span>
              {snapshot?.isStale && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-amber-600 dark:text-amber-400">快照已过期</span>
                </>
              )}
            </div>
          </div>

          {/* Power source (separate from charging status!) */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#151A21]">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>供电方式</span>
              <Plug className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <p className="mt-2.5 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {snapshot ? formatPowerSource(snapshot.power.powerSource) : '等待接入'}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
              <span>充电状态：{snapshot ? formatChargingState(snapshot.power.chargingState) : '—'}</span>
            </div>
          </div>

          {/* Battery % & Charge/Discharge W */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#151A21]">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>电池电量与充放电功率</span>
              <BatteryCharging className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <div className="mt-2.5 flex items-baseline gap-3">
              <span className="font-mono-num text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {snapshot?.power.batteryPercent !== null && snapshot?.power.batteryPercent !== undefined
                  ? `${snapshot.power.batteryPercent}%`
                  : '不可用'}
              </span>
              <span className="font-mono-num text-xs text-slate-500 dark:text-slate-400">
                {snapshot?.power.batteryPowerWatts !== null &&
                snapshot?.power.batteryPowerWatts !== undefined
                  ? `${snapshot.power.batteryPowerWatts > 0 ? '+' : ''}${snapshot.power.batteryPowerWatts.toFixed(1)} W`
                  : '功率不可用'}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>采集时间</span>
              <span className="font-mono-num text-slate-700 dark:text-slate-300">
                {formatTime(snapshot?.capturedAt)}
              </span>
              <span aria-hidden="true">·</span>
              <span>{snapshot?.dataSource === 'demo' ? '演示数据' : '实机读回'}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Row 2: Focal Anchor — Hardware Mode Switcher (Confirmed-Readback-Only) */}
      <section
        aria-label="硬件性能档位切换"
        className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#151A21]"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              硬件性能档位（原厂已验证两档）
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              点击后发送写入请求并等待 <span className="font-mono-num">EmdAcpi_PowerPlanMode.GetPowerPlanMode</span>{' '}
              读回确认；仅在收到确认后更新当前生效档位。
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>确认方式：硬件读回</span>
            <span aria-hidden="true">·</span>
            <span>
              {pendingMode
                ? `正在应用「${pendingMode === 'performance' ? '性能' : '平衡'}」并等待读回…`
                : `最后确认：${formatHardwareModeLabel(confirmedMode)}`}
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Balanced Mode Button */}
          <button
            type="button"
            onClick={() => onSelectMode('balanced')}
            disabled={!isPerfWritable || pendingMode !== null || pendingPolicy !== null}
            aria-pressed={confirmedMode === 'balanced'}
            className={`group flex flex-col items-start justify-between rounded-lg border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-55 ${
              confirmedMode === 'balanced'
                ? 'border-blue-600 bg-blue-600/[0.06] dark:border-blue-500 dark:bg-blue-500/[0.10]'
                : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-[#0F1319] dark:hover:border-slate-700'
            }`}
          >
            <div className="flex w-full items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Gauge
                  className={`h-4 w-4 ${
                    confirmedMode === 'balanced'
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-slate-400'
                  }`}
                />
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                  平衡（Balanced）
                </span>
              </div>
              <span className="font-mono-num text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {pendingMode === 'balanced' ? (
                  <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    等待读回…
                  </span>
                ) : confirmedMode === 'balanced' ? (
                  <span className="text-emerald-600 dark:text-emerald-400">已确认生效 · PPMD 1</span>
                ) : (
                  'PPMD 1'
                )}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              兼顾日常静置低功耗与安静温控。本机一轮双烤参考稳态 CPU 封装功耗约 17 W（实测读数不从档位推算）。
            </p>
          </button>

          {/* Performance Mode Button */}
          <button
            type="button"
            onClick={() => onSelectMode('performance')}
            disabled={!isPerfWritable || pendingMode !== null || pendingPolicy !== null}
            aria-pressed={confirmedMode === 'performance'}
            className={`group flex flex-col items-start justify-between rounded-lg border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-55 ${
              confirmedMode === 'performance'
                ? 'border-blue-600 bg-blue-600/[0.06] dark:border-blue-500 dark:bg-blue-500/[0.10]'
                : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-[#0F1319] dark:hover:border-slate-700'
            }`}
          >
            <div className="flex w-full items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Zap
                  className={`h-4 w-4 ${
                    confirmedMode === 'performance'
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-slate-400'
                  }`}
                />
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                  性能（Performance）
                </span>
              </div>
              <span className="font-mono-num text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {pendingMode === 'performance' ? (
                  <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    等待读回…
                  </span>
                ) : confirmedMode === 'performance' ? (
                  <span className="text-emerald-600 dark:text-emerald-400">已确认生效 · PPMD 2</span>
                ) : (
                  'PPMD 2'
                )}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              释放更高持续功耗上限与频率表现。本机一轮双烤参考稳态 CPU 封装功耗约 30 W。
            </p>
          </button>
        </div>

        {/* Policy Layer — Separate from Hardware Actual Mode */}
        <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                软件调度策略（与硬件实际档位分别显示）
              </h3>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              当前策略：<strong className="font-medium text-slate-800 dark:text-slate-200">{formatPolicyLabel(selectedPolicy)}</strong>
              {' · '}
              硬件实际：<strong className="font-medium text-slate-800 dark:text-slate-200">{formatHardwareModeLabel(confirmedMode)}</strong>
            </span>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {/* Daily Smooth Policy */}
            <div className="flex flex-col justify-between rounded-lg border border-slate-200 bg-slate-50/40 p-3.5 dark:border-slate-800 dark:bg-[#0F1319]">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    日用流畅策略
                  </span>
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {!dailySmoothWritable
                      ? '未开放实机写入'
                      : selectedPolicy === 'daily_smooth'
                        ? policyStatus === 'restore_failed'
                          ? '恢复原配置失败'
                          : '已生效 · 硬件平衡档'
                        : '后端已声明可用（模拟）'}
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  在硬件平衡档内应用经验证的 Windows 交互响应提示，改善动画帧时间同时尽量维持低静置功耗。启用时自动暂停智能选档。
                </p>
                {!dailySmoothWritable && capabilities?.dailySmooth.unavailableReason && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{capabilities.dailySmooth.unavailableReason}</span>
                  </p>
                )}
                {selectedPolicy === 'daily_smooth' && snapshot?.mode.policyStatusDetail && (
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                    {snapshot.mode.policyStatusDetail}
                  </p>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {selectedPolicy === 'daily_smooth' ? (
                  <button
                    type="button"
                    onClick={onRestoreDailySmooth}
                    disabled={isOffline || pendingPolicy !== null}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50 dark:border-slate-700 dark:bg-[#151A21] dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
                  >
                    {pendingPolicy === 'restore' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" />
                    )}
                    恢复原配置并退回手动
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelectPolicy('daily_smooth')}
                    disabled={!dailySmoothWritable || pendingPolicy !== null || pendingMode !== null}
                    className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-500 whitespace-nowrap"
                  >
                    {pendingPolicy === 'daily_smooth' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {dailySmoothWritable ? '启用日用流畅' : '等待后端验收开放'}
                  </button>
                )}
              </div>
            </div>

            {/* Smart Mode Policy */}
            <div className="flex flex-col justify-between rounded-lg border border-slate-200 bg-slate-50/40 p-3.5 dark:border-slate-800 dark:bg-[#0F1319]">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    智能选档策略
                  </span>
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {!smartModeWritable
                      ? '未开放实机写入'
                      : selectedPolicy === 'smart'
                        ? `运行中 · ${formatHardwareModeLabel(confirmedMode)}`
                        : '后端已声明可用（模拟）'}
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  由后端服务按供电状态与 CPU/核显持续繁忙程度在平衡与性能间自动决策；离电默认偏向平衡。手动切档将立即接管并取消自动决策。
                </p>
                {!smartModeWritable && capabilities?.smartMode.unavailableReason && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{capabilities.smartMode.unavailableReason}</span>
                  </p>
                )}
                {selectedPolicy === 'smart' && snapshot?.mode.smartDecisionReason && (
                  <p className="mt-2 text-xs text-blue-700 dark:text-blue-300">
                    决策依据：{snapshot.mode.smartDecisionReason}
                  </p>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {selectedPolicy === 'smart' ? (
                  <button
                    type="button"
                    onClick={() => onSelectPolicy('manual')}
                    disabled={isOffline || pendingPolicy !== null}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50 dark:border-slate-700 dark:bg-[#151A21] dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
                  >
                    退回手动选档
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelectPolicy('smart')}
                    disabled={!smartModeWritable || pendingPolicy !== null || pendingMode !== null}
                    className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-500 whitespace-nowrap"
                  >
                    {pendingPolicy === 'smart' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {smartModeWritable ? '启用智能选档' : '等待后端验收开放'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Row 3: Real-Time Telemetry & Uncalibrated Raw Sensors */}
      <section aria-label="实时性能遥测" className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Calibrated CPU Telemetry */}
        <div className="rounded-lg border border-slate-200 bg-white p-5 lg:col-span-5 dark:border-slate-800 dark:bg-[#151A21]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                CPU 封装功耗与频率
              </h2>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {telemetryRunning ? '采样激活（本页可见）' : '采样已暂停'}
            </span>
          </div>

          <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
            <div className="pb-4">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400">CPU 封装功耗</span>
                <span className="font-mono-num text-xs text-slate-400">单位 W · Energy Meter / RAPL</span>
              </div>
              {snapshot?.telemetry.cpuPackagePowerWatts !== null &&
              snapshot?.telemetry.cpuPackagePowerWatts !== undefined ? (
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="font-mono-num text-3xl font-semibold text-slate-900 dark:text-slate-100">
                    {snapshot.telemetry.cpuPackagePowerWatts.toFixed(2)}
                  </span>
                  <span className="font-mono-num text-sm text-slate-500 dark:text-slate-400">W</span>
                </div>
              ) : (
                <div className="mt-1.5">
                  <span className="text-lg font-semibold text-amber-600 dark:text-amber-400">不可用</span>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {snapshot?.telemetry.cpuPackagePowerUnavailableReason ?? '当前未取得有效功耗读数（null）'}
                  </p>
                </div>
              )}
            </div>

            <div className="pt-4">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400">CPU 实际频率</span>
                <span className="font-mono-num text-xs text-slate-400">单位 MHz</span>
              </div>
              {snapshot?.telemetry.cpuFrequencyMhz !== null &&
              snapshot?.telemetry.cpuFrequencyMhz !== undefined ? (
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="font-mono-num text-2xl font-semibold text-slate-900 dark:text-slate-100">
                    {snapshot.telemetry.cpuFrequencyMhz}
                  </span>
                  <span className="font-mono-num text-xs text-slate-500 dark:text-slate-400">
                    MHz（{(snapshot.telemetry.cpuFrequencyMhz / 1000).toFixed(2)} GHz）
                  </span>
                </div>
              ) : (
                <span className="mt-1.5 block text-lg font-semibold text-amber-600 dark:text-amber-400">
                  不可用
                </span>
              )}
            </div>
          </div>

          <p className="mt-4 border-t border-slate-200 pt-3 text-xs leading-relaxed text-slate-500 dark:border-slate-800 dark:text-slate-400">
            实时读数仅来自采集快照，不从「平衡 / 性能」名称推算。关闭主窗口退至托盘后，高频遥测会自动停止以降低后台唤醒。
          </p>
        </div>

        {/* Uncalibrated Raw Sensors Table */}
        <div className="rounded-lg border border-slate-200 bg-white p-5 lg:col-span-7 dark:border-slate-800 dark:bg-[#151A21]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                未校准固件原始读数（风扇与 EC 传感器）
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                按实机证据保留原始值与来源，单位未核实前不强行标注 RPM / °C / V；严格区分「真实零值 0」与「不可用 null」。
              </p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-2 pr-3 font-medium">通道</th>
                  <th className="py-2 px-3 text-right font-medium">原始读数</th>
                  <th className="py-2 pl-3 font-medium">数据来源与说明</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/80">
                {(snapshot?.telemetry.rawSensors ?? []).map((sensor) => (
                  <tr key={sensor.id} className="align-top">
                    <td className="py-2.5 pr-3 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {sensor.label}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num whitespace-nowrap">
                      {sensor.rawValue === null ? (
                        <span className="font-sans font-medium text-amber-600 dark:text-amber-400">
                          不可用
                        </span>
                      ) : (
                        <span className="text-slate-900 dark:text-slate-100">
                          {sensor.rawValue}
                          {sensor.hexPreview ? ` (${sensor.hexPreview})` : ''}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pl-3 text-slate-500 dark:text-slate-400">
                      <div className="font-mono-num text-[11px] text-slate-600 dark:text-slate-300">
                        {sensor.source}
                      </div>
                      <div className="mt-0.5">{sensor.note}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
};
