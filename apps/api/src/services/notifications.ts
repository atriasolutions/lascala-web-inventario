import { query } from '../db/pool.js';
import { getLowStockAlerts, getNoMovementAlerts } from './inventory.js';

export type NotificationCategory = 'stock' | 'rotacion' | 'voucher';
export type NotificationSeverity = 'high' | 'medium';

export type LiveAlert = {
  alertKey: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  detail: string;
  href: string;
  conditionFingerprint: string;
};

export type NotificationStateRow = {
  id: string;
  organization_id: string;
  branch_id: string;
  user_id: string;
  alert_key: string;
  condition_fingerprint: string | null;
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationItem = {
  id: string;
  alert_key: string;
  branch_id: string;
  user_id: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  detail: string;
  href: string;
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
};

/** Dismiss: ocultar hasta cambio de condición (fingerprint) o TTL 24h. */
export const DISMISS_TTL_HOURS = 24;

function formatDateCl(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('es-CL');
}

/** Fuente viva para campana: stock bajo + sin movimiento. No incluye voucher por vencer. */
export async function buildLiveAlerts(
  organizationId: string,
  branchId: string,
): Promise<LiveAlert[]> {
  const [lowStock, noMovement] = await Promise.all([
    getLowStockAlerts(organizationId, branchId),
    getNoMovementAlerts(organizationId, branchId),
  ]);

  const items: LiveAlert[] = [];

  for (const a of lowStock) {
    const qty = Number(a.quantity ?? 0);
    const productId = String(a.product_id);
    items.push({
      alertKey: `low-stock:${productId}`,
      category: 'stock',
      severity: qty <= 0 ? 'high' : 'medium',
      title: qty <= 0 ? 'Quiebre de stock' : 'Stock bajo',
      detail: `${a.name} (${a.internal_code}) · quedan ${qty}`,
      href: '/inventario?onlyLow=1',
      conditionFingerprint: `qty:${qty}`,
    });
  }

  for (const a of noMovement) {
    const productId = String(a.id);
    const qty = Number(a.quantity ?? 0);
    const last = a.last_movement_at ? String(a.last_movement_at) : 'never';
    items.push({
      alertKey: `no-movement:${productId}`,
      category: 'rotacion',
      severity: 'medium',
      title: 'Sin movimiento',
      detail: `${a.name} (${a.internal_code}) · ${
        a.last_movement_at
          ? `desde ${formatDateCl(a.last_movement_at)}`
          : 'sin ventas registradas'
      }`,
      href: '/movimientos',
      conditionFingerprint: `last:${last}|qty:${qty}`,
    });
  }

  return items;
}

/**
 * Upsert estados para alertas vivas y aplica regla dismiss (fingerprint | TTL 24h).
 * Devuelve filas tras el merge (incluye dismisseds aún activos).
 */
export async function syncNotificationStates(params: {
  organizationId: string;
  branchId: string;
  userId: string;
  live: LiveAlert[];
}): Promise<NotificationStateRow[]> {
  const { organizationId, branchId, userId, live } = params;
  if (live.length === 0) {
    return [];
  }

  const keys = live.map((a) => a.alertKey);
  const fingerprints = live.map((a) => a.conditionFingerprint);

  const result = await query<NotificationStateRow>(
    `INSERT INTO notification_states AS ns (
       organization_id, branch_id, user_id, alert_key, condition_fingerprint
     )
     SELECT $1, $2, $3, x.alert_key, x.fingerprint
     FROM unnest($4::text[], $5::text[]) AS x(alert_key, fingerprint)
     ON CONFLICT (user_id, branch_id, alert_key) DO UPDATE SET
       condition_fingerprint = EXCLUDED.condition_fingerprint,
       updated_at = now(),
       dismissed_at = CASE
         WHEN ns.dismissed_at IS NULL THEN NULL
         WHEN ns.condition_fingerprint IS DISTINCT FROM EXCLUDED.condition_fingerprint THEN NULL
         WHEN ns.dismissed_at <= now() - ($6 || ' hours')::interval THEN NULL
         ELSE ns.dismissed_at
       END,
       read_at = CASE
         WHEN ns.dismissed_at IS NOT NULL AND (
           ns.condition_fingerprint IS DISTINCT FROM EXCLUDED.condition_fingerprint
           OR ns.dismissed_at <= now() - ($6 || ' hours')::interval
         ) THEN NULL
         ELSE ns.read_at
       END
     RETURNING *`,
    [organizationId, branchId, userId, keys, fingerprints, String(DISMISS_TTL_HOURS)],
  );

  return result.rows;
}

export function mergeNotifications(
  branchId: string,
  live: LiveAlert[],
  states: NotificationStateRow[],
): { items: NotificationItem[]; unread_count: number } {
  const byKey = new Map(states.map((s) => [s.alert_key, s]));
  const items: NotificationItem[] = [];

  for (const alert of live) {
    if (alert.category === 'voucher' || alert.alertKey.startsWith('voucher-expiring:')) continue;
    const state = byKey.get(alert.alertKey);
    if (!state) continue;
    if (state.dismissed_at) continue;

    items.push({
      id: state.id,
      alert_key: alert.alertKey,
      branch_id: branchId,
      user_id: state.user_id,
      category: alert.category,
      severity: alert.severity,
      title: alert.title,
      detail: alert.detail,
      href: alert.href,
      read_at: state.read_at,
      dismissed_at: null,
      created_at: state.created_at,
    });
  }

  const unread_count = items.filter((i) => !i.read_at).length;
  return { items, unread_count };
}

export async function findNotificationState(params: {
  userId: string;
  branchId: string;
  idOrKey: string;
}): Promise<NotificationStateRow | null> {
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      params.idOrKey,
    );
  const result = await query<NotificationStateRow>(
    isUuid
      ? `SELECT * FROM notification_states
         WHERE user_id = $1 AND branch_id = $2 AND id = $3
         LIMIT 1`
      : `SELECT * FROM notification_states
         WHERE user_id = $1 AND branch_id = $2 AND alert_key = $3
         LIMIT 1`,
    [params.userId, params.branchId, params.idOrKey],
  );
  return result.rows[0] ?? null;
}

export async function markNotificationRead(stateId: string) {
  const result = await query<NotificationStateRow>(
    `UPDATE notification_states
     SET read_at = COALESCE(read_at, now()), updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [stateId],
  );
  return result.rows[0] ?? null;
}

export async function markAllNotificationsRead(params: {
  userId: string;
  branchId: string;
  alertKeys: string[];
}) {
  if (params.alertKeys.length === 0) return 0;
  const result = await query(
    `UPDATE notification_states
     SET read_at = COALESCE(read_at, now()), updated_at = now()
     WHERE user_id = $1 AND branch_id = $2
       AND alert_key = ANY($3::text[])
       AND dismissed_at IS NULL
       AND read_at IS NULL`,
    [params.userId, params.branchId, params.alertKeys],
  );
  return result.rowCount ?? 0;
}

export async function dismissNotification(stateId: string) {
  const result = await query<NotificationStateRow>(
    `UPDATE notification_states
     SET dismissed_at = now(),
         read_at = COALESCE(read_at, now()),
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [stateId],
  );
  return result.rows[0] ?? null;
}
