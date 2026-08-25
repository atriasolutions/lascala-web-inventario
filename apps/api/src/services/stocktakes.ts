import type { PoolClient } from 'pg';
import { pool, query } from '../db/pool.js';
import { HttpError } from '../utils/errors.js';
import { applyStockDeltaWithClient, expandProductCodeVariants } from './inventory.js';

export type StocktakeStatus = 'in_progress' | 'pending_review' | 'completed' | 'cancelled';
export type StocktakeDecision = 'keep_system' | 'use_physical' | 'adjust';

export function formatTakeLabel(n: number) {
  return `INV${String(n).padStart(6, '0')}`;
}

export function classifyStocktakeDiff(
  qtyCounted: number,
  qtySystem: number,
): 'ok' | 'faltante' | 'sobrante' {
  if (qtyCounted === qtySystem) return 'ok';
  if (qtyCounted < qtySystem) return 'faltante';
  return 'sobrante';
}

/** Variación económica vs stock al cerrar, solo si se aplicó físico o ajuste. */
export function stocktakeAppliedVariance(params: {
  decision: string | null;
  qtyCounted: number;
  qtySystem: number;
  qtyOverride: number | null;
}): { kind: 'ok' | 'faltante' | 'sobrante'; units: number; qtyFinal: number } {
  const counted = Number(params.qtyCounted || 0);
  const system = Number(params.qtySystem || 0);
  let qtyFinal = system;
  if (params.decision === 'use_physical') qtyFinal = counted;
  else if (params.decision === 'adjust') {
    qtyFinal = params.qtyOverride == null ? counted : Number(params.qtyOverride);
  } else {
    return { kind: 'ok', units: 0, qtyFinal: system };
  }
  const delta = qtyFinal - system;
  if (delta > 0) return { kind: 'sobrante', units: delta, qtyFinal };
  if (delta < 0) return { kind: 'faltante', units: -delta, qtyFinal };
  return { kind: 'ok', units: 0, qtyFinal };
}

const LINE_SELECT = `
  SELECT l.id, l.product_id, l.qty_counted, l.qty_system_at_close, l.qty_override, l.decision,
         l.last_scanned_at::text, l.updated_at::text,
         p.name AS product_name, p.internal_code, p.barcode, p.size_label, p.color,
         COALESCE(p.tracks_stock, true) AS tracks_stock,
         (SELECT url FROM product_photos ph WHERE ph.product_id = p.id ORDER BY sort_order LIMIT 1) AS photo_url,
         COALESCE(ib.quantity, 0)::int AS qty_system_live
  FROM stocktake_lines l
  JOIN products p ON p.id = l.product_id
  LEFT JOIN inventory_balances ib ON ib.product_id = p.id AND ib.branch_id = $2
  WHERE l.stocktake_id = $1
  ORDER BY l.updated_at DESC, p.name`;

export async function loadStocktake(id: string, organizationId: string, branchId: string) {
  const session = await query(
    `SELECT s.*,
            u.full_name AS started_by_name,
            c.full_name AS completed_by_name,
            a.full_name AS applied_by_name
     FROM stocktakes s
     LEFT JOIN users u ON u.id = s.started_by
     LEFT JOIN users c ON c.id = s.completed_by
     LEFT JOIN users a ON a.id = s.applied_by
     WHERE s.id = $1 AND s.organization_id = $2 AND s.branch_id = $3`,
    [id, organizationId, branchId],
  );
  const row = session.rows[0];
  if (!row) throw new HttpError(404, 'Toma de inventario no encontrada');
  const lines = await query(LINE_SELECT, [id, branchId]);
  return { stocktake: row, lines: lines.rows };
}

export async function findOpenStocktake(organizationId: string, branchId: string) {
  const res = await query(
    `SELECT s.*, u.full_name AS started_by_name
     FROM stocktakes s
     LEFT JOIN users u ON u.id = s.started_by
     WHERE s.organization_id = $1 AND s.branch_id = $2 AND s.status = 'in_progress'
     LIMIT 1`,
    [organizationId, branchId],
  );
  return res.rows[0] || null;
}

export async function createOrResumeStocktake(params: {
  organizationId: string;
  branchId: string;
  userId: string;
  replaceOpen?: boolean;
}) {
  const open = await findOpenStocktake(params.organizationId, params.branchId);
  if (open && !params.replaceOpen) {
    const full = await loadStocktake(open.id, params.organizationId, params.branchId);
    return { ...full, resumed: true as const, replacedId: null as string | null };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let replacedId: string | null = null;
    if (open && params.replaceOpen) {
      await client.query(
        `UPDATE stocktakes
         SET status = 'cancelled', completed_at = now(), completed_by = $2
         WHERE id = $1 AND status = 'in_progress'`,
        [open.id, params.userId],
      );
      replacedId = open.id;
    }

    const nRes = await client.query<{ n: string }>(
      `SELECT COALESCE(MAX(take_number), 0)::text AS n
       FROM stocktakes WHERE organization_id = $1 AND branch_id = $2`,
      [params.organizationId, params.branchId],
    );
    const takeNumber = Number(nRes.rows[0]?.n || 0) + 1;
    const takeLabel = formatTakeLabel(takeNumber);
    const ins = await client.query(
      `INSERT INTO stocktakes
         (organization_id, branch_id, take_number, take_label, started_by)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [params.organizationId, params.branchId, takeNumber, takeLabel, params.userId],
    );
    await client.query('COMMIT');
    const full = await loadStocktake(ins.rows[0].id, params.organizationId, params.branchId);
    return { ...full, resumed: false as const, replacedId };
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    if (!params.replaceOpen) {
      const again = await findOpenStocktake(params.organizationId, params.branchId);
      if (again) {
        const full = await loadStocktake(again.id, params.organizationId, params.branchId);
        return { ...full, resumed: true as const, replacedId: null as string | null };
      }
    }
    throw e;
  } finally {
    client.release();
  }
}

export async function scanStocktakeLine(params: {
  organizationId: string;
  branchId: string;
  stocktakeId: string;
  code: string;
}) {
  const variants = expandProductCodeVariants(params.code);
  if (!variants.length) throw new HttpError(400, 'Indica el código de la prenda');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const st = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM stocktakes
       WHERE id = $1 AND organization_id = $2 AND branch_id = $3
       FOR UPDATE`,
      [params.stocktakeId, params.organizationId, params.branchId],
    );
    if (!st.rows[0]) throw new HttpError(404, 'Toma de inventario no encontrada');
    if (st.rows[0].status !== 'in_progress') {
      throw new HttpError(400, 'Esta toma ya no está en conteo. No se pueden sumar prendas.');
    }

    const prod = await client.query<{
      id: string;
      name: string;
      tracks_stock: boolean;
    }>(
      `SELECT p.id, p.name, COALESCE(p.tracks_stock, true) AS tracks_stock
       FROM products p
       WHERE p.organization_id = $1
         AND p.status NOT IN ('archived', 'returned_to_supplier')
         AND (
           p.internal_code = ANY($2::text[])
           OR UPPER(COALESCE(p.barcode, '')) = ANY($2::text[])
         )
       LIMIT 1`,
      [params.organizationId, variants],
    );
    const product = prod.rows[0];
    if (!product) throw new HttpError(404, 'Producto no encontrado');
    if (!product.tracks_stock) {
      throw new HttpError(400, 'Esta prenda no controla stock de vitrina');
    }

    const line = await client.query(
      `INSERT INTO stocktake_lines (stocktake_id, product_id, qty_counted, last_scanned_at, updated_at)
       VALUES ($1, $2, 1, now(), now())
       ON CONFLICT (stocktake_id, product_id) DO UPDATE SET
         qty_counted = stocktake_lines.qty_counted + 1,
         last_scanned_at = now(),
         updated_at = now()
       RETURNING *`,
      [params.stocktakeId, product.id],
    );
    await client.query('COMMIT');
    const full = await loadStocktake(params.stocktakeId, params.organizationId, params.branchId);
    return { ...full, scanned: { productId: product.id, name: product.name, qty: line.rows[0].qty_counted } };
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

async function lockSession(client: PoolClient, stocktakeId: string, organizationId: string, branchId: string) {
  const st = await client.query(
    `SELECT * FROM stocktakes
     WHERE id = $1 AND organization_id = $2 AND branch_id = $3
     FOR UPDATE`,
    [stocktakeId, organizationId, branchId],
  );
  if (!st.rows[0]) throw new HttpError(404, 'Toma de inventario no encontrada');
  return st.rows[0];
}

export async function completeStocktake(params: {
  organizationId: string;
  branchId: string;
  stocktakeId: string;
  userId: string;
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const st = await lockSession(client, params.stocktakeId, params.organizationId, params.branchId);
    if (st.status !== 'in_progress') {
      throw new HttpError(400, 'Esta toma no está en conteo');
    }

    await client.query(
      `INSERT INTO stocktake_lines (stocktake_id, product_id, qty_counted, updated_at)
       SELECT $1, p.id, 0, now()
       FROM products p
       LEFT JOIN inventory_balances ib
         ON ib.product_id = p.id AND ib.branch_id = $2
       WHERE p.organization_id = $3
         AND COALESCE(p.tracks_stock, true) = true
         AND p.status NOT IN ('archived', 'returned_to_supplier')
         AND COALESCE(ib.quantity, 0) <> 0
         AND NOT EXISTS (
           SELECT 1 FROM stocktake_lines l
           WHERE l.stocktake_id = $1 AND l.product_id = p.id
         )`,
      [params.stocktakeId, params.branchId, params.organizationId],
    );

    await client.query(
      `UPDATE stocktake_lines l
       SET qty_system_at_close = COALESCE((
             SELECT ib.quantity FROM inventory_balances ib
             WHERE ib.product_id = l.product_id AND ib.branch_id = $2
           ), 0),
           updated_at = now()
       WHERE l.stocktake_id = $1`,
      [params.stocktakeId, params.branchId],
    );

    await client.query(
      `UPDATE stocktakes
       SET status = 'pending_review', completed_at = now(), completed_by = $2
       WHERE id = $1`,
      [params.stocktakeId, params.userId],
    );
    await client.query('COMMIT');
    return loadStocktake(params.stocktakeId, params.organizationId, params.branchId);
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

export async function applyStocktake(params: {
  organizationId: string;
  branchId: string;
  stocktakeId: string;
  userId: string;
  decisions: { productId: string; action: StocktakeDecision; qtyOverride?: number | null }[];
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const st = await lockSession(client, params.stocktakeId, params.organizationId, params.branchId);
    if (st.status !== 'pending_review') {
      throw new HttpError(400, 'Primero finaliza el conteo para conciliar');
    }

    const lines = await client.query<{
      product_id: string;
      qty_counted: number;
      qty_system_at_close: number | null;
      qty_override: number | null;
      decision: string | null;
      product_name: string;
      internal_code: string;
    }>(
      `SELECT l.product_id, l.qty_counted, l.qty_system_at_close, l.qty_override, l.decision,
              p.name AS product_name, p.internal_code
       FROM stocktake_lines l
       JOIN products p ON p.id = l.product_id
       WHERE l.stocktake_id = $1`,
      [params.stocktakeId],
    );

    const byProduct = new Map(params.decisions.map((d) => [d.productId, d]));
    const missing: string[] = [];
    for (const line of lines.rows) {
      const system = Number(line.qty_system_at_close ?? 0);
      const counted = Number(line.qty_counted || 0);
      const chosen = byProduct.get(line.product_id);
      const action = (chosen?.action || line.decision) as StocktakeDecision | undefined;
      if (counted === system && action !== 'adjust') continue;
      if (!action) {
        missing.push(line.internal_code || line.product_name);
        continue;
      }
      if (action === 'adjust') {
        const qty = chosen?.qtyOverride ?? line.qty_override;
        if (qty == null || Number.isNaN(Number(qty)) || Number(qty) < 0) {
          missing.push(line.internal_code || line.product_name);
        }
      }
    }
    if (missing.length) {
      throw new HttpError(
        400,
        `Falta decidir ${missing.length} diferencia${missing.length === 1 ? '' : 's'} (ej. ${missing[0]}). Elige conservar inventario, stock anterior o ajustar.`,
      );
    }

    let adjusted = 0;
    for (const line of lines.rows) {
      const system = Number(line.qty_system_at_close ?? 0);
      const counted = Number(line.qty_counted || 0);
      const chosen = byProduct.get(line.product_id);
      const action: StocktakeDecision =
        counted === system && chosen?.action !== 'adjust' && line.decision !== 'adjust'
          ? 'keep_system'
          : ((chosen?.action || line.decision || 'keep_system') as StocktakeDecision);
      const qtyOverride =
        action === 'adjust' ? Number(chosen?.qtyOverride ?? line.qty_override) : null;

      await client.query(
        `UPDATE stocktake_lines
         SET decision = $3, qty_override = $4, updated_at = now()
         WHERE stocktake_id = $1 AND product_id = $2`,
        [params.stocktakeId, line.product_id, action, qtyOverride],
      );

      let target: number | null = null;
      if (action === 'use_physical') target = counted;
      else if (action === 'adjust') target = qtyOverride;
      if (target == null) continue;

      const bal = await client.query<{ quantity: number }>(
        `SELECT quantity FROM inventory_balances
         WHERE product_id = $1 AND branch_id = $2`,
        [line.product_id, params.branchId],
      );
      const current = bal.rows[0]?.quantity ?? 0;
      const delta = target - current;
      if (delta === 0) continue;

      const noteKind =
        action === 'adjust'
          ? `ajuste a ${target}`
          : target < system
            ? 'faltante'
            : target > system
              ? 'sobrante'
              : 'ajuste';
      await applyStockDeltaWithClient(client, {
        organizationId: params.organizationId,
        branchId: params.branchId,
        productId: line.product_id,
        delta,
        movementType: 'ADJUSTMENT',
        referenceType: 'stocktake',
        referenceId: params.stocktakeId,
        userId: params.userId,
        notes: `Toma ${st.take_label} · ${noteKind} · físico ${counted} · sistema al cerrar ${system} · queda ${target}`,
      });
      adjusted += 1;
    }

    await client.query(
      `UPDATE stocktakes
       SET status = 'completed', applied_at = now(), applied_by = $2
       WHERE id = $1`,
      [params.stocktakeId, params.userId],
    );
    await client.query('COMMIT');
    const full = await loadStocktake(params.stocktakeId, params.organizationId, params.branchId);
    return { ...full, adjusted };
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

export async function cancelStocktake(params: {
  organizationId: string;
  branchId: string;
  stocktakeId: string;
  userId: string;
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const st = await lockSession(client, params.stocktakeId, params.organizationId, params.branchId);
    if (st.status === 'completed') {
      throw new HttpError(400, 'Esta toma ya está cerrada');
    }
    if (st.status === 'cancelled') {
      throw new HttpError(400, 'Esta toma ya está anulada');
    }
    await client.query(
      `UPDATE stocktakes
       SET status = 'cancelled', completed_at = now(), completed_by = $2
       WHERE id = $1`,
      [params.stocktakeId, params.userId],
    );
    await client.query('COMMIT');
    return loadStocktake(params.stocktakeId, params.organizationId, params.branchId);
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}
