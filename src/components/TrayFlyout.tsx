import React from 'react';
import {
  AppWindow,
  Bell,
  BellOff,
  Gauge,
  Loader2,
  Power,
  RefreshCw,
  WifiOff,
  Zap,
} from 'lucide-react';
import {
  ConnectionState,
  DeviceCapabilities,
  DeviceSnapshot,
  HardwarePerformanceMode,
} from '../client/contracts';
import {
  formatHardwareModeLabel,
  formatPolicyLabel,
  formatPowerSource,
} from './OverviewPerformanceView';

interface TrayFlyoutProps {
  open: boolean;
  isWindowOpen: boolean;
  connectionState: ConnectionState;
  capabilities: DeviceCapabilities | null;
  snapshot: DeviceSnapshot | null;
  pendingMode: HardwarePerformanceMode | null;
  osdEnabled: boolean;
  onSelectMode: (mode: HardwarePerformanceMode) => void;
  onToggleOsd: (enabled: boolean) => void;
  onOpenWindow: () => void;
  onCloseWindowToTray: () => void;
  onReconnect: () => void;
  onExitProcess: () => void;
}

export const TrayFlyout: React.FC<TrayFlyoutProps> = ({
  open,
  isWindowOpen,
  connectionState,
  capabilities,
  snapshot,
  pendingMode,
  osdEnabled,
  onSelectMode,
  onToggleOsd,
  onOpenWindow,
  onCloseWindowToTray,
  onReconnect,
  onExitProcess,
}) => {
  if (!open) return null;

  const isOffline = connectionState === 'disconnected';
  const writable = Boolean(capabilities?.performanceMode.writable) && !isOffline;
  const confirmedMode = snapshot?.mode.hardwareMode ?? 'unknown';

  return (
    <div
      role="dialog"
      aria-label="系统托盘快捷菜单"
      className="fixed right-4 bottom-14 z-50 w-72 rounded-xl border border-slate-300 bg-white/98 p-3.5 text-xs shadow-2xl backdrop-blur-md dark:border-slate-700 dark:bg-[#161B23]/98"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-2.5 dark:border-slate-800">
        <div>
          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            无界 14 MAX 控制台 · 托盘
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            单进程常驻 · {snapshot?.dataSource === 'demo' ? '演示数据' : '实机连接'}
          </div>
        </div>
        <span className="font-mono-num text-[11px] text-slate-500 dark:text-slate-400">
          {snapshot?.power.batteryPercent !== null && snapshot?.power.batteryPercent !== undefined
            ? `${snapshot.power.batteryPercent}%`
            : '—'}
        </span>
      </div>

      {/* Status summary */}
      <div className="mt-2.5 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-slate-500 dark:text-slate-400">生效状态</span>
          <span className="font-medium text-slate-900 dark:text-slate-100">
            {formatPolicyLabel(snapshot?.mode.selectedPolicy)} · {formatHardwareModeLabel(confirmedMode)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500 dark:text-slate-400">供电方式</span>
          <span className="text-slate-800 dark:text-slate-200">
            {snapshot ? formatPowerSource(snapshot.power.powerSource) : '—'}
          </span>
        </div>
      </div>

      {/* Offline notice or Quick Mode Switch */}
      {isOffline ? (
        <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-amber-800 dark:text-amber-200">
          <div className="flex items-center gap-1.5 font-medium">
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
            <span>设备服务断线（数据已过期）</span>
          </div>
          <button
            type="button"
            onClick={onReconnect}
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded bg-amber-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            重新连接服务
          </button>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!writable || pendingMode !== null}
            onClick={() => onSelectMode('balanced')}
            className={`flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-2 text-xs font-medium transition-colors disabled:opacity-55 whitespace-nowrap ${
              confirmedMode === 'balanced'
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-[#0F1319] dark:text-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            {pendingMode === 'balanced' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Gauge className="h-3.5 w-3.5" />
            )}
            平衡
          </button>
          <button
            type="button"
            disabled={!writable || pendingMode !== null}
            onClick={() => onSelectMode('performance')}
            className={`flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-2 text-xs font-medium transition-colors disabled:opacity-55 whitespace-nowrap ${
              confirmedMode === 'performance'
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-[#0F1319] dark:text-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            {pendingMode === 'performance' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
            性能
          </button>
        </div>
      )}

      {/* Menu actions */}
      <div className="mt-3 space-y-1 border-t border-slate-200 pt-2.5 dark:border-slate-800">
        <button
          type="button"
          onClick={() => onToggleOsd(!osdEnabled)}
          className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <span className="flex items-center gap-2">
            {osdEnabled ? <Bell className="h-3.5 w-3.5 text-blue-500" /> : <BellOff className="h-3.5 w-3.5 text-slate-400" />}
            本应用 OSD 提示
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {osdEnabled ? '开' : '关'}
          </span>
        </button>

        <button
          type="button"
          onClick={isWindowOpen ? onCloseWindowToTray : onOpenWindow}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <AppWindow className="h-3.5 w-3.5 text-slate-400" />
          {isWindowOpen ? '关闭主窗口至托盘（停止遥测）' : '打开控制台主窗口'}
        </button>

        <button
          type="button"
          onClick={onExitProcess}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
        >
          <Power className="h-3.5 w-3.5" />
          退出控制台进程
        </button>
      </div>
    </div>
  );
};
