import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireAuth, requireBranch, requireRoles } from '../middleware/auth.js';
import { applyStockDelta, getLowStockAlerts, getNoMovementAlerts } from '../services/inventory.js';
import { asyncHandler, HttpError } from '../utils/errors.js';
import { fetchLimit, parsePagination, slicePage } from '../utils/pagination.js';

type MovementRow = {
  id: string;
  movement_type: string;
  quantity_delta: number;
  quantity_after: number;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  created_at: string;
  product_name: string;
  internal_code: string;
  created_by_name: string | null;
  purchase_id: string | null;
  purchase_invoice: string | null;
  purchase_document_type: string | null;
  sale_id: string | null;
  sale_receipt: string | null;
  merma_id: string | null;
  merma_reason: string | null;
  sale_voucher_count: number | null;
  stocktake_id: string | null;
  stocktake_label: string | null;
};

function purchaseDocLabel(docType: string | null | undefined, invoice: string | null | undefined) {
  const num = (invoice || '').trim();
  if (!num) return null;
  const type = (docType || '').toLowerCase();
  const prefix =
    type === 'factura'
      ? 'Factura'
      : type === 'boleta'
        ? 'Boleta'
        : type === 'guia'
          ? 'Guía'
          : type === 'otro'
            ? 'Doc.'
            : '';
  return prefix ? `${prefix} ${num}` : num;
}

function enrichMovement(row: MovementRow) {
  const type = row.movement_type;
  let typeLabel = type;
  let originKind:
    | 'purchase'
    | 'sale'
    | 'merma'
    | 'adjustment'
    | 'return'
    | 'exchange'
    | 'other' = 'other';
  let reasonLabel = row.notes?.trim() || '';
  let referenceCode: string | null = null;
  let webPath: string | null = null;
  let linkLabel: string | null = null;

  switch (type) {
    case 'PURCHASE_IN': {
      typeLabel = 'Recepción';
      originKind = 'purchase';
      const doc = purchaseDocLabel(row.purchase_document_type, row.purchase_invoice);
      referenceCode = doc || row.purchase_invoice || null;
      reasonLabel = doc
        ? `Recepción de compra · ${doc}`
        : row.notes?.trim() || 'Recepción de compra';
      if (row.purchase_id) {
        webPath = `/ingresos/${row.purchase_id}`;
        linkLabel = 'Ver ingreso';
      }
      break;
    }
    case 'SALE_OUT': {
      typeLabel = 'Venta';
      originKind = 'sale';
      referenceCode = row.sale_receipt || null;
      const vouchers = Number(row.sale_voucher_count || 0);
      reasonLabel = row.sale_receipt
        ? `Venta ${row.sale_receipt}${vouchers > 0 ? ` · ${vouchers} voucher${vouchers === 1 ? '' : 's'}` : ''}`
        : row.notes?.trim() || 'Venta en caja';
      if (row.sale_id) {
        webPath = `/ventas?sale=${row.sale_id}`;
        linkLabel = 'Ver venta';
      }
      break;
    }
    case 'MERMA_OUT': {
      typeLabel = 'Merma';
      originKind = 'merma';
      reasonLabel = row.merma_reason?.trim()
        ? `Merma · ${row.merma_reason.trim()}`
        : row.notes?.trim() || 'Merma de inventario';
      webPath = '/mermas';
      linkLabel = 'Ver mermas';
      break;
    }
    case 'ADJUSTMENT': {
      typeLabel = 'Ajuste';
      originKind = 'adjustment';
      reasonLabel = row.notes?.trim()
        ? `Ajuste de inventario · ${row.notes.trim()}`
        : 'Ajuste manual de stock';
      if (row.stocktake_id && row.stocktake_label) {
        webPath = `/inventarios/${row.stocktake_id}`;
        linkLabel = `Ver toma ${row.stocktake_label}`;
        referenceCode = row.stocktake_label;
      } else {
        webPath = `/inventario?q=${encodeURIComponent(row.internal_code || '')}`;
        linkLabel = 'Ver stock';
      }
      break;
    }
    case 'RETURN_IN': {
      typeLabel = 'Devolución';
      originKind = 'return';
      reasonLabel = row.notes?.trim() || 'Devolución a stock';
      if (row.sale_id) {
        webPath = `/ventas?sale=${row.sale_id}`;
        linkLabel = 'Ver venta';
      } else {
        webPath = '/mermas';
        linkLabel = 'Ver mermas';
      }
      break;
    }
    case 'EXCHANGE_OUT':
    case 'EXCHANGE_IN': {
      typeLabel = type === 'EXCHANGE_OUT' ? 'Cambio (salida)' : 'Cambio (entrada)';
      originKind = 'exchange';
      reasonLabel = row.notes?.trim() || 'Cambio / voucher';
      webPath = '/mermas';
      linkLabel = 'Ver cambios';
      break;
    }
    default: {
      typeLabel = type;
      reasonLabel = row.notes?.trim() || type;
    }
  }

  return {
    ...row,
    type_label: typeLabel,
    origin_kind: originKind,
    reason_label: reasonLabel,
    reference_code: referenceCode,
    web_path: webPath,
    link_label: linkLabel,
  };
}

export const inventoryRouter = Router();
inventoryRouter.use(requireAuth, requireBranch);

inventoryRouter.get(
  '/balances',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const categoryId = String(req.query.categoryId || '').trim();
    const onlyLow = String(req.query.onlyLow || '') === '1' || String(req.query.onlyLow || '') === 'true';
    const photo = String(req.query.photo || '').trim(); // '1' | '0' | ''
    const tracksStock = String(req.query.tracksStock || '').trim();
    const stockPresence = String(req.query.stockPresence || '').trim(); // 'in' | 'zero' | ''
    const { limit, offset } = parsePagination(req.query);

    const params: unknown[] = [req.activeBranchId];
    let where =
      "WHERE ib.branch_id = $1 AND p.status NOT IN ('archived', 'merma', 'returned_to_supplier')";

    if (categoryId) {
      params.push(categoryId);
      where += ` AND p.category_id = $${params.length}::uuid`;
    }
    if (onlyLow) {
      where += ` AND ib.quantity <= COALESCE(ib.low_stock_threshold, p.low_stock_threshold, 1)`;
    }
    if (photo === '1') {
      where += ` AND EXISTS(SELECT 1 FROM product_photos phf WHERE phf.product_id = p.id)`;
    } else if (photo === '0') {
      where += ` AND NOT EXISTS(SELECT 1 FROM product_photos phf WHERE phf.product_id = p.id)`;
    }
    if (tracksStock === '1') {
      where += ` AND COALESCE(p.tracks_stock, true) = true`;
    } else if (tracksStock === '0') {
      where += ` AND COALESCE(p.tracks_stock, true) = false`;
    }
    if (stockPresence === 'in') {
      where += ` AND ib.quantity > 0`;
    } else if (stockPresence === 'zero') {
      where += ` AND ib.quantity = 0`;
    }
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (
        p.name ILIKE $${params.length}
        OR p.internal_code ILIKE $${params.length}
        OR COALESCE(p.barcode,'') ILIKE $${params.length}
        OR COALESCE(p.brand,'') ILIKE $${params.length}
        OR COALESCE(p.size_label,'') ILIKE $${params.length}
        OR COALESCE(c.name,'') ILIKE $${params.length}
      )`;
    }

    const fromJoin = `
       FROM inventory_balances ib
       JOIN products p ON p.id = ib.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       ${where}`;

    const summary = await query(
      `SELECT COUNT(*)::int AS count,
              COALESCE(SUM(ib.quantity), 0)::int AS total_units,
              COALESCE(SUM(ib.quantity * COALESCE(p.sale_price, 0)), 0)::float AS total_value,
              COALESCE(SUM(
                CASE WHEN ib.quantity <= COALESCE(ib.low_stock_threshold, p.low_stock_threshold, 1)
                  THEN 1 ELSE 0 END
              ), 0)::int AS low_count
       ${fromJoin}`,
      params,
    );

    const listParams = [...params, fetchLimit(limit), offset];
    const result = await query(
      `SELECT ib.id, ib.product_id, ib.branch_id, ib.quantity,
              COALESCE(ib.low_stock_threshold, p.low_stock_threshold, 1) AS low_stock_threshold,
              p.name, p.internal_code, p.barcode, p.brand, p.size_label, p.sale_price,
              p.category_id, c.name AS category_name,
              p.tracks_stock,
              (SELECT url FROM product_photos ph WHERE ph.product_id = p.id ORDER BY sort_order LIMIT 1) AS photo_url,
              EXISTS(SELECT 1 FROM product_photos ph2 WHERE ph2.product_id = p.id) AS has_photo
       ${fromJoin}
       ORDER BY p.name
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams,
    );

    const page = slicePage(result.rows, limit, offset);
    const s = summary.rows[0] as {
      count: number;
      total_units: number;
      total_value: number;
      low_count: number;
    };
    res.json({
      balances: page.items,
      hasMore: page.hasMore,
      limit: page.limit,
      offset: page.offset,
      nextOffset: page.nextOffset,
      summary: {
        count: s.count,
        totalUnits: s.total_units,
        totalValue: s.total_value,
        lowCount: s.low_count,
      },
    });
  }),
);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function optionalUuid(raw: unknown, label: string): string | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (!UUID_RE.test(s)) throw new HttpError(400, `${label}: valor inválido`);
  return s;
}

inventoryRouter.get(
  '/movements/users',
  asyncHandler(async (req, res) => {
    const result = await query<{ id: string; full_name: string }>(
      `SELECT u.id, u.full_name
       FROM users u
       WHERE u.organization_id = $2
         AND (
           EXISTS (
             SELECT 1 FROM user_branches ub
             WHERE ub.user_id = u.id AND ub.branch_id = $1
           )
           OR EXISTS (
             SELECT 1 FROM inventory_movements m
             WHERE m.created_by = u.id AND m.branch_id = $1
           )
         )
       ORDER BY u.full_name`,
      [req.activeBranchId, req.user!.organizationId],
    );
    res.json({ users: result.rows });
  }),
);

inventoryRouter.get(
  '/movements',
  asyncHandler(async (req, res) => {
    const typeRaw = String(req.query.type || '').trim();
    const q = String(req.query.q || '').trim();
    const productQ = String(req.query.productQ || '').trim();
    const dateFrom = String(req.query.dateFrom || '').trim();
    const dateTo = String(req.query.dateTo || '').trim();
    const userId = optionalUuid(req.query.userId, 'Usuario');
    const productId = optionalUuid(req.query.productId, 'Producto');

    const params: unknown[] = [req.activeBranchId];
    let sql = `
      SELECT m.*,
             p.name AS product_name,
             p.internal_code,
             u.full_name AS created_by_name,
             pu.id AS purchase_id,
             pu.invoice_number AS purchase_invoice,
             pu.document_type AS purchase_document_type,
             s.id AS sale_id,
             s.receipt_number AS sale_receipt,
             mer.id AS merma_id,
             mer.reason AS merma_reason,
             (
               SELECT COUNT(*)::int FROM change_vouchers cv
               WHERE cv.sale_id = s.id
             ) AS sale_voucher_count,
             st.id AS stocktake_id,
             st.take_label AS stocktake_label
      FROM inventory_movements m
      JOIN products p ON p.id = m.product_id
      LEFT JOIN users u ON u.id = m.created_by
      LEFT JOIN purchases pu
        ON m.reference_type = 'purchase' AND pu.id = m.reference_id
      LEFT JOIN sales s
        ON m.reference_type = 'sale' AND s.id = m.reference_id
      LEFT JOIN mermas mer
        ON m.reference_type = 'merma' AND mer.id = m.reference_id
      LEFT JOIN stocktakes st
        ON m.reference_type = 'stocktake' AND st.id = m.reference_id
      WHERE m.branch_id = $1`;

    if (typeRaw && typeRaw !== 'all') {
      params.push(typeRaw);
      sql += ` AND m.movement_type = $${params.length}::movement_type`;
    }
    if (dateFrom) {
      params.push(dateFrom);
      sql += ` AND m.created_at::date >= $${params.length}::date`;
    }
    if (dateTo) {
      params.push(dateTo);
      sql += ` AND m.created_at::date <= $${params.length}::date`;
    }
    if (userId) {
      params.push(userId);
      sql += ` AND m.created_by = $${params.length}::uuid`;
    }
    if (productId) {
      params.push(productId);
      sql += ` AND m.product_id = $${params.length}::uuid`;
    } else if (productQ) {
      params.push(`%${productQ}%`);
      sql += ` AND (
        p.name ILIKE $${params.length}
        OR p.internal_code ILIKE $${params.length}
        OR COALESCE(p.barcode,'') ILIKE $${params.length}
      )`;
    }
    if (q) {
      params.push(`%${q}%`);
      sql += ` AND (
        p.name ILIKE $${params.length}
        OR p.internal_code ILIKE $${params.length}
        OR COALESCE(u.full_name,'') ILIKE $${params.length}
        OR COALESCE(m.notes,'') ILIKE $${params.length}
        OR COALESCE(pu.invoice_number,'') ILIKE $${params.length}
        OR COALESCE(s.receipt_number,'') ILIKE $${params.length}
        OR COALESCE(mer.reason,'') ILIKE $${params.length}
        OR COALESCE(st.take_label,'') ILIKE $${params.length}
      )`;
    }

    const { limit, offset } = parsePagination(req.query);
    params.push(fetchLimit(limit), offset);
    sql += ` ORDER BY m.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const result = await query(sql, params);
    const page = slicePage(result.rows, limit, offset);
    const movements = page.items.map((row) => enrichMovement(row as MovementRow));
    res.json({
      movements,
      hasMore: page.hasMore,
      limit: page.limit,
      offset: page.offset,
      nextOffset: page.nextOffset,
    });
  }),
);

inventoryRouter.get(
  '/alerts',
  asyncHandler(async (req, res) => {
    const [lowStock, noMovement] = await Promise.all([
      getLowStockAlerts(req.user!.organizationId, req.activeBranchId!),
      getNoMovementAlerts(req.user!.organizationId, req.activeBranchId!),
    ]);
    res.json({ lowStock, noMovement });
  }),
);

/**
 * Ajuste manual de stock en la sucursal activa.
 * Acepta cantidad absoluta (`newQuantity`) o delta (`delta`); motivo obligatorio.
 */
inventoryRouter.post(
  '/adjust',
  requireRoles('owner', 'branch_manager'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        productId: z.string().uuid(),
        newQuantity: z.number().int().nonnegative().optional(),
        delta: z.number().int().optional(),
        notes: z.string().trim().min(1, 'El motivo es obligatorio'),
      })
      .refine(
        (v) => v.newQuantity !== undefined || (v.delta !== undefined && v.delta !== 0),
        { message: 'Indica la nueva cantidad o un ajuste distinto de cero' },
      )
      .parse(req.body);

    const prod = await query<{ id: string; name: string }>(
      `SELECT id, name FROM products
       WHERE id = $1 AND organization_id = $2`,
      [body.productId, req.user!.organizationId],
    );
    if (!prod.rows[0]) throw new HttpError(404, 'Producto no encontrado');

    const bal = await query<{ quantity: number }>(
      `SELECT quantity FROM inventory_balances
       WHERE product_id = $1 AND branch_id = $2`,
      [body.productId, req.activeBranchId],
    );
    const current = bal.rows[0]?.quantity ?? 0;

    let delta: number;
    if (body.newQuantity !== undefined) {
      delta = body.newQuantity - current;
    } else {
      delta = body.delta!;
    }
    if (delta === 0) {
      throw new HttpError(400, 'La cantidad nueva es igual al stock actual');
    }

    const quantityAfter = await applyStockDelta({
      organizationId: req.user!.organizationId,
      branchId: req.activeBranchId!,
      productId: body.productId,
      delta,
      movementType: 'ADJUSTMENT',
      referenceType: 'manual_adjustment',
      notes: body.notes.trim(),
      userId: req.user!.id,
    });

    res.status(201).json({
      adjustment: {
        productId: body.productId,
        productName: prod.rows[0].name,
        previousQuantity: current,
        quantityDelta: delta,
        quantityAfter,
        notes: body.notes.trim(),
      },
    });
  }),
);
