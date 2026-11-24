import React from 'react';
import {
  Camera,
  Gauge,
  Keyboard,
  Lock,
  MicOff,
  Monitor,
  MousePointerClick,
  X,
  Zap,
} from 'lucide-react';
import { ActiveOsdState } from '../hooks/useDeviceController';
import { HotkeyActionKind } from '../client/contracts';

interface OsdOverlayProps {
  activeOsd: ActiveOsdState | null;
  onDismiss: () => void;
}

function getOsdIcon(action: HotkeyActionKind) {
  switch (action) {
    case 'performance_mode_balanced':
      return <Gauge className="h-5 w-5 text-blue-500 dark:text-blue-400" />;
    case 'performance_mode_performance':
      return <Zap className="h-5 w-5 text-blue-500 dark:text-blue-400" />;
    case 'fn_lock_locked':
    case 'fn_lock_unlocked':
      return <Lock className="h-5 w-5 text-slate-700 dark:text-slate-200" />;
    case 'touchpad_disabled':
    case 'touchpad_enabled':
      return <MousePointerClick className="h-5 w-5 text-slate-700 dark:text-slate-200" />;
    case 'mic_mute_toggle':
      return <MicOff className="h-5 w-5 text-amber-500 dark:text-amber-400" />;
    case 'keyboard_backlight_off':
    case 'keyboard_backlight_half':
    case 'keyboard_backlight_high':
      return <Keyboard className="h-5 w-5 text-slate-700 dark:text-slate-200" />;
    case 'refresh_rate_switch':
      return <Monitor className="h-5 w-5 text-blue-500 dark:text-blue-400" />;
    case 'camera_connected':
    case 'camera_disconnected':
      return <Camera className="h-5 w-5 text-slate-700 dark:text-slate-200" />;
  }
}

export const OsdOverlay: React.FC<OsdOverlayProps> = ({ activeOsd, onDismiss }) => {
  if (!activeOsd) return null;
  const { event } = activeOsd;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto fixed bottom-16 left-1/2 z-50 w-[340px] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border border-slate-300/80 bg-white/95 p-3.5 shadow-xl backdrop-blur-md transition-opacity duration-150 dark:border-slate-700/80 dark:bg-[#161B23]/95"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-[#0E1218]">
          {getOsdIcon(event.action)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">
              {event.title} · 本应用 OSD
            </span>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="关闭提示"
              className="rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-0.5 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {event.stateLabel}
          </p>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="font-mono-num">{event.codeHex}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-num">{event.osdDurationMs} ms</span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{event.stateConfirmed ? '已确认状态' : '状态未确认'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
