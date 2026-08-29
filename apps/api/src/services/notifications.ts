import { query } from '../db/pool.js';
import { getLowStockAlerts, getNoMovementAlerts } from './inventory.js';
import { sendWebPushToUser } from './webPush.js';

export type NotificationCategory = 'stock' | 'rotacion' | 'voucher' | 'operacion';
export type NotificationSeverity = 'high' | 'medium';

/** Operaciones de piso que avisan a administradores. */
export type OperationNotificationKind = 'merma' | 'voucher_devolucion' | 'voucher_cambio';

type OperationEventPayload = {
  title: string;
  detail: string;
  href: string;
  category: 'operacion';
  severity: NotificationSeverity;
};

const OP_ALERT_PREFIX = 'op:';
const MAX_EVENT_NOTIFICATIONS = 40;

function parseOperationEventPayload(raw: string | null): OperationEventPayload | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<OperationEventPayload>;
    if (!data.title || !data.detail || !data.href) return null;
    return {
      title: data.title,
      detail: data.detail,
      href: data.href,
      category: 'operacion',
      severity: data.severity === 'high' ? 'high' : 'medium',
    };
  } catch {
    return null;
  }
}

export function buildOperationNotificationContent(params: {
  kind: OperationNotificationKind;
  entityId: string;
  productName: string;
  productCode: string;
  actorName: string;
  branchName: string;
  quantity?: number;
  voucherNumber?: string | null;
}): { alertKey: string; payload: OperationEventPayload } {
  const product = `${params.productName} (${params.productCode})`;
  const who = params.actorName.trim() || 'Usuaria';
  const where = params.branchName.trim() || 'Sucursal';
  const ticket = params.voucherNumber?.trim();

  if (params.kind === 'merma') {
    const qty = params.quantity ?? 1;
    return {
      alertKey: `${OP_ALERT_PREFIX}merma:${params.entityId}`,
      payload: {
        title: 'Merma en piso',
        detail: `${who} · ${where} · ${product} · ${qty} ud.`,
        href: '/mermas',
        category: 'operacion',
        severity: 'medium',
      },
    };
  }

  if (params.kind === 'voucher_devolucion') {
    return {
      alertKey: `${OP_ALERT_PREFIX}voucher-devolucion:${params.entityId}`,
      payload: {
        title: 'Devolución en piso',
        detail: `${who} · ${where} · ${product}${ticket ? ` · ticket ${ticket}` : ''}`,
        href: '/mermas',
        category: 'operacion',
        severity: 'medium',
      },
    };
  }

  return {
    alertKey: `${OP_ALERT_PREFIX}voucher-cambio:${params.entityId}`,
    payload: {
      title: 'Cambio en piso',
      detail: `${who} · ${where} · ${product}${ticket ? ` · ticket ${ticket}` : ''}`,
      href: '/mermas',
      category: 'operacion',
      severity: 'medium',
    },
  };
}

/** Vendedora/encargada → notificar a cada owner activo de la org (no al actor owner). */
export async function notifyOrganizationOwnersOfOperation(params: {
  organizationId: string;
  branchId: string;
  actorUserId: string;
  actorRole: string;
  kind: OperationNotificationKind;
  entityId: string;
  productName: string;
  productCode: string;
  actorName: string;
  branchName: string;
  quantity?: number;
  voucherNumber?: string | null;
}): Promise<number> {
  if (params.actorRole === 'owner') return 0;
  if (params.actorRole !== 'seller' && params.actorRole !== 'branch_manager') return 0;

  const owners = await query<{ id: string }>(
    `SELECT DISTINCT u.id
     FROM users u
     JOIN user_branches ub ON ub.user_id = u.id
     WHERE u.organization_id = $1
       AND u.is_active = true
       AND ub.role = 'owner'
       AND u.id <> $2`,
    [params.organizationId, params.actorUserId],
  );
  if (!owners.rows.length) return 0;

  const { alertKey, payload } = buildOperationNotificationContent(params);
  const fingerprint = JSON.stringify(payload);

  for (const owner of owners.rows) {
    await query(
      `INSERT INTO notification_states (
         organization_id, branch_id, user_id, alert_key, condition_fingerprint
       ) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, branch_id, alert_key) DO UPDATE SET
         condition_fingerprint = EXCLUDED.condition_fingerprint,
         read_at = NULL,
         dismissed_at = NULL,
         updated_at = now()`,
      [params.organizationId, params.branchId, owner.id, alertKey, fingerprint],
    );

    void sendWebPushToUser(owner.id, {
      title: payload.title,
      body: payload.detail,
      url: payload.href,
      tag: alertKey,
    }).catch(() => {});
  }

  return owners.rows.length;
}

export async function fetchStoredEventNotifications(params: {
  userId: string;
  branchId: string;
  organizationId?: string;
  orgWide?: boolean;
}): Promise<NotificationStateRow[]> {
  if (params.orgWide && params.organizationId) {
    const result = await query<NotificationStateRow>(
      `SELECT *
       FROM notification_states
       WHERE user_id = $1
         AND organization_id = $2
         AND alert_key LIKE $3
         AND dismissed_at IS NULL
       ORDER BY created_at DESC
       LIMIT $4`,
      [params.userId, params.organizationId, `${OP_ALERT_PREFIX}%`, MAX_EVENT_NOTIFICATIONS],
    );
    return result.rows;
  }

  const result = await query<NotificationStateRow>(
    `SELECT *
     FROM notification_states
     WHERE user_id = $1
       AND branch_id = $2
       AND alert_key LIKE $3
       AND dismissed_at IS NULL
     ORDER BY created_at DESC
     LIMIT $4`,
    [params.userId, params.branchId, `${OP_ALERT_PREFIX}%`, MAX_EVENT_NOTIFICATIONS],
  );
  return result.rows;
}

function eventRowsToItems(rows: NotificationStateRow[]): NotificationItem[] {
  const items: NotificationItem[] = [];
  for (const row of rows) {
    const payload = parseOperationEventPayload(row.condition_fingerprint);
    if (!payload) continue;
    items.push({
      id: row.id,
      alert_key: row.alert_key,
      branch_id: row.branch_id,
      user_id: row.user_id,
      category: payload.category,
      severity: payload.severity,
      title: payload.title,
      detail: payload.detail,
      href: payload.href,
      read_at: row.read_at,
      dismissed_at: null,
      created_at: row.created_at,
    });
  }
  return items;
}

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
  eventStates: NotificationStateRow[] = [],
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

  const eventItems = eventRowsToItems(eventStates);
  const merged = [...eventItems, ...items].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const unread_count = merged.filter((i) => !i.read_at).length;
  return { items: merged, unread_count };
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
  if (isUuid) {
    const result = await query<NotificationStateRow>(
      `SELECT * FROM notification_states
       WHERE user_id = $1 AND id = $2
       LIMIT 1`,
      [params.userId, params.idOrKey],
    );
    return result.rows[0] ?? null;
  }

  const result = await query<NotificationStateRow>(
    `SELECT * FROM notification_states
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
  alertKeys?: string[];
  organizationId?: string;
  orgWide?: boolean;
}) {
  if (params.alertKeys?.length) {
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

  if (params.orgWide && params.organizationId) {
    const result = await query(
      `UPDATE notification_states
       SET read_at = COALESCE(read_at, now()), updated_at = now()
       WHERE user_id = $1 AND organization_id = $2
         AND dismissed_at IS NULL
         AND read_at IS NULL`,
      [params.userId, params.organizationId],
    );
    return result.rowCount ?? 0;
  }

  const result = await query(
    `UPDATE notification_states
     SET read_at = COALESCE(read_at, now()), updated_at = now()
     WHERE user_id = $1 AND branch_id = $2
       AND dismissed_at IS NULL
       AND read_at IS NULL`,
    [params.userId, params.branchId],
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
