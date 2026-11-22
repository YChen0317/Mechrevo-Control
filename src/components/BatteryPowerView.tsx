import React from 'react';
import { Battery, Plug, ShieldAlert } from 'lucide-react';
import { DeviceCapabilities, DeviceSnapshot } from '../client/contracts';
import { formatChargingState, formatPowerSource } from './OverviewPerformanceView';

interface BatteryPowerViewProps {
  capabilities: DeviceCapabilities | null;
  snapshot: DeviceSnapshot | null;
}

export const BatteryPowerView: React.FC<BatteryPowerViewProps> = ({ capabilities, snapshot }) => {
  const power = snapshot?.power;
  const batteryPct = power?.batteryPercent ?? null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Battery & Power Core */}
        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#151A21]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Battery className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                电池与供电实态
              </h2>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {snapshot?.dataSource === 'demo' ? '演示数据' : 'Windows ACPI 电池'}
            </span>
          </div>

          <div className="mt-4 flex items-end justify-between gap-4">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">当前剩余电量</div>
              <div className="mt-1 font-mono-num text-4xl font-semibold text-slate-900 dark:text-slate-100">
                {batteryPct !== null ? `${batteryPct}%` : '不可用'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500 dark:text-slate-400">整机充放电功率</div>
              <div className="mt-1 font-mono-num text-xl font-semibold text-slate-900 dark:text-slate-100">
                {power?.batteryPowerWatts !== null && power?.batteryPowerWatts !== undefined
                  ? `${power.batteryPowerWatts > 0 ? '+' : ''}${power.batteryPowerWatts.toFixed(1)} W`
                  : '不可用'}
              </div>
            </div>
          </div>

          {/* Clean progress bar */}
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className={`h-full transition-transform duration-200 ${
                batteryPct !== null && batteryPct <= 20
                  ? 'bg-red-500'
                  : power?.chargingState === 'charging'
                    ? 'bg-emerald-500'
                    : 'bg-blue-600 dark:bg-blue-500'
              }`}
              style={{
                width: `${batteryPct !== null ? Math.min(100, Math.max(0, batteryPct)) : 0}%`,
              }}
            />
          </div>

          <dl className="mt-5 divide-y divide-slate-200 text-xs dark:divide-slate-800">
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">供电方式（独立字段）</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100">
                {power ? formatPowerSource(power.powerSource) : '—'}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">充电状态（独立字段）</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100">
                {power ? formatChargingState(power.chargingState) : '—'}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">Windows 电源计划（独立于固件档位）</dt>
              <dd className="font-mono-num text-right text-slate-700 dark:text-slate-300">
                {power?.windowsPowerPlan ?? '—'}
              </dd>
            </div>
          </dl>
        </section>

        {/* Charge Limit — Read-only / Gated per handoff docs */}
        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#151A21]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Plug className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                电池限充与固件字段（首版只读）
              </h2>
            </div>
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
              {capabilities?.batteryChargeLimit.writable ? '可写入' : '写入未开放'}
            </span>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            实机核查确认本机原厂控制中心未提供电池保护入口。固件中存在{' '}
            <span className="font-mono-num">WMDA (BatteryChargeRationing)</span> 与{' '}
            <span className="font-mono-num">WMBE (Battery_Charge_Mode)</span>{' '}
            两条独立路径，当前实测读回均为真实零值 <span className="font-mono-num">0</span>，在完成实际停充与恢复默认验证前不开放阈值写入控件。
          </p>

          <dl className="mt-4 divide-y divide-slate-200 text-xs dark:divide-slate-800">
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">
                限充下限原始值 (<span className="font-mono-num">WMDA · MICP</span>)
              </dt>
              <dd className="font-mono-num font-medium text-slate-900 dark:text-slate-100">
                {power?.chargeLimitMinRaw !== null && power?.chargeLimitMinRaw !== undefined
                  ? `${power.chargeLimitMinRaw}（真实零值）`
                  : '不可用'}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">
                限充上限原始值 (<span className="font-mono-num">WMDA · MXCP</span>)
              </dt>
              <dd className="font-mono-num font-medium text-slate-900 dark:text-slate-100">
                {power?.chargeLimitMaxRaw !== null && power?.chargeLimitMaxRaw !== undefined
                  ? `${power.chargeLimitMaxRaw}（真实零值）`
                  : '不可用'}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">
                充电模式原始值 (<span className="font-mono-num">WMBE · EBCM</span>)
              </dt>
              <dd className="font-mono-num font-medium text-slate-900 dark:text-slate-100">
                {power?.chargeModeRaw !== null && power?.chargeModeRaw !== undefined
                  ? `${power.chargeModeRaw}（真实零值）`
                  : '不可用'}
              </dd>
            </div>
          </dl>

          <div className="mt-4 flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-[#0F1319] dark:text-slate-400">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              {capabilities?.batteryChargeLimit.unavailableReason ??
                '等待后端验证有效边界、实际停充电流与恢复原厂默认 0 后开放写操作。'}
            </span>
          </div>
        </section>
      </div>
    </div>
  );
};
