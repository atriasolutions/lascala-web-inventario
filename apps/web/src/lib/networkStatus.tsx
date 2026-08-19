import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type NetworkStatusValue = {
  /** `navigator.onLine` + último probe (si hubo). */
  online: boolean;
  /** true mientras se confirma el estado de red. */
  checking: boolean;
  /** Fuerza un probe al API (útil en “Reintentar”). */
  refresh: () => Promise<boolean>;
};

const NetworkStatusContext = createContext<NetworkStatusValue | null>(null);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const PROBE_PATH = '/api/health';
const PROBE_TIMEOUT_MS = 3500;

async function probeReachable(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}${PROBE_PATH}`, {
      method: 'GET',
      cache: 'no-store',
      signal: ctrl.signal,
    });
    return res.ok;
  } catch {
    // Sin probe confiable: confiar en navigator.onLine (evita falsos offline en LAN).
    return typeof navigator === 'undefined' ? true : navigator.onLine;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Detector online/offline global (Fase A).
 * Fase B/C: el mismo hook alimentará bloqueo de módulos y sync de cola POS.
 */
export function NetworkStatusProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(
    () => (typeof navigator === 'undefined' ? true : navigator.onLine),
  );
  const [checking, setChecking] = useState(false);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const ok = await probeReachable();
      setOnline(ok);
      return ok;
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    function onOnline() {
      void refresh();
    }
    function onOffline() {
      setOnline(false);
    }
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    void refresh();
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({ online, checking, refresh }),
    [online, checking, refresh],
  );

  return (
    <NetworkStatusContext.Provider value={value}>{children}</NetworkStatusContext.Provider>
  );
}

export function useNetworkStatus(): NetworkStatusValue {
  const ctx = useContext(NetworkStatusContext);
  if (!ctx) {
    throw new Error('useNetworkStatus debe usarse dentro de NetworkStatusProvider');
  }
  return ctx;
}

/** Variante segura para árboles opcionales (tests / story). */
export function useNetworkStatusOptional(): NetworkStatusValue | null {
  return useContext(NetworkStatusContext);
}
