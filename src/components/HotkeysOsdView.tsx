import React from 'react';
import { Bell, BellOff, Camera, Keyboard, Lock, Mic, MicOff, Monitor, MousePointerClick } from 'lucide-react';
import {
  ConnectionState,
  DeviceCapabilities,
  DeviceControlRequest,
  DeviceSnapshot,
  HotkeyActionKind,
  HotkeyEvent,
} from '../client/contracts';

interface HotkeysOsdViewProps {
  connectionState: ConnectionState;
  capabilities: DeviceCapabilities | null;
  snapshot: DeviceSnapshot | null;
  osdEnabled: boolean;
  onToggleOsd: (enabled: boolean) => void;
  hotkeyLog: HotkeyEvent[];
  pendingControl: string | null;
  onSetControl: (request: DeviceControlRequest) => void;
  onTriggerDemoHotkey: (action: HotkeyActionKind) => void;
  isDemoClient: boolean;
}

const PREVIEW_EVENTS: Array<{ action: HotkeyActionKind; label: string; code: string }> = [
  { action: 'performance_mode_balanced', label: '档位 · 平衡', code: '0x41' },
  { action: 'performance_mode_performance', label: '档位 · 性能', code: '0x42' },
  { action: 'fn_lock_unlocked', label: 'Fn 解锁', code: '0x50' },
  { action: 'fn_lock_locked', label: 'Fn 锁定', code: '0x51' },
  { action: 'touchpad_disabled', label: '触摸板关闭', code: '0x30' },
  { action: 'touchpad_enabled', label: '触摸板开启', code: '0x31' },
  { action: 'mic_mute_toggle', label: '麦克风静音切换', code: '0xA1' },
  { action: 'keyboard_backlight_off', label: '背光 · 关', code: '0x20' },
  { action: 'keyboard_backlight_half', label: '背光 · 半亮', code: '0x21' },
  { action: 'keyboard_backlight_high', label: '背光 · 高亮', code: '0x22' },
  { action: 'refresh_rate_switch', label: '60/120 Hz (4s)', code: '0xA2' },
  { action: 'camera_disconnected', label: '摄像头隐私断开', code: '4001' },
  { action: 'camera_connected', label: '摄像头重新连接', code: '4000' },
];

const TIMER_OPTIONS = [
  { value: 0, label: '不自动熄灯' },
  { value: 10, label: '10 秒（已实测）' },
  { value: 15, label: '15 秒' },
  { value: 30, label: '30 秒' },
  { value: 60, label: '1 分钟' },
  { value: 300, label: '5 分钟' },
];

export const HotkeysOsdView: React.FC<HotkeysOsdViewProps> = ({
  connectionState,
  capabilities,
  snapshot,
  osdEnabled,
  onToggleOsd,
  hotkeyLog,
  pendingControl,
  onSetControl,
  onTriggerDemoHotkey,
  isDemoClient,
}) => {
  const isOffline = connectionState === 'disconnected';
  const controls = snapshot?.controls;

  return (
    <div className="space-y-6">
      {/* OSD Preference & Demo Trigger Matrix */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#151A21]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              {osdEnabled ? (
                <Bell className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              ) : (
                <BellOff className="h-4 w-4 text-slate-400" />
              )}
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                本应用屏幕提示（OSD）设置
              </h2>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              此开关仅控制<strong>本应用进程内</strong>的置顶 OSD 浮窗显示；关闭后热键状态同步与动作本身仍照常工作，不联动修改原厂控制中心注册表。
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={osdEnabled}
            onClick={() => onToggleOsd(!osdEnabled)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-md border px-3.5 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 whitespace-nowrap ${
              osdEnabled
                ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {osdEnabled ? 'OSD 提示：已开启' : 'OSD 提示：已关闭（静默同步）'}
          </button>
        </div>

        <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              已核对热键事件预览（普通提示 1000 ms · 刷新率 4000 ms）
            </h3>
            {!isDemoClient && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                实机客户端模式下由后台 OemWMIEvent 驱动
              </span>
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {PREVIEW_EVENTS.map((item) => (
              <button
                key={item.action}
                type="button"
                disabled={!isDemoClient || isOffline}
                onClick={() => onTriggerDemoHotkey(item.action)}
                className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2 text-left text-xs transition-colors hover:border-blue-500/60 hover:bg-blue-50/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-[#0F1319] dark:hover:border-blue-500/60 dark:hover:bg-blue-500/10"
              >
                <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                  {item.label}
                </span>
                <span className="font-mono-num shrink-0 text-[11px] text-slate-400">
                  {item.code}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Capability-Gated Device Controls */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Writable / Confirmed Controls */}
        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#151A21]">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            可操作设备控件（按后端能力声明显示）
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            仅在能力表返回 <span className="font-mono-num">writable = true</span> 时启用交互。
          </p>

          <div className="mt-4 space-y-4">
            {/* Keyboard Backlight */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <Keyboard className="h-4 w-4 text-slate-400" />
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    键盘背光亮度
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    三档映射 0x20 / 0x21 / 0x22
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-[#0F1319]">
                {([0, 1, 2] as const).map((lvl) => {
                  const labels = ['关', '半亮', '高档'];
                  const active = controls?.keyboardBacklightLevel === lvl;
                  return (
                    <button
                      key={lvl}
                      type="button"
                      disabled={
                        isOffline ||
                        !capabilities?.keyboardBacklight.writable ||
                        pendingControl === 'keyboardBacklight'
                      }
                      onClick={() => onSetControl({ control: 'keyboardBacklight', value: lvl })}
                      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-white text-slate-900 shadow-xs dark:bg-blue-600 dark:text-white'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                      }`}
                    >
                      {labels[lvl]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Keyboard Backlight Close Timer */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
              <div>
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  闲置熄灯计时
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  按任意键唤醒后恢复所选亮度
                </div>
              </div>
              <select
                aria-label="闲置熄灯计时"
                disabled={
                  isOffline ||
                  !capabilities?.keyboardBacklightTimer.writable ||
                  pendingControl === 'keyboardBacklightTimer'
                }
                value={controls?.keyboardCloseTimerSec ?? 10}
                onChange={(e) =>
                  onSetControl({
                    control: 'keyboardBacklightTimer',
                    value: Number(e.target.value),
                  })
                }
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50 dark:border-slate-700 dark:bg-[#0F1319] dark:text-slate-100"
              >
                {TIMER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Win Key Lock */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <Lock className="h-4 w-4 text-slate-400" />
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Win 键锁
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    当前状态：{controls?.winKeyLocked ? '已锁定' : '正常启用'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                disabled={
                  isOffline ||
                  !capabilities?.winKeyLock.writable ||
                  pendingControl === 'winKeyLock'
                }
                onClick={() =>
                  onSetControl({
                    control: 'winKeyLock',
                    value: !controls?.winKeyLocked,
                  })
                }
                className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  controls?.winKeyLocked
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#0F1319] dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                {controls?.winKeyLocked ? '已锁定 · 点击解锁' : '点击锁定 Win 键'}
              </button>
            </div>

            {/* Refresh Rate 60/120 Hz */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Monitor className="h-4 w-4 text-slate-400" />
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    内置面板刷新率（VXN03E8）
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    EDID 确认支持 2880×1800 @ 60 / 120 Hz
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-[#0F1319]">
                {([60, 120] as const).map((hz) => {
                  const active = controls?.refreshRateHz === hz;
                  return (
                    <button
                      key={hz}
                      type="button"
                      disabled={
                        isOffline ||
                        !capabilities?.refreshRate.writable ||
                        pendingControl === 'refreshRate'
                      }
                      onClick={() => onSetControl({ control: 'refreshRate', value: hz })}
                      className={`font-mono-num rounded px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-white text-slate-900 shadow-xs dark:bg-blue-600 dark:text-white'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                      }`}
                    >
                      {hz} Hz
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Read-Only Observed States + Recent Hotkey Feed */}
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#151A21]">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              只读硬件与外设观察（防重复执行）
            </h2>
            <dl className="mt-3 divide-y divide-slate-200 text-xs dark:divide-slate-800">
              <div className="flex items-center justify-between py-2.5">
                <dt className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <MousePointerClick className="h-3.5 w-3.5 text-slate-400" />
                  <span>触摸板（固件执行 · 仅同步）</span>
                </dt>
                <dd className="font-medium text-slate-900 dark:text-slate-100">
                  {controls?.touchpadEnabled === null || controls?.touchpadEnabled === undefined
                    ? '未知'
                    : controls.touchpadEnabled
                      ? '已开启'
                      : '已关闭'}
                </dd>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <dt className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  {controls?.micMuted ? (
                    <MicOff className="h-3.5 w-3.5 text-amber-500" />
                  ) : (
                    <Mic className="h-3.5 w-3.5 text-slate-400" />
                  )}
                  <span>麦克风端点状态</span>
                </dt>
                <dd className="font-medium text-slate-900 dark:text-slate-100">
                  {controls?.micMuted ? '已静音' : '未静音'}
                </dd>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <dt className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <Camera className="h-3.5 w-3.5 text-slate-400" />
                  <span>USB 摄像头 PnP 状态</span>
                </dt>
                <dd
                  className={`font-medium ${
                    controls?.cameraConnected === false
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {controls?.cameraConnected === false
                    ? '已退枚举 / 隐私断开'
                    : '设备在线 (Started)'}
                </dd>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <dt className="text-slate-600 dark:text-slate-300">Fn 模式锁</dt>
                <dd className="font-medium text-slate-900 dark:text-slate-100">
                  {controls?.fnLocked ? '已锁定' : '已解锁'}
                </dd>
              </div>
            </dl>
          </div>

          {/* Recent Hotkey Event Log */}
          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#151A21]">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              最近收到的热键与状态通知
            </h2>
            {hotkeyLog.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                尚未收到事件。点击上方任意热键按钮（或关闭主窗口至托盘后在调试台触发）即可验证事件同步与 OSD 表现。
              </p>
            ) : (
              <ul className="mt-3 max-h-48 divide-y divide-slate-200 overflow-y-auto text-xs dark:divide-slate-800">
                {hotkeyLog.map((evt) => (
                  <li key={evt.eventId} className="flex items-start justify-between gap-3 py-2">
                    <div>
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {evt.title}：{evt.stateLabel}
                      </span>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {evt.sourceNote}
                      </p>
                    </div>
                    <span className="font-mono-num shrink-0 text-[11px] text-slate-400">
                      {evt.codeHex} · {new Date(evt.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
