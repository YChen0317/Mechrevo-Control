import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ClientError,
  ConnectionState,
  DeviceCapabilities,
  DeviceControlRequest,
  DeviceSnapshot,
  HardwarePerformanceMode,
  HotkeyActionKind,
  HotkeyEvent,
  IDeviceClient,
  UserPolicyMode,
} from '../client/contracts';
import {
  DemoDeviceClient,
  DemoFaultConfig,
  DemoLoadPreset,
  DemoSwitchOutcome,
} from '../client/DemoDeviceClient';
import { NamedPipeDeviceClient } from '../client/NamedPipeDeviceClient';

export type ClientAdapterKind = 'demo' | 'named-pipe';
export type NavSection = 'overview' | 'battery' | 'hotkeys' | 'contract';

export interface ActiveOsdState {
  event: HotkeyEvent;
  expiresAt: number;
}

export function useDeviceController() {
  const demoClientRef = useRef<DemoDeviceClient | null>(null);
  if (!demoClientRef.current) {
    demoClientRef.current = new DemoDeviceClient();
  }
  const pipeClientRef = useRef<NamedPipeDeviceClient | null>(null);
  if (!pipeClientRef.current) {
    pipeClientRef.current = new NamedPipeDeviceClient();
  }

  const [adapterKind, setAdapterKind] = useState<ClientAdapterKind>('demo');
  const activeClient: IDeviceClient =
    adapterKind === 'demo' ? demoClientRef.current : pipeClientRef.current;

  const [connectionState, setConnectionState] = useState<ConnectionState>('connected');
  const [capabilities, setCapabilities] = useState<DeviceCapabilities | null>(null);
  const [snapshot, setSnapshot] = useState<DeviceSnapshot | null>(null);
  const [lastError, setLastError] = useState<ClientError | null>(null);
  const [pendingMode, setPendingMode] = useState<HardwarePerformanceMode | null>(null);
  const [pendingPolicy, setPendingPolicy] = useState<UserPolicyMode | 'restore' | null>(null);
  const [pendingControl, setPendingControl] = useState<string | null>(null);

  // Single-process App lifecycle state
  const [processRunning, setProcessRunning] = useState(true);
  const [isWindowOpen, setIsWindowOpen] = useState(true);
  const [activeNav, setActiveNav] = useState<NavSection>('overview');
  const [trayMenuOpen, setTrayMenuOpen] = useState(false);

  // App-local OSD preference (only affects OSD display, never suppresses hotkey actions)
  const [osdEnabled, setOsdEnabled] = useState(true);
  const [activeOsd, setActiveOsd] = useState<ActiveOsdState | null>(null);
  const [hotkeyLog, setHotkeyLog] = useState<HotkeyEvent[]>([]);

  // Demo client diagnostic state
  const [demoConfig, setDemoConfig] = useState<DemoFaultConfig>(() =>
    demoClientRef.current!.getDemoConfig(),
  );

  // Revision guard per backend-handoff.md
  const lastRevisionRef = useRef<{ instanceId: string; revision: number } | null>(null);
  const osdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const osdEnabledRef = useRef(osdEnabled);
  osdEnabledRef.current = osdEnabled;

  const acceptSnapshot = useCallback((incoming: DeviceSnapshot) => {
    const prev = lastRevisionRef.current;
    if (
      prev &&
      prev.instanceId === incoming.serviceInstanceId &&
      incoming.revision < prev.revision
    ) {
      return;
    }
    lastRevisionRef.current = {
      instanceId: incoming.serviceInstanceId,
      revision: incoming.revision,
    };
    setSnapshot(incoming);
  }, []);

  const dismissOsd = useCallback(() => {
    if (osdTimerRef.current) {
      clearTimeout(osdTimerRef.current);
      osdTimerRef.current = null;
    }
    setActiveOsd(null);
  }, []);

  const showOsd = useCallback(
    (event: HotkeyEvent) => {
      if (!osdEnabledRef.current) return;
      if (osdTimerRef.current) {
        clearTimeout(osdTimerRef.current);
      }
      const expiresAt = Date.now() + event.osdDurationMs;
      setActiveOsd({ event, expiresAt });
      osdTimerRef.current = setTimeout(() => {
        setActiveOsd(null);
        osdTimerRef.current = null;
      }, event.osdDurationMs);
    },
    [],
  );

  // Subscribe to demo config updates
  useEffect(() => {
    const unsub = demoClientRef.current!.subscribeDemoConfig(setDemoConfig);
    return unsub;
  }, []);

  // Connect & subscribe whenever adapterKind or processRunning changes
  useEffect(() => {
    if (!processRunning) {
      activeClient.setTelemetryActive(false);
      return;
    }

    let cancelled = false;
    lastRevisionRef.current = null;
    setLastError(null);
    setPendingMode(null);
    setPendingPolicy(null);

    const unsubStatus = activeClient.subscribeStatus((evt) => {
      if (cancelled) return;
      setConnectionState(evt.connectionState);
      if (evt.capabilities) setCapabilities(evt.capabilities);
      if (evt.snapshot) acceptSnapshot(evt.snapshot);
      if (evt.error) setLastError(evt.error);
      if (evt.connectionState === 'connected' && !evt.error) {
        setLastError((prev) => (prev?.code === 'SERVICE_OFFLINE' ? null : prev));
      }
    });

    const unsubHotkey = activeClient.subscribeHotkey((evt) => {
      if (cancelled) return;
      setHotkeyLog((prev) => [evt, ...prev].slice(0, 14));
      showOsd(evt);
    });

    (async () => {
      try {
        setConnectionState(activeClient.getConnectionState());
        const [caps, snap] = await Promise.all([
          activeClient.getCapabilities(),
          activeClient.getSnapshot(),
        ]);
        if (cancelled) return;
        setConnectionState('connected');
        setCapabilities(caps);
        acceptSnapshot(snap);
      } catch (err) {
        if (cancelled) return;
        const clientErr = err as ClientError;
        setConnectionState('disconnected');
        setLastError(clientErr);
        setSnapshot((prev) => (prev ? { ...prev, isStale: true } : null));
      }
    })();

    return () => {
      cancelled = true;
      unsubStatus();
      unsubHotkey();
    };
  }, [activeClient, processRunning, acceptSnapshot, showOsd]);

  // High-frequency telemetry gating: ONLY active when single process is running,
  // main window is mounted, AND user is on Overview/Performance view.
  const shouldPollTelemetry = processRunning && isWindowOpen && activeNav === 'overview';
  useEffect(() => {
    activeClient.setTelemetryActive(shouldPollTelemetry);
  }, [activeClient, shouldPollTelemetry]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
      demoClientRef.current?.dispose();
      pipeClientRef.current?.dispose();
    };
  }, []);

  const requestPerformanceMode = useCallback(
    async (target: HardwarePerformanceMode) => {
      if (!processRunning || pendingMode !== null) return;
      setPendingMode(target);
      setLastError(null);
      try {
        const result = await activeClient.setPerformanceMode(target);
        acceptSnapshot(result.snapshot);
        if (!result.ok && result.error) {
          setLastError(result.error);
        }
      } catch (err) {
        setLastError(err as ClientError);
      } finally {
        setPendingMode(null);
      }
    },
    [activeClient, processRunning, pendingMode, acceptSnapshot],
  );

  const requestPolicyMode = useCallback(
    async (policy: UserPolicyMode) => {
      if (!processRunning || pendingPolicy !== null || pendingMode !== null) return;
      setPendingPolicy(policy);
      setLastError(null);
      try {
        const result = await activeClient.setPolicyMode(policy);
        acceptSnapshot(result.snapshot);
        if (!result.ok && result.error) {
          setLastError(result.error);
        }
      } catch (err) {
        setLastError(err as ClientError);
      } finally {
        setPendingPolicy(null);
      }
    },
    [activeClient, processRunning, pendingPolicy, pendingMode, acceptSnapshot],
  );

  const requestRestoreDailySmooth = useCallback(async () => {
    if (!processRunning || pendingPolicy !== null) return;
    setPendingPolicy('restore');
    setLastError(null);
    try {
      const result = await activeClient.restoreDailySmooth();
      acceptSnapshot(result.snapshot);
      if (!result.ok && result.error) {
        setLastError(result.error);
      }
    } catch (err) {
      setLastError(err as ClientError);
    } finally {
      setPendingPolicy(null);
    }
  }, [activeClient, processRunning, pendingPolicy, acceptSnapshot]);

  const requestDeviceControl = useCallback(
    async (request: DeviceControlRequest) => {
      if (!processRunning) return;
      setPendingControl(request.control);
      setLastError(null);
      try {
        const result = await activeClient.setDeviceControl(request);
        acceptSnapshot(result.snapshot);
        if (!result.ok && result.error) {
          setLastError(result.error);
        }
      } catch (err) {
        setLastError(err as ClientError);
      } finally {
        setPendingControl(null);
      }
    },
    [activeClient, processRunning, acceptSnapshot],
  );

  const requestReconnect = useCallback(async () => {
    setLastError(null);
    try {
      const { capabilities: caps, snapshot: snap } = await activeClient.reconnect();
      setCapabilities(caps);
      acceptSnapshot(snap);
      setConnectionState('connected');
    } catch (err) {
      setConnectionState('disconnected');
      setLastError(err as ClientError);
    }
  }, [activeClient, acceptSnapshot]);

  const demoActions = useMemo(
    () => ({
      setLoadPreset: (preset: DemoLoadPreset) => demoClientRef.current!.setDemoLoadPreset(preset),
      setNextSwitchOutcome: (outcome: DemoSwitchOutcome) =>
        demoClientRef.current!.setNextSwitchOutcome(outcome),
      setPolicyGate: (target: 'dailySmooth' | 'smartMode', enabled: boolean) =>
        demoClientRef.current!.setPolicyCapabilityGate(target, enabled),
      setDailySmoothRestoreFails: (fails: boolean) =>
        demoClientRef.current!.setDailySmoothRestoreFails(fails),
      simulateDisconnect: () => demoClientRef.current!.simulateDisconnect(),
      triggerHotkey: (action: HotkeyActionKind) => demoClientRef.current!.triggerDemoHotkey(action),
    }),
    [],
  );

  const openWindow = useCallback(() => {
    setProcessRunning(true);
    setIsWindowOpen(true);
    setTrayMenuOpen(false);
  }, []);

  const closeWindowToTray = useCallback(() => {
    setIsWindowOpen(false);
    setTrayMenuOpen(false);
  }, []);

  const exitSingleProcess = useCallback(() => {
    setTrayMenuOpen(false);
    setIsWindowOpen(false);
    dismissOsd();
    setProcessRunning(false);
  }, [dismissOsd]);

  const launchSingleProcess = useCallback(() => {
    setProcessRunning(true);
    setIsWindowOpen(true);
  }, []);

  return {
    adapterKind,
    setAdapterKind,
    activeClient,
    connectionState,
    capabilities,
    snapshot,
    lastError,
    clearError: () => setLastError(null),
    pendingMode,
    pendingPolicy,
    pendingControl,
    processRunning,
    isWindowOpen,
    openWindow,
    closeWindowToTray,
    exitSingleProcess,
    launchSingleProcess,
    activeNav,
    setActiveNav,
    trayMenuOpen,
    setTrayMenuOpen,
    osdEnabled,
    setOsdEnabled,
    activeOsd,
    dismissOsd,
    hotkeyLog,
    demoConfig,
    demoActions,
    shouldPollTelemetry,
    requestPerformanceMode,
    requestPolicyMode,
    requestRestoreDailySmooth,
    requestDeviceControl,
    requestReconnect,
  };
}
