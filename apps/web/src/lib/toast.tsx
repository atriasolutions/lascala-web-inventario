import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type ToastKind = 'success' | 'error' | 'warn';

type ToastItem = {
  id: number;
  message: string;
  kind: ToastKind;
};

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  warn: (message: string) => void;
};

type ToastContextValue = {
  push: (message: string, kind?: ToastKind) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_MS: Record<ToastKind, number> = {
  success: 2500,
  warn: 3200,
  error: 4000,
};

let pushRef: ((message: string, kind?: ToastKind) => void) | null = null;

/** Helper global (requiere ToastProvider montado). */
export const toast: ToastApi = {
  success: (message) => pushRef?.(message, 'success'),
  error: (message) => pushRef?.(message, 'error'),
  warn: (message) => pushRef?.(message, 'warn'),
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timers = useRef<Map<number, number>>(new Map());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) {
      window.clearTimeout(t);
      timers.current.delete(id);
    }
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (message: string, kind: ToastKind = 'success') => {
      const text = message.trim();
      if (!text) return;
      const id = ++idRef.current;
      setItems((prev) => [...prev.slice(-3), { id, message: text, kind }]);
      const timer = window.setTimeout(() => dismiss(id), DEFAULT_MS[kind]);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  useEffect(() => {
    pushRef = push;
    return () => {
      pushRef = null;
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current.clear();
    };
  }, [push]);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="app-toast-stack no-print" aria-live="polite" aria-relevant="additions">
        {items.map((item) => (
          <div
            key={item.id}
            className={`app-toast ing-toast ${item.kind}`}
            role={item.kind === 'error' ? 'alert' : 'status'}
          >
            <span>{item.message}</span>
            <button
              type="button"
              className="app-toast-dismiss"
              aria-label="Cerrar aviso"
              onClick={() => dismiss(item.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast debe usarse dentro de ToastProvider');
  }
  return useMemo(
    () => ({
      success: (message: string) => ctx.push(message, 'success'),
      error: (message: string) => ctx.push(message, 'error'),
      warn: (message: string) => ctx.push(message, 'warn'),
    }),
    [ctx],
  );
}
