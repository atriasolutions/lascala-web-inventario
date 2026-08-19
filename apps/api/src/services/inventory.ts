import type { PoolClient } from 'pg';
import { pool, query } from '../db/pool.js';
import { HttpError } from '../utils/errors.js';

type StockParams = {
  organizationId: string;
  branchId: string;
  productId: string;
  delta: number;
  movementType: string;
  referenceType?: string;
  referenceId?: string;
  notes?: string;
  userId?: string;
  /** Solo sync offline de ventas: permite quantity_after < 0. Online = false/omitido. */
  allowNegative?: boolean;
};

export async function applyStockDeltaWithClient(client: PoolClient, params: StockParams) {
  await client.query(
    `INSERT INTO inventory_balances (product_id, branch_id, quantity, low_stock_threshold)
     VALUES (
       $1, $2, 0,
       COALESCE((SELECT low_stock_threshold FROM products WHERE id = $1), 1)
     )
     ON CONFLICT (product_id, branch_id) DO UPDATE SET updated_at = now()`,
    [params.productId, params.branchId],
  );
  const bal = await client.query<{ quantity: number }>(
    `SELECT quantity FROM inventory_balances WHERE product_id = $1 AND branch_id = $2 FOR UPDATE`,
    [params.productId, params.branchId],
  );
  const current = bal.rows[0]?.quantity ?? 0;
  const next = current + params.delta;
  if (next < 0 && !params.allowNegative) {
    throw new HttpError(400, 'Stock insuficiente');
  }

  await client.query(
    `UPDATE inventory_balances SET quantity = $1, updated_at = now()
     WHERE product_id = $2 AND branch_id = $3`,
    [next, params.productId, params.branchId],
  );

  await client.query(
    `INSERT INTO inventory_movements
      (organization_id, branch_id, product_id, movement_type, quantity_delta, quantity_after, reference_type, reference_id, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      params.organizationId,
      params.branchId,
      params.productId,
      params.movementType,
      params.delta,
      next,
      params.referenceType ?? null,
      params.referenceId ?? null,
      params.notes ?? null,
      params.userId ?? null,
    ],
  );
  return next;
}

export async function applyStockDelta(params: StockParams) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const next = await applyStockDeltaWithClient(client, params);
    await client.query('COMMIT');
    return next;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export function normalizeBarcode(barcode: string | null | undefined): string | null {
  if (barcode == null) return null;
  const trimmed = barcode.trim().replace(/['`´]/g, '').toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Variantes para lookup pistola: BC000003 ↔ BC-000003; LS-000009 ↔ LS000009.
 */
export function expandProductCodeVariants(code: string | null | undefined): string[] {
  const n = normalizeBarcode(code);
  if (!n) return [];
  const keys = new Set<string>([n]);

  const bc = n.match(/^BC-?(\d+)$/);
  if (bc) {
    const digits = bc[1];
    keys.add(`BC${digits}`);
    keys.add(`BC-${digits}`);
  }

  const ls = n.match(/^LS-?(\d+)$/);
  if (ls) {
    const digits = ls[1];
    keys.add(`LS-${digits}`);
    keys.add(`LS${digits}`);
  }

  return [...keys];
}

/** Ensures barcode is unique within the organization. Empty/null is allowed. */
export async function assertBarcodeAvailable(
  organizationId: string,
  barcode: string | null | undefined,
  opts?: { excludeProductId?: string; client?: PoolClient },
) {
  const normalized = normalizeBarcode(barcode);
  if (!normalized) return;
  const params: unknown[] = [organizationId, normalized];
  let sql = `SELECT id FROM products WHERE organization_id = $1 AND (barcode = $2 OR internal_code = $2)`;
  if (opts?.excludeProductId) {
    params.push(opts.excludeProductId);
    sql += ` AND id <> $${params.length}`;
  }
  sql += ' LIMIT 1';
  const res = opts?.client
    ? await opts.client.query<{ id: string }>(sql, params)
    : await query<{ id: string }>(sql, params);
  if (res.rows[0]) throw new HttpError(409, 'Código de barras ya existe');
}

export async function isBarcodeAvailable(
  organizationId: string,
  barcode: string,
  opts?: { excludeProductId?: string },
): Promise<boolean> {
  const normalized = normalizeBarcode(barcode);
  if (!normalized) return false;
  try {
    await assertBarcodeAvailable(organizationId, normalized, opts);
    return true;
  } catch (err) {
    if (err instanceof HttpError && err.status === 409) return false;
    throw err;
  }
}

export async function nextInternalCodeWithClient(client: PoolClient, organizationId: string) {
  const res = await client.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM products WHERE organization_id = $1',
    [organizationId],
  );
  const n = Number(res.rows[0]?.count || 0) + 1;
  return `LS-${String(n).padStart(6, '0')}`;
}

export async function nextInternalCode(organizationId: string) {
  const res = await query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM products WHERE organization_id = $1',
    [organizationId],
  );
  const n = Number(res.rows[0]?.count || 0) + 1;
  return `LS-${String(n).padStart(6, '0')}`;
}

/** Formato retail: BC000003 (sin guión; pistolas a menudo leen "-" como "'"). */
export function formatOrgBarcode(n: number) {
  return `BC${String(Math.max(1, Math.floor(n))).padStart(6, '0')}`;
}

/** Acepta BC000003 y legado BC-000003. */
export function parseOrgBarcodeSeries(code: string | null | undefined): number | null {
  const normalized = normalizeBarcode(code);
  if (!normalized) return null;
  const m = normalized.match(/^BC-?(\d+)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function seedBarcodeCounterMax(client: PoolClient, organizationId: string): Promise<number> {
  const res = await client.query<{ max_n: string | null }>(
    `SELECT MAX(
       CASE
         WHEN barcode ~ '^BC[0-9]+$' THEN SUBSTRING(barcode FROM 3)::int
         WHEN barcode ~ '^BC-[0-9]+$' THEN SUBSTRING(barcode FROM 4)::int
         ELSE NULL
       END
     )::text AS max_n
     FROM products WHERE organization_id = $1`,
    [organizationId],
  );
  return Number(res.rows[0]?.max_n || 0);
}

async function ensureBarcodeCounterWithClient(client: PoolClient, organizationId: string) {
  const maxN = await seedBarcodeCounterMax(client, organizationId);
  const nextFromProducts = maxN + 1;
  await client.query(
    `INSERT INTO barcode_counters (organization_id, next_value)
     VALUES ($1, $2)
     ON CONFLICT (organization_id) DO UPDATE
       SET next_value = GREATEST(barcode_counters.next_value, EXCLUDED.next_value),
           updated_at = now()`,
    [organizationId, Math.max(1, nextFromProducts)],
  );
}

/**
 * Tras asignar un código de la serie BC######, avanza el correlativo
 * para no reutilizar el mismo sugerido.
 */
export async function noteBarcodeUsedWithClient(
  client: PoolClient,
  organizationId: string,
  barcode: string | null | undefined,
) {
  const n = parseOrgBarcodeSeries(barcode);
  if (n == null) return;
  await ensureBarcodeCounterWithClient(client, organizationId);
  await client.query(
    `UPDATE barcode_counters
     SET next_value = GREATEST(next_value, $2), updated_at = now()
     WHERE organization_id = $1`,
    [organizationId, n + 1],
  );
}

export async function noteBarcodeUsed(organizationId: string, barcode: string | null | undefined) {
  const client = await pool.connect();
  try {
    await noteBarcodeUsedWithClient(client, organizationId, barcode);
  } finally {
    client.release();
  }
}

/** Peek del siguiente código de etiqueta = código interno LS-######. */
export async function nextBarcodeWithClient(client: PoolClient, organizationId: string) {
  return nextInternalCodeWithClient(client, organizationId);
}

export async function nextBarcode(organizationId: string) {
  return nextInternalCode(organizationId);
}

/** Asigna el mismo código interno (LS-…) para etiqueta y pistola. */
export async function allocateNextBarcodeWithClient(client: PoolClient, organizationId: string) {
  return nextInternalCodeWithClient(client, organizationId);
}

export async function nextReceiptNumber(organizationId: string) {
  const res = await query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM sales WHERE organization_id = $1',
    [organizationId],
  );
  const n = Number(res.rows[0]?.count || 0) + 1;
  return `V-${String(n).padStart(6, '0')}`;
}

export async function nextVoucherNumber(organizationId: string) {
  const res = await query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM change_vouchers WHERE organization_id = $1',
    [organizationId],
  );
  const n = Number(res.rows[0]?.count || 0) + 1;
  return `VC-${String(n).padStart(6, '0')}`;
}

export async function getSettingNumber(organizationId: string, key: string, fallback: number) {
  const res = await query<{ value: { value?: number } }>(
    `SELECT value FROM system_settings WHERE organization_id = $1 AND branch_id IS NULL AND key = $2`,
    [organizationId, key],
  );
  return Number(res.rows[0]?.value?.value ?? fallback);
}

export async function getSettingText(organizationId: string, key: string, fallback: string) {
  const res = await query<{ value: { text?: string } }>(
    `SELECT value FROM system_settings WHERE organization_id = $1 AND branch_id IS NULL AND key = $2`,
    [organizationId, key],
  );
  return String(res.rows[0]?.value?.text ?? fallback);
}

export async function getLowStockAlerts(organizationId: string, branchId: string) {
  const lowDefault = await getSettingNumber(organizationId, 'low_stock_threshold', 1);
  const result = await query(
    `SELECT ib.*, p.name, p.internal_code,
            COALESCE(ib.low_stock_threshold, p.low_stock_threshold, $2) AS effective_low_stock_threshold
     FROM inventory_balances ib
     JOIN products p ON p.id = ib.product_id
     WHERE ib.branch_id = $1
       AND p.status NOT IN ('archived', 'merma', 'returned_to_supplier')
       AND COALESCE(p.tracks_stock, true) = true
       AND ib.quantity <= COALESCE(ib.low_stock_threshold, p.low_stock_threshold, $2)
     ORDER BY ib.quantity ASC`,
    [branchId, lowDefault],
  );
  return result.rows;
}

export async function getNoMovementAlerts(organizationId: string, branchId: string) {
  const noMovementDays = await getSettingNumber(organizationId, 'no_movement_days', 30);
  const result = await query(
    `SELECT p.id, p.name, p.internal_code, ib.quantity,
            COALESCE(p.no_movement_alert_days, $2) AS no_movement_alert_days,
            MAX(m.created_at) AS last_movement_at
     FROM inventory_balances ib
     JOIN products p ON p.id = ib.product_id
     LEFT JOIN inventory_movements m ON m.product_id = p.id AND m.branch_id = ib.branch_id
     WHERE ib.branch_id = $1
       AND ib.quantity > 0
       AND p.status NOT IN ('archived', 'merma', 'returned_to_supplier')
       AND COALESCE(p.tracks_stock, true) = true
     GROUP BY p.id, p.name, p.internal_code, ib.quantity, p.no_movement_alert_days
     HAVING MAX(m.created_at) IS NULL
         OR MAX(m.created_at) < now() - (COALESCE(p.no_movement_alert_days, $2)::text || ' days')::interval
     ORDER BY last_movement_at NULLS FIRST`,
    [branchId, noMovementDays],
  );
  return result.rows;
}

export async function getExpiringVouchers(organizationId: string, branchId: string, withinDays = 3) {
  const result = await query(
    `SELECT v.*, p.name AS product_name
     FROM change_vouchers v
     JOIN products p ON p.id = v.product_id
     WHERE v.branch_id = $1 AND v.status = 'open'
       AND v.expires_at <= (CURRENT_DATE + ($2 || ' days')::interval)
     ORDER BY v.expires_at ASC`,
    [branchId, String(withinDays)],
  );
  return result.rows;
}
