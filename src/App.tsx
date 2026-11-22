import React, { useEffect, useState } from 'react';
import {
  Battery,
  ChevronUp,
  Cpu,
  FlaskConical,
  Gauge,
  GitPullRequestDraft,
  Keyboard,
  Minus,
  Moon,
  Power,
  Sun,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import { NavSection, useDeviceController } from './hooks/useDeviceController';
import {
  formatHardwareModeLabel,
  formatPolicyLabel,
  OverviewPerformanceView,
} from './components/OverviewPerformanceView';
import { BatteryPowerView } from './components/BatteryPowerView';
import { HotkeysOsdView } from './components/HotkeysOsdView';
import { ContractPrView } from './components/ContractPrView';
import { TrayFlyout } from './components/TrayFlyout';
import { OsdOverlay } from './components/OsdOverlay';
import { DemoScenarioDrawer } from './components/DemoScenarioDrawer';

const NAV_ITEMS: Array<{ id: NavSection; label: string; icon: React.ReactNode }> = [
  { id: 'overview', label: '概览与性能', icon: <Gauge className="h-4 w-4" /> },
  { id: 'battery', label: '电池与供电', icon: <Battery className="h-4 w-4" /> },
  { id: 'hotkeys', label: '热键与 OSD', icon: <Keyboard className="h-4 w-4" /> },
  { id: 'contract', label: '接口核对与 PR', icon: <GitPullRequestDraft className="h-4 w-4" /> },
];

export function App() {
  const ctrl = useDeviceController();
  const [darkMode, setDarkMode] = useState(true);
  const [demoDrawerOpen, setDemoDrawerOpen] = useState(true);
  const [clockText, setClockText] = useState(() =>
    new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }),
  );

  // Sync Tailwind v4 .dark class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  // Taskbar clock (updates every 15s, low wakeups)
  useEffect(() => {
    const id = setInterval(() => {
      setClockText(
        new Date().toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }),
      );
    }, 15000);
    return () => clearInterval(id);
  }, []);

  // Keyboard Escape handler for Tray flyout and OSD
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (ctrl.trayMenuOpen) ctrl.setTrayMenuOpen(false);
        if (ctrl.activeOsd) ctrl.dismissOsd();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [ctrl]);

  const isDemoClient = ctrl.adapterKind === 'demo';
  const confirmedMode = ctrl.snapshot?.mode.hardwareMode ?? 'unknown';
  const isOffline = ctrl.connectionState === 'disconnected';

  return (
    <div className="relative flex min-h-screen flex-col bg-[#E8EDF3] text-slate-900 transition-colors dark:bg-[#0B0E13] dark:text-slate-100">
      {/* Desktop Canvas Area */}
      <div
        className={`relative flex flex-1 flex-col items-center justify-start px-4 pt-5 pb-16 transition-all ${
          demoDrawerOpen ? 'xl:pr-[22rem]' : ''
        }`}
      >
        {/* Main Application Window (strictly mounted only when open; unmounted when closed to tray!) */}
        {ctrl.processRunning && ctrl.isWindowOpen ? (
          <div
            role="application"
            aria-label="无界 14 MAX 控制台主窗口"
            className="flex w-full max-w-[1120px] flex-col overflow-hidden rounded-xl border border-slate-300/90 bg-[#F5F7FA] shadow-2xl dark:border-slate-800 dark:bg-[#0F1319]"
          >
            {/* Windows 11 Title Bar */}
            <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-2.5 dark:border-slate-800 dark:bg-[#131820]">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white">
                  <Cpu className="h-3.5 w-3.5" />
                </div>
                <span className="truncate text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
                  无界 14 MAX 控制台
                </span>
                <span className="hidden text-xs text-slate-400 sm:inline" aria-hidden="true">
                  ·
                </span>
                <span
                  className={`hidden text-xs font-medium sm:inline whitespace-nowrap ${
                    isDemoClient
                      ? 'text-blue-700 dark:text-blue-400'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {isDemoClient ? '演示数据（无需目标机型）' : '实机命名管道客户端'}
                </span>
                <span className="hidden text-xs text-slate-400 md:inline" aria-hidden="true">
                  ·
                </span>
                <span
                  className={`hidden text-xs md:inline whitespace-nowrap ${
                    isOffline
                      ? 'font-medium text-amber-600 dark:text-amber-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {isOffline
                    ? '服务断线'
                    : ctrl.connectionState === 'reconnecting'
                      ? '重连中'
                      : '服务已连接'}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setDemoDrawerOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  <FlaskConical className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  {demoDrawerOpen ? '收起调试台' : '演示调试台'}
                </button>
                <button
                  type="button"
                  onClick={() => setDarkMode((d) => !d)}
                  aria-label={darkMode ? '切换浅色外观' : '切换深色外观'}
                  title={darkMode ? '切换浅色外观' : '切换深色外观'}
                  className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                >
                  {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={ctrl.closeWindowToTray}
                  aria-label="最小化到系统托盘"
                  title="最小化到系统托盘（释放主窗并暂停高频遥测）"
                  className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={ctrl.closeWindowToTray}
                  aria-label="关闭窗口至系统托盘"
                  title="关闭主窗口并保留托盘常驻（释放 UI 树）"
                  className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-red-500 hover:text-white focus-visible:outline-2 focus-visible:outline-red-500 dark:text-slate-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>

            {/* Body: Sidebar + Main Content */}
            <div className="flex min-h-[620px] flex-col md:flex-row">
              {/* Left Navigation Sidebar */}
              <aside className="flex w-full shrink-0 flex-col justify-between border-b border-slate-200 bg-white/70 p-3 md:w-56 md:border-r md:border-b-0 dark:border-slate-800 dark:bg-[#11161D]">
                <nav aria-label="主导航" className="flex gap-1 overflow-x-auto md:flex-col">
                  {NAV_ITEMS.map((item) => {
                    const active = ctrl.activeNav === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => ctrl.setActiveNav(item.id)}
                        aria-current={active ? 'page' : undefined}
                        className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 whitespace-nowrap shrink-0 ${
                          active
                            ? 'bg-blue-600/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-100'
                        }`}
                      >
                        {item.icon}
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </nav>

                {/* Quiet Device Baseline Footer inside Sidebar */}
                <div className="mt-4 hidden border-t border-slate-200 pt-3 text-[11px] leading-relaxed text-slate-500 md:block dark:border-slate-800 dark:text-slate-400">
                  <div className="font-medium text-slate-700 dark:text-slate-300">
                    无界 14 MAX · Dove4
                  </div>
                  <div>Core Ultra 7 256V</div>
                  <div className="font-mono-num mt-0.5 text-[10px] opacity-80">
                    BIOS Rev05 · 单进程普通权限
                  </div>
                </div>
              </aside>

              {/* Main Content Viewport */}
              <main className="flex-1 overflow-y-auto p-5 md:p-6">
                {ctrl.activeNav === 'overview' && (
                  <OverviewPerformanceView
                    connectionState={ctrl.connectionState}
                    capabilities={ctrl.capabilities}
                    snapshot={ctrl.snapshot}
                    lastError={ctrl.lastError}
                    pendingMode={ctrl.pendingMode}
                    pendingPolicy={ctrl.pendingPolicy}
                    telemetryRunning={ctrl.demoConfig.telemetryRunning}
                    onSelectMode={ctrl.requestPerformanceMode}
                    onSelectPolicy={ctrl.requestPolicyMode}
                    onRestoreDailySmooth={ctrl.requestRestoreDailySmooth}
                    onReconnect={ctrl.requestReconnect}
                    onDismissError={ctrl.clearError}
                  />
                )}

                {ctrl.activeNav === 'battery' && (
                  <BatteryPowerView
                    capabilities={ctrl.capabilities}
                    snapshot={ctrl.snapshot}
                  />
                )}

                {ctrl.activeNav === 'hotkeys' && (
                  <HotkeysOsdView
                    connectionState={ctrl.connectionState}
                    capabilities={ctrl.capabilities}
                    snapshot={ctrl.snapshot}
                    osdEnabled={ctrl.osdEnabled}
                    onToggleOsd={ctrl.setOsdEnabled}
                    hotkeyLog={ctrl.hotkeyLog}
                    pendingControl={ctrl.pendingControl}
                    onSetControl={ctrl.requestDeviceControl}
                    onTriggerDemoHotkey={ctrl.demoActions.triggerHotkey}
                    isDemoClient={isDemoClient}
                  />
                )}

                {ctrl.activeNav === 'contract' && (
                  <ContractPrView
                    adapterKind={ctrl.adapterKind}
                    onChangeAdapter={ctrl.setAdapterKind}
                    telemetryRunning={ctrl.demoConfig.telemetryRunning}
                    telemetryTickCount={ctrl.demoConfig.telemetryTickCount}
                  />
                )}
              </main>
            </div>
          </div>
        ) : (
          /* Windows Desktop Idle / Closed-to-Tray State */
          <div className="mt-16 flex w-full max-w-lg flex-col items-center rounded-xl border border-slate-300 bg-white/90 p-8 text-center shadow-lg backdrop-blur-md dark:border-slate-800 dark:bg-[#151A21]/90">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
              {ctrl.processRunning ? <Cpu className="h-6 w-6" /> : <Power className="h-6 w-6" />}
            </div>

            <h1 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
              {ctrl.processRunning
                ? '主窗口已关闭并卸载，前端单进程仍在托盘常驻'
                : '无界 14 MAX 控制台进程已退出'}
            </h1>

            <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              {ctrl.processRunning
                ? '主窗口的 UI 树与高频遥测订阅现已彻底停止（零轮询低功耗待机）。你可以点击右下角任务栏托盘图标快速切档，或在右侧演示调试台触发热键查看置顶 OSD 提示。'
                : '单进程前端应用（窗口、托盘与 OSD）已全部退出。点击下方按钮模拟双击桌面快捷方式重新启动演示版。'}
            </p>

            {ctrl.processRunning && (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  当前已确认：{formatPolicyLabel(ctrl.snapshot?.mode.selectedPolicy)} ·{' '}
                  {formatHardwareModeLabel(confirmedMode)}
                </span>
                <span aria-hidden="true">·</span>
                <span>高频遥测已暂停</span>
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {ctrl.processRunning ? (
                <>
                  <button
                    type="button"
                    onClick={ctrl.openWindow}
                    className="rounded-md bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 whitespace-nowrap"
                  >
                    重新打开主窗口
                  </button>
                  <button
                    type="button"
                    onClick={() => ctrl.setTrayMenuOpen(true)}
                    className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-slate-700 dark:bg-[#0F1319] dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
                  >
                    打开右下角托盘菜单
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={ctrl.launchSingleProcess}
                  className="rounded-md bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 whitespace-nowrap"
                >
                  双击启动 MechrevoControl.Frontend.exe（演示）
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Collapsible Demo Scenario Controller */}
      <DemoScenarioDrawer
        open={demoDrawerOpen}
        onToggleOpen={() => setDemoDrawerOpen((v) => !v)}
        demoConfig={ctrl.demoConfig}
        isDemoClient={isDemoClient}
        processRunning={ctrl.processRunning}
        isWindowOpen={ctrl.isWindowOpen}
        onSetLoadPreset={ctrl.demoActions.setLoadPreset}
        onSetNextSwitchOutcome={ctrl.demoActions.setNextSwitchOutcome}
        onSetPolicyGate={ctrl.demoActions.setPolicyGate}
        onSetDailySmoothRestoreFails={ctrl.demoActions.setDailySmoothRestoreFails}
        onSimulateDisconnect={ctrl.demoActions.simulateDisconnect}
        onReconnect={ctrl.requestReconnect}
        onTriggerHotkey={ctrl.demoActions.triggerHotkey}
      />

      {/* Topmost Single-Process OSD Overlay (works even when Main Window is closed!) */}
      <OsdOverlay activeOsd={ctrl.activeOsd} onDismiss={ctrl.dismissOsd} />

      {/* Single-Process System Tray Flyout */}
      {ctrl.processRunning && (
        <TrayFlyout
          open={ctrl.trayMenuOpen}
          isWindowOpen={ctrl.isWindowOpen}
          connectionState={ctrl.connectionState}
          capabilities={ctrl.capabilities}
          snapshot={ctrl.snapshot}
          pendingMode={ctrl.pendingMode}
          osdEnabled={ctrl.osdEnabled}
          onSelectMode={ctrl.requestPerformanceMode}
          onToggleOsd={ctrl.setOsdEnabled}
          onOpenWindow={ctrl.openWindow}
          onCloseWindowToTray={ctrl.closeWindowToTray}
          onReconnect={ctrl.requestReconnect}
          onExitProcess={ctrl.exitSingleProcess}
        />
      )}

      {/* Simulated Windows 11 Taskbar & System Tray Notification Area */}
      <footer
        aria-label="Windows 任务栏与系统托盘"
        className="fixed right-0 bottom-0 left-0 z-40 flex h-12 items-center justify-between border-t border-slate-300/90 bg-white/92 px-4 text-xs backdrop-blur-md dark:border-slate-800 dark:bg-[#10141B]/95"
      >
        {/* Left: Taskbar app button */}
        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] text-slate-500 sm:inline dark:text-slate-400">
            Windows 11 桌面模拟
          </span>
          {ctrl.processRunning && ctrl.isWindowOpen && (
            <button
              type="button"
              onClick={ctrl.closeWindowToTray}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-900 transition-colors hover:bg-slate-200 dark:border-slate-700 dark:bg-[#19202B] dark:text-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <Cpu className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <span>无界 14 MAX 控制台</span>
            </button>
          )}
        </div>

        {/* Right: System Tray Notification Area */}
        <div className="flex items-center gap-3">
          {ctrl.processRunning ? (
            <button
              type="button"
              onClick={() => ctrl.setTrayMenuOpen((v) => !v)}
              aria-expanded={ctrl.trayMenuOpen}
              aria-label="打开无界 14 MAX 系统托盘菜单"
              title="系统托盘图标：点击打开快捷切档与主窗口菜单"
              className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 whitespace-nowrap ${
                ctrl.trayMenuOpen
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : isOffline
                    ? 'border-amber-500/60 bg-amber-500/15 text-amber-800 dark:text-amber-300'
                    : 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200 dark:border-slate-700 dark:bg-[#19202B] dark:text-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {isOffline ? (
                <WifiOff className="h-3.5 w-3.5" />
              ) : confirmedMode === 'performance' ? (
                <Zap className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
              ) : (
                <Gauge className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
              )}
              <span>
                托盘 · {isOffline ? '断线' : confirmedMode === 'performance' ? '性能' : '平衡'}
              </span>
              <ChevronUp className="h-3 w-3 opacity-70" />
            </button>
          ) : (
            <span className="text-[11px] text-slate-400">托盘进程未运行</span>
          )}

          <div className="hidden items-center gap-2 text-slate-600 sm:flex dark:text-slate-300">
            <span className="font-mono-num">
              {ctrl.snapshot?.power.batteryPercent !== null &&
              ctrl.snapshot?.power.batteryPercent !== undefined
                ? `${ctrl.snapshot.power.batteryPercent}%`
                : '—'}
            </span>
            <span aria-hidden="true" className="text-slate-400">
              ·
            </span>
            <span className="font-mono-num">{clockText}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
