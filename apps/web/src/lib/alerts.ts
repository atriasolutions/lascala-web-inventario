import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { useAuth } from './auth';

export type LowStockAlert = {
  product_id: string;
  name: string;
  internal_code: string;
  quantity: number;
};

export type NoMovementAlert = {
  id: string;
  name: string;
  internal_code: string;
  quantity: number;
  last_movement_at: string | null;
};

export type ExpiringVoucher = {
  id: string;
  voucher_number: string;
  product_name: string;
  expires_at: string;
};

export type AlertsResponse = {
  lowStock: LowStockAlert[];
  noMovement: NoMovementAlert[];
  vouchersExpiring: ExpiringVoucher[];
  generatedAt: string;
};

export type AlertItem = {
  id: string;
  /** Clave estable para persistencia (hoy = id; mañana = alert_key del API). */
  alertKey: string;
  severity: 'high' | 'medium';
  category: 'stock' | 'rotacion' | 'voucher' | 'operacion';
  title: string;
  detail: string;
  to: string;
  read: boolean;
};

/**
 * Contrato API (backend):
 * GET  /api/notifications → { items: [...], unread_count? }
 * POST /api/notifications/:id/read | /read-all | /:id/dismiss
 *
 * Adapter: prueba API; si 404 → /api/dashboard/alerts + localStorage.
 */
const POLL_MS = 60_000;
const LS_READ = 'lscala.notif.readKeys';
const LS_DISMISSED = 'lscala.notif.dismissedKeys';

type ApiNotification = {
  id: string;
  alert_key?: string;
  category?: string;
  severity?: string;
  title: string;
  detail?: string;
  href?: string;
  read_at?: string | null;
  dismissed_at?: string | null;
};

type NotificationsListResponse = {
  items: ApiNotification[];
  unread_count?: number;
};

type NotifSource = 'api' | 'legacy' | null;

type MappedApiItem = AlertItem & { dismissed: boolean };

function readSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? new Set(arr.filter((x) => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

function writeSet(key: string, set: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    /* ignore quota */
  }
}

function mapCategory(raw?: string): AlertItem['category'] {
  if (raw === 'rotacion' || raw === 'voucher' || raw === 'stock' || raw === 'operacion') return raw;
  if (raw === 'low_stock' || raw === 'stock_low') return 'stock';
  if (raw === 'no_movement' || raw === 'rotation') return 'rotacion';
  return 'stock';
}

function mapSeverity(raw?: string): AlertItem['severity'] {
  return raw === 'high' || raw === 'critical' ? 'high' : 'medium';
}

function isVoucherExpiringAlert(n: { category?: string; alert_key?: string; title?: string }) {
  const key = n.alert_key || '';
  return (
    n.category === 'voucher' ||
    key.startsWith('voucher-expiring:') ||
    key.startsWith('voucher:') ||
    n.title === 'Voucher por vencer'
  );
}

function fromApiItem(n: ApiNotification): MappedApiItem {
  const category = mapCategory(n.category);
  let to = n.href || '/inventario';
  if (category === 'stock' && (to === '/inventario' || to.startsWith('/inventario?'))) {
    to = '/inventario?onlyLow=1';
  }
  return {
    id: n.id,
    alertKey: n.alert_key || n.id,
    severity: mapSeverity(n.severity),
    category,
    title: n.title,
    detail: n.detail || '',
    to,
    read: Boolean(n.read_at),
    dismissed: Boolean(n.dismissed_at),
  };
}

function fromLegacyAlerts(data: AlertsResponse): Omit<AlertItem, 'read'>[] {
  return [
    ...data.lowStock.map((a) => ({
      id: `low-${a.product_id}`,
      alertKey: `low:${a.product_id}`,
      severity: a.quantity <= 0 ? ('high' as const) : ('medium' as const),
      category: 'stock' as const,
      title: a.quantity <= 0 ? 'Quiebre de stock' : 'Stock bajo',
      detail: `${a.name} (${a.internal_code}) · quedan ${a.quantity}`,
      to: '/inventario?onlyLow=1',
    })),
    ...data.noMovement.map((a) => ({
      id: `nomove-${a.id}`,
      alertKey: `nomove:${a.id}`,
      severity: 'medium' as const,
      category: 'rotacion' as const,
      title: 'Sin movimiento',
      detail: `${a.name} (${a.internal_code}) · ${
        a.last_movement_at
          ? `desde ${new Date(a.last_movement_at).toLocaleDateString('es-CL')}`
          : 'sin ventas registradas'
      }`,
      to: '/movimientos',
    })),
  ];
}

export function useAlerts() {
  const { branchId } = useAuth();
  const [source, setSource] = useState<NotifSource>(null);
  const [legacyData, setLegacyData] = useState<AlertsResponse | null>(null);
  const [apiItems, setApiItems] = useState<MappedApiItem[]>([]);
  const [apiUnread, setApiUnread] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [readKeys, setReadKeys] = useState<Set<string>>(() => readSet(LS_READ));
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(() => readSet(LS_DISMISSED));

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval>;
    let mode: NotifSource = null;
    setSource(null);
    setApiItems([]);
    setApiUnread(null);
    setLegacyData(null);
    setError('');

    async function load() {
      if (mode !== 'legacy') {
        try {
          const res = await api<NotificationsListResponse>('/api/notifications');
          if (cancelled) return;
          mode = 'api';
          setSource('api');
          const mapped = (res.items || []).filter((n) => !isVoucherExpiringAlert(n)).map(fromApiItem);
          setApiItems(mapped);
          setApiUnread(
            typeof res.unread_count === 'number'
              ? res.unread_count
              : mapped.filter((i) => !i.dismissed && !i.read).length,
          );
          setLegacyData(null);
          setError('');
          return;
        } catch (e) {
          if (cancelled) return;
          if (mode === 'api') {
            setError(e instanceof Error ? e.message : 'Error al cargar notificaciones');
            return;
          }
        }
      }

      try {
        const res = await api<AlertsResponse>('/api/dashboard/alerts');
        if (cancelled) return;
        mode = 'legacy';
        setSource('legacy');
        setLegacyData(res);
        setApiItems([]);
        setApiUnread(null);
        setError('');
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error al cargar alertas');
      }
    }

    void load();
    timer = setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [branchId]);

  const items: AlertItem[] = useMemo(() => {
    if (source === 'api') {
      return apiItems.filter((i) => !i.dismissed).map(({ dismissed: _d, ...rest }) => rest);
    }
    if (!legacyData) return [];
    return fromLegacyAlerts(legacyData)
      .filter((i) => !dismissedKeys.has(i.alertKey))
      .map((i) => ({ ...i, read: readKeys.has(i.alertKey) }));
  }, [source, apiItems, legacyData, dismissedKeys, readKeys]);

  const unreadCount = useMemo(() => {
    if (source === 'api' && apiUnread !== null) return apiUnread;
    return items.filter((i) => !i.read).length;
  }, [source, apiUnread, items]);

  const markRead = useCallback(
    async (alertKey: string) => {
      if (source === 'api') {
        const row = apiItems.find((i) => i.alertKey === alertKey || i.id === alertKey);
        const id = row?.id || alertKey;
        const wasUnread = row ? !row.read : true;
        try {
          await api(`/api/notifications/${encodeURIComponent(id)}/read`, {
            method: 'POST',
            body: {},
          });
        } catch {
          /* soft */
        }
        setApiItems((prev) =>
          prev.map((i) => (i.id === id || i.alertKey === alertKey ? { ...i, read: true } : i)),
        );
        if (wasUnread) {
          setApiUnread((n) => (n === null ? null : Math.max(0, n - 1)));
        }
        return;
      }
      setReadKeys((prev) => {
        if (prev.has(alertKey)) return prev;
        const next = new Set(prev);
        next.add(alertKey);
        writeSet(LS_READ, next);
        return next;
      });
    },
    [source, apiItems],
  );

  const markAllRead = useCallback(async () => {
    if (source === 'api') {
      try {
        await api('/api/notifications/read-all', { method: 'POST', body: {} });
      } catch {
        /* soft */
      }
      setApiItems((prev) => prev.map((i) => ({ ...i, read: true })));
      setApiUnread(0);
      return;
    }
    setReadKeys((prev) => {
      const next = new Set(prev);
      for (const i of items) next.add(i.alertKey);
      writeSet(LS_READ, next);
      return next;
    });
  }, [source, items]);

  const dismiss = useCallback(
    async (alertKey: string) => {
      if (source === 'api') {
        const row = apiItems.find((i) => i.alertKey === alertKey || i.id === alertKey);
        const id = row?.id || alertKey;
        const wasUnread = row ? !row.read && !row.dismissed : true;
        try {
          await api(`/api/notifications/${encodeURIComponent(id)}/dismiss`, {
            method: 'POST',
            body: {},
          });
        } catch {
          /* soft */
        }
        setApiItems((prev) =>
          prev.map((i) =>
            i.id === id || i.alertKey === alertKey
              ? { ...i, dismissed: true, read: true }
              : i,
          ),
        );
        if (wasUnread) {
          setApiUnread((n) => (n === null ? null : Math.max(0, n - 1)));
        }
        return;
      }
      setDismissedKeys((prev) => {
        const next = new Set(prev);
        next.add(alertKey);
        writeSet(LS_DISMISSED, next);
        return next;
      });
      setReadKeys((prev) => {
        const next = new Set(prev);
        next.add(alertKey);
        writeSet(LS_READ, next);
        return next;
      });
    },
    [source, apiItems],
  );

  return {
    items,
    unreadCount,
    loading: source === null && !error,
    error,
    generatedAt: legacyData?.generatedAt,
    markRead,
    markAllRead,
    dismiss,
    source: source ?? 'legacy',
  };
}
