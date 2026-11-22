import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  RefreshCw,
  WifiOff,
  Zap,
} from 'lucide-react';
import { HotkeyActionKind } from '../client/contracts';
import {
  DemoFaultConfig,
  DemoLoadPreset,
  DemoSwitchOutcome,
} from '../client/DemoDeviceClient';

interface DemoScenarioDrawerProps {
  open: boolean;
  onToggleOpen: () => void;
  demoConfig: DemoFaultConfig;
  isDemoClient: boolean;
  processRunning: boolean;
  isWindowOpen: boolean;
  onSetLoadPreset: (preset: DemoLoadPreset) => void;
  onSetNextSwitchOutcome: (outcome: DemoSwitchOutcome) => void;
  onSetPolicyGate: (target: 'dailySmooth' | 'smartMode', enabled: boolean) => void;
  onSetDailySmoothRestoreFails: (fails: boolean) => void;
  onSimulateDisconnect: () => void;
  onReconnect: () => void;
  onTriggerHotkey: (action: HotkeyActionKind) => void;
}

const LOAD_PRESETS: Array<{ id: DemoLoadPreset; label: string; desc: string }> = [
  { id: 'ac_dual_burn', label: '插电 · 双烤参考', desc: '约 17 W / 30 W 实测参考' },
  { id: 'ac_idle', label: '插电 · 桌面静置', desc: '充电中 · 1–4 W 观察' },
  { id: 'battery_office', label: '离电 · 轻载办公', desc: '电池放电 · VBUS=0' },
  { id: 'sensor_partial_unavailable', label: '传感器不可用 + 零值', desc: '对照 null 与真实 0' },
];

const SWITCH_OUTCOMES: Array<{ id: DemoSwitchOutcome; label: string }> = [
  { id: 'success', label: '读回确认成功' },
  { id: 'readback_mismatch', label: '失败：写后读回不一致' },
  { id: 'permission_denied', label: '失败：权限不足' },
  { id: 'device_busy', label: '失败：设备队列忙' },
  { id: 'timeout', label: '失败：读回超时' },
];

export const DemoScenarioDrawer: React.FC<DemoScenarioDrawerProps> = ({
  open,
  onToggleOpen,
  demoConfig,
  isDemoClient,
  processRunning,
  isWindowOpen,
  onSetLoadPreset,
  onSetNextSwitchOutcome,
  onSetPolicyGate,
  onSetDailySmoothRestoreFails,
  onSimulateDisconnect,
  onReconnect,
  onTriggerHotkey,
}) => {
  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggleOpen}
        aria-label="展开演示场景调试台"
        className="fixed top-1/2 right-0 z-40 flex -translate-y-1/2 items-center gap-1.5 rounded-l-lg border border-r-0 border-slate-300 bg-white/95 px-2.5 py-3 text-xs font-medium text-slate-800 shadow-lg backdrop-blur-md transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-[#151A21]/95 dark:text-slate-100 dark:hover:bg-slate-800"
      >
        <ChevronLeft className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <span className="[writing-mode:vertical-rl] tracking-wider">演示调试台</span>
      </button>
    );
  }

  return (
    <aside
      aria-label="演示场景调试台"
      className="fixed top-4 right-4 bottom-16 z-40 flex w-80 flex-col rounded-xl border border-slate-300 bg-white/96 shadow-2xl backdrop-blur-md dark:border-slate-700 dark:bg-[#131820]/96"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <div>
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              演示场景调试台
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              窗口外置 · 仅用于验收边界状态
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleOpen}
          aria-label="折叠演示调试台"
          className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable controls */}
      <div className="flex-1 space-y-5 overflow-y-auto p-4 text-xs">
        {!isDemoClient && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-amber-800 dark:text-amber-200">
            当前正在使用「实机命名管道客户端」。请切回「DemoDeviceClient」以驱动演示场景。
          </div>
        )}

        {/* Process Lifecycle Telemetry Status */}
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-[#0D1117]">
          <div className="font-medium text-slate-900 dark:text-slate-100">单进程运行态观察</div>
          <div className="mt-1.5 space-y-1 text-[11px] text-slate-600 dark:text-slate-400">
            <div className="flex justify-between">
              <span>前端 App 进程</span>
              <span className="font-mono-num text-slate-900 dark:text-slate-200">
                {processRunning ? '运行中 (1 进程)' : '已退出'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>主窗口 UI 树</span>
              <span className="font-mono-num text-slate-900 dark:text-slate-200">
                {isWindowOpen ? '已挂载' : '已卸载（仅留托盘）'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>高频遥测订阅</span>
              <span className="font-mono-num text-slate-900 dark:text-slate-200">
                {demoConfig.telemetryRunning ? `运行中 (#${demoConfig.telemetryTickCount})` : '已暂停（零轮询）'}
              </span>
            </div>
          </div>
        </div>

        {/* 1. Power & Load Presets */}
        <div>
          <div className="mb-2 font-semibold text-slate-800 dark:text-slate-200">
            1. 供电与负载演示快照
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {LOAD_PRESETS.map((preset) => {
              const active = demoConfig.loadPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={!isDemoClient || !processRunning}
                  onClick={() => onSetLoadPreset(preset.id)}
                  className={`rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-50 ${
                    active
                      ? 'border-blue-600 bg-blue-600/10 text-blue-700 dark:border-blue-500 dark:text-blue-300'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-[#0D1117] dark:text-slate-300 dark:hover:bg-slate-800/70'
                  }`}
                >
                  <div className="font-medium">{preset.label}</div>
                  <div className="mt-0.5 text-[11px] opacity-75">{preset.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Next Switch Outcome Injection */}
        <div>
          <div className="mb-2 font-semibold text-slate-800 dark:text-slate-200">
            2. 下一次「平衡 / 性能」切档结果
          </div>
          <div className="space-y-1.5">
            {SWITCH_OUTCOMES.map((item) => {
              const active = demoConfig.nextSwitchOutcome === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={!isDemoClient || !processRunning}
                  onClick={() => onSetNextSwitchOutcome(item.id)}
                  className={`flex w-full items-center justify-between rounded-md border px-3 py-1.5 text-left transition-colors disabled:opacity-50 ${
                    active
                      ? item.id === 'success'
                        ? 'border-emerald-600 bg-emerald-600/10 font-medium text-emerald-700 dark:text-emerald-300'
                        : 'border-red-500 bg-red-500/10 font-medium text-red-700 dark:text-red-300'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-[#0D1117] dark:text-slate-300'
                  }`}
                >
                  <span>{item.label}</span>
                  {active && <span className="text-[10px]">当前预设</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Service Connection Simulation */}
        <div>
          <div className="mb-2 font-semibold text-slate-800 dark:text-slate-200">
            3. 后端服务断线与重连
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!isDemoClient || !processRunning || demoConfig.simulateDisconnected}
              onClick={onSimulateDisconnect}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-amber-500/50 bg-amber-500/10 px-2.5 py-2 font-medium text-amber-800 transition-colors hover:bg-amber-500/20 disabled:opacity-45 dark:text-amber-300 whitespace-nowrap"
            >
              <WifiOff className="h-3.5 w-3.5" />
              模拟断线
            </button>
            <button
              type="button"
              disabled={!isDemoClient || !processRunning || !demoConfig.simulateDisconnected}
              onClick={onReconnect}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-emerald-600/50 bg-emerald-600/10 px-2.5 py-2 font-medium text-emerald-700 transition-colors hover:bg-emerald-600/20 disabled:opacity-45 dark:text-emerald-300 whitespace-nowrap"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              恢复连接
            </button>
          </div>
        </div>

        {/* 4. Capability Gates for Daily Smooth & Smart Mode */}
        <div>
          <div className="mb-2 font-semibold text-slate-800 dark:text-slate-200">
            4. 后端策略能力门控模拟
          </div>
          <div className="space-y-2">
            <label className="flex cursor-pointer items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-[#0D1117]">
              <span className="text-slate-700 dark:text-slate-300">开放「日用流畅」能力</span>
              <input
                type="checkbox"
                checked={demoConfig.dailySmoothCapable}
                disabled={!isDemoClient || !processRunning}
                onChange={(e) => onSetPolicyGate('dailySmooth', e.target.checked)}
                className="h-4 w-4 accent-blue-600"
              />
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-[#0D1117]">
              <span className="text-slate-700 dark:text-slate-300">开放「智能选档」能力</span>
              <input
                type="checkbox"
                checked={demoConfig.smartModeCapable}
                disabled={!isDemoClient || !processRunning}
                onChange={(e) => onSetPolicyGate('smartMode', e.target.checked)}
                className="h-4 w-4 accent-blue-600"
              />
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-[#0D1117]">
              <span className="text-slate-700 dark:text-slate-300">模拟日用流畅恢复原配置失败</span>
              <input
                type="checkbox"
                checked={demoConfig.dailySmoothRestoreFails}
                disabled={!isDemoClient || !processRunning}
                onChange={(e) => onSetDailySmoothRestoreFails(e.target.checked)}
                className="h-4 w-4 accent-red-600"
              />
            </label>
          </div>
        </div>

        {/* 5. Trigger Hotkey Even When Window Is Closed To Tray */}
        <div>
          <div className="mb-2 font-semibold text-slate-800 dark:text-slate-200">
            5. 随时触发热键（主窗关闭时仍弹 OSD）
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={!isDemoClient || !processRunning || demoConfig.simulateDisconnected}
              onClick={() => onTriggerHotkey('performance_mode_performance')}
              className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-45 dark:border-slate-800 dark:bg-[#0D1117] dark:text-slate-300"
            >
              <Zap className="h-3 w-3" />
              热键切性能
            </button>
            <button
              type="button"
              disabled={!isDemoClient || !processRunning || demoConfig.simulateDisconnected}
              onClick={() => onTriggerHotkey('touchpad_disabled')}
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-45 dark:border-slate-800 dark:bg-[#0D1117] dark:text-slate-300"
            >
              触摸板 0x30
            </button>
            <button
              type="button"
              disabled={!isDemoClient || !processRunning || demoConfig.simulateDisconnected}
              onClick={() => onTriggerHotkey('refresh_rate_switch')}
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-45 dark:border-slate-800 dark:bg-[#0D1117] dark:text-slate-300"
            >
              60/120Hz 0xA2
            </button>
            <button
              type="button"
              disabled={!isDemoClient || !processRunning || demoConfig.simulateDisconnected}
              onClick={() => onTriggerHotkey('camera_disconnected')}
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-45 dark:border-slate-800 dark:bg-[#0D1117] dark:text-slate-300"
            >
              摄像头断开 4001
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
