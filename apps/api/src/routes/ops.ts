import { Router } from 'express';
import { z } from 'zod';
import { pool, query } from '../db/pool.js';
import { requireAuth, requireBranch, requireRoles } from '../middleware/auth.js';
import { applyStockDeltaWithClient, expandProductCodeVariants, expandSaleDocNumberVariants, saleDocLookupKind } from '../services/inventory.js';
import { ensureEligibleSaleVouchers } from '../services/sales.js';
import {
  composeMermaReason,
  fulfillBodySchema,
  fulfillVoucherWithClient,
  chileTodayWithClient,
  mermaKindLabel,
  type MermaKind,
} from '../services/voucherFulfill.js';
import {
  pickVoucherForSaleLookup,
  saleLookupClosedMessage,
  saleLookupGarmentUsedMessage,
  voucherApiPayload,
} from '../services/voucherLookup.js';
import { asyncHandler, HttpError } from '../utils/errors.js';
import { CHILE_TZ, chileToday } from '../utils/chileDate.js';
import { fetchLimit, parsePagination, slicePage } from '../utils/pagination.js';

export const opsRouter = Router();
opsRouter.use(requireAuth, requireBranch);

function canSeeCost(role: string | undefined) {
  return role === 'owner' || role === 'branch_manager';
}

const chileDateSql = `(timezone('${CHILE_TZ}', now()))::date`;

opsRouter.get(
  '/mermas/lookup/:code',
  asyncHandler(async (req, res) => {
    const variants = expandProductCodeVariants(String(req.params.code || ''));
    if (!variants.length) throw new HttpError(400, 'Código vacío');
    const result = await query(
      `SELECT p.id, p.name, p.internal_code, p.barcode, p.brand, p.size_label, p.color,
              p.sale_price, p.status, p.tracks_stock,
              c.name AS category_name, c.slug AS category_slug,
              (SELECT url FROM product_photos ph WHERE ph.product_id = p.id ORDER BY sort_order LIMIT 1) AS photo_url,
              COALESCE(ib.quantity, 0)::int AS stock
              ${canSeeCost(req.activeRole) ? ', p.cost_price' : ', NULL::numeric AS cost_price'}
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN inventory_balances ib ON ib.product_id = p.id AND ib.branch_id = $2
       WHERE p.organization_id = $1
         AND p.status NOT IN ('archived', 'returned_to_supplier')
         AND (
           p.internal_code = ANY($3::text[])
           OR UPPER(COALESCE(p.barcode, '')) = ANY($3::text[])
         )
       LIMIT 1`,
      [req.user!.organizationId, req.activeBranchId, variants],
    );
    if (!result.rows[0]) throw new HttpError(404, 'Producto no encontrado');
    res.json({ product: result.rows[0] });
  }),
);

opsRouter.get(
  '/mermas',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const product = String(req.query.product || '').trim();
    const reason = String(req.query.reason || '').trim();
    const user = String(req.query.user || '').trim();
    const dateFrom = String(req.query.dateFrom || '').trim();
    const dateTo = String(req.query.dateTo || '').trim();
    const { limit, offset } = parsePagination(req.query);

    const params: unknown[] = [req.activeBranchId];
    let where = `WHERE m.branch_id = $1`;

    if (dateFrom) {
      params.push(dateFrom);
      where += ` AND (timezone('${CHILE_TZ}', m.created_at))::date >= $${params.length}::date`;
    }
    if (dateTo) {
      params.push(dateTo);
      where += ` AND (timezone('${CHILE_TZ}', m.created_at))::date <= $${params.length}::date`;
    }
    if (product) {
      params.push(`%${product}%`);
      const p = params.length;
      where += ` AND (
        p.name ILIKE $${p}
        OR p.internal_code ILIKE $${p}
        OR COALESCE(p.barcode, '') ILIKE $${p}
      )`;
    }
    if (reason) {
      params.push(`%${reason}%`);
      where += ` AND m.reason ILIKE $${params.length}`;
    }
    if (user) {
      params.push(`%${user}%`);
      where += ` AND COALESCE(u.full_name, '') ILIKE $${params.length}`;
    }
    if (q && !product && !reason && !user) {
      params.push(`%${q}%`);
      const p = params.length;
      where += ` AND (
        p.name ILIKE $${p}
        OR p.internal_code ILIKE $${p}
        OR COALESCE(p.barcode, '') ILIKE $${p}
        OR m.reason ILIKE $${p}
        OR COALESCE(u.full_name, '') ILIKE $${p}
      )`;
    }

    const summaryRes = await query<{
      count: string;
      total_units: string;
      total_cost: string;
    }>(
      `SELECT COUNT(*)::text AS count,
              COALESCE(SUM(m.quantity), 0)::text AS total_units,
              COALESCE(SUM(m.cost_impact), 0)::text AS total_cost
       FROM mermas m
       JOIN products p ON p.id = m.product_id
       LEFT JOIN users u ON u.id = m.created_by
       ${where}`,
      params,
    );

    params.push(fetchLimit(limit), offset);
    const result = await query(
      `SELECT m.id, m.organization_id, m.branch_id, m.product_id, m.quantity, m.reason,
              m.kind, m.notes, m.voucher_id, m.skip_stock,
              m.created_by, m.created_at,
              ${canSeeCost(req.activeRole) ? 'm.cost_impact' : 'NULL::numeric AS cost_impact'},
              p.name AS product_name, p.internal_code, p.barcode,
              u.full_name AS created_by_name
       FROM mermas m
       JOIN products p ON p.id = m.product_id
       LEFT JOIN users u ON u.id = m.created_by
       ${where}
       ORDER BY m.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const page = slicePage(result.rows, limit, offset);
    const summary = summaryRes.rows[0];
    res.json({
      mermas: page.items,
      hasMore: page.hasMore,
      nextOffset: page.nextOffset,
      limit: page.limit,
      offset: page.offset,
      summary: {
        count: Number(summary?.count || 0),
        totalUnits: Number(summary?.total_units || 0),
        totalCostImpact: canSeeCost(req.activeRole) ? Number(summary?.total_cost || 0) : null,
      },
    });
  }),
);

opsRouter.post(
  '/mermas',
  requireRoles('owner', 'branch_manager', 'seller'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive(),
        kind: z.enum(['discard', 'supplier']).optional(),
        notes: z.string().trim().max(500).optional().nullable(),
        reason: z.string().trim().max(500).optional(),
      })
      .refine((b) => Boolean(b.kind || b.reason?.trim()), {
        message: 'Indica el destino de la merma (baja o proveedor)',
      })
      .parse(req.body);

    const kind: MermaKind = body.kind ?? 'discard';
    const reason = body.kind
      ? composeMermaReason(kind, body.notes)
      : body.reason!.trim();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const prod = await client.query<{
        cost_price: string;
        tracks_stock: boolean;
        name: string;
      }>(
        `SELECT cost_price, COALESCE(tracks_stock, true) AS tracks_stock, name
         FROM products WHERE id = $1 AND organization_id = $2`,
        [body.productId, req.user!.organizationId],
      );
      if (!prod.rows[0]) throw new HttpError(404, 'Producto no encontrado');
      if (!prod.rows[0].tracks_stock) {
        throw new HttpError(400, 'Esta prenda no controla stock de vitrina');
      }

      const bal = await client.query<{ quantity: number }>(
        `SELECT quantity FROM inventory_balances
         WHERE product_id = $1 AND branch_id = $2 FOR UPDATE`,
        [body.productId, req.activeBranchId],
      );
      const stock = bal.rows[0]?.quantity ?? 0;
      if (body.quantity > stock) {
        throw new HttpError(400, `No hay tanto stock en esta sucursal (disponible: ${stock})`);
      }

      const costImpact = Number(prod.rows[0].cost_price) * body.quantity;
      const merma = await client.query(
        `INSERT INTO mermas (
           organization_id, branch_id, product_id, quantity, reason, cost_impact,
           created_by, kind, notes, skip_stock
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false) RETURNING *`,
        [
          req.user!.organizationId,
          req.activeBranchId,
          body.productId,
          body.quantity,
          reason,
          costImpact,
          req.user!.id,
          kind,
          body.notes?.trim() || null,
        ],
      );

      const quantityAfter = await applyStockDeltaWithClient(client, {
        organizationId: req.user!.organizationId,
        branchId: req.activeBranchId!,
        productId: body.productId,
        delta: -body.quantity,
        movementType: 'MERMA_OUT',
        referenceType: 'merma',
        referenceId: merma.rows[0].id,
        userId: req.user!.id,
        notes: reason,
      });
      if (quantityAfter === 0) {
        await client.query(
          `UPDATE products SET status = 'merma', updated_at = now() WHERE id = $1`,
          [body.productId],
        );
      }

      await client.query('COMMIT');

      const row = merma.rows[0] as Record<string, unknown>;
      if (!canSeeCost(req.activeRole)) {
        row.cost_impact = null;
      }
      res.status(201).json({
        merma: row,
        quantityAfter,
        kind,
        kindLabel: mermaKindLabel(kind),
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }),
);

opsRouter.get(
  '/vouchers',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const voucher = String(req.query.voucher || '').trim();
    const product = String(req.query.product || '').trim();
    const sale = String(req.query.sale || '').trim();
    const status = String(req.query.status || 'all').trim();
    const dateFrom = String(req.query.dateFrom || '').trim();
    const dateTo = String(req.query.dateTo || '').trim();
    const { limit, offset } = parsePagination(req.query);

    const params: unknown[] = [req.activeBranchId];
    let where = `WHERE v.branch_id = $1`;

    if (status && status !== 'all') {
      const parsed = z.enum(['open', 'used', 'expired', 'cancelled']).safeParse(status);
      if (!parsed.success) throw new HttpError(400, 'Estado de voucher inválido');
      if (parsed.data === 'expired') {
        where += ` AND (
          v.status = 'expired'
          OR (v.status = 'open' AND v.expires_at < ${chileDateSql})
        )`;
      } else if (parsed.data === 'open') {
        where += ` AND v.status = 'open' AND v.expires_at >= ${chileDateSql}`;
      } else {
        params.push(parsed.data);
        where += ` AND v.status = $${params.length}`;
      }
    }
    if (dateFrom) {
      params.push(dateFrom);
      where += ` AND v.issued_at >= $${params.length}::date`;
    }
    if (dateTo) {
      params.push(dateTo);
      where += ` AND v.issued_at <= $${params.length}::date`;
    }
    if (voucher) {
      params.push(`%${voucher}%`);
      where += ` AND v.voucher_number ILIKE $${params.length}`;
    }
    if (product) {
      params.push(`%${product}%`);
      const p = params.length;
      where += ` AND (p.name ILIKE $${p} OR p.internal_code ILIKE $${p})`;
    }
    if (sale) {
      params.push(`%${sale}%`);
      where += ` AND COALESCE(s.receipt_number, '') ILIKE $${params.length}`;
    }
    if (q && !voucher && !product && !sale) {
      params.push(`%${q}%`);
      const p = params.length;
      where += ` AND (
        v.voucher_number ILIKE $${p}
        OR p.name ILIKE $${p}
        OR p.internal_code ILIKE $${p}
        OR COALESCE(s.receipt_number, '') ILIKE $${p}
      )`;
    }

    const summaryRes = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM change_vouchers v
       JOIN products p ON p.id = v.product_id
       LEFT JOIN sales s ON s.id = v.sale_id
       ${where}`,
      params,
    );

    const kpiRes = await query<{ open_count: string; expiring_soon: string }>(
      `SELECT COUNT(*) FILTER (
                WHERE status = 'open' AND expires_at >= ${chileDateSql}
              )::text AS open_count,
              COUNT(*) FILTER (
                WHERE status = 'open'
                  AND expires_at >= ${chileDateSql}
                  AND expires_at <= ${chileDateSql} + INTERVAL '3 days'
              )::text AS expiring_soon
       FROM change_vouchers
       WHERE branch_id = $1`,
      [req.activeBranchId],
    );

    params.push(fetchLimit(limit), offset);
    const result = await query(
      `SELECT v.*,
              p.name AS product_name, p.internal_code, p.barcode,
              p.allows_exchange, p.allows_return,
              s.receipt_number AS sale_receipt,
              s.id AS sale_id_resolved,
              u.full_name AS created_by_name,
              (v.expires_at - ${chileDateSql}) AS days_left,
              (v.status = 'expired' OR (v.status = 'open' AND v.expires_at < ${chileDateSql})) AS expired
       FROM change_vouchers v
       JOIN products p ON p.id = v.product_id
       LEFT JOIN sales s ON s.id = v.sale_id
       LEFT JOIN users u ON u.id = v.created_by
       ${where}
       ORDER BY
         CASE v.status WHEN 'open' THEN 0 WHEN 'used' THEN 1 WHEN 'expired' THEN 2 ELSE 3 END,
         v.expires_at ASC,
         v.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const page = slicePage(result.rows, limit, offset);
    const summary = summaryRes.rows[0];
    const kpi = kpiRes.rows[0];
    res.json({
      vouchers: page.items,
      hasMore: page.hasMore,
      nextOffset: page.nextOffset,
      limit: page.limit,
      offset: page.offset,
      summary: {
        count: Number(summary?.count || 0),
        openCount: Number(kpi?.open_count || 0),
        expiringSoon: Number(kpi?.expiring_soon || 0),
      },
    });
  }),
);

opsRouter.get(
  '/vouchers/by-number/:number',
  asyncHandler(async (req, res) => {
    const rawNumber = String(req.params.number || '');
    const variants = expandSaleDocNumberVariants(rawNumber);
    if (!variants.length) throw new HttpError(400, 'Indica el número de ticket o de venta');

    const orgId = req.user!.organizationId;
    const lookupKind = saleDocLookupKind(rawNumber);
    const garmentRaw = String(req.query.garment || '').trim();
    const garmentVariants = expandProductCodeVariants(garmentRaw);

    const voucherSelect = `SELECT v.id, v.status, v.voucher_number, v.issued_at::text, v.expires_at::text, v.conditions,
              v.product_id, v.sale_id, v.sale_item_id, v.branch_id,
              b.name AS branch_name, b.code AS branch_code,
              p.name AS product_name, p.internal_code, p.barcode, p.size_label, p.color, p.allows_exchange, p.allows_return,
              p.sale_price::text AS sale_price,
              c.slug AS category_slug,
              (SELECT url FROM product_photos ph WHERE ph.product_id = p.id ORDER BY sort_order LIMIT 1) AS photo_url,
              s.receipt_number, s.sold_at::text AS sold_at,
              si.line_total::text AS line_total, si.unit_price::text AS unit_price, si.quantity AS line_qty
       FROM change_vouchers v
       JOIN branches b ON b.id = v.branch_id
       JOIN products p ON p.id = v.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN sales s ON s.id = v.sale_id
       LEFT JOIN sale_items si ON si.id = v.sale_item_id`;

    type VoucherLookupRow = {
      id: string;
      status: string;
      voucher_number: string;
      issued_at: string;
      expires_at: string;
      conditions: string | null;
      product_id: string;
      sale_id: string | null;
      sale_item_id: string | null;
      branch_id: string;
      branch_name: string;
      branch_code: string;
      product_name: string;
      internal_code: string;
      barcode: string | null;
      photo_url: string | null;
      size_label: string | null;
      color: string | null;
      allows_exchange: boolean;
      allows_return: boolean;
      category_slug: string | null;
      sale_price: string;
      receipt_number: string | null;
      sold_at: string | null;
      line_total: string | null;
      unit_price: string | null;
      line_qty: number | null;
    };

    async function loadByVoucherNumber() {
      return query<VoucherLookupRow>(
        `${voucherSelect}
         WHERE v.organization_id = $1 AND UPPER(v.voucher_number) = ANY($2::text[])
         LIMIT 1`,
        [orgId, variants],
      );
    }

    async function loadBySaleId(saleId: string) {
      return query<VoucherLookupRow>(
        `${voucherSelect}
         WHERE v.organization_id = $1 AND v.sale_id = $2
         ORDER BY v.voucher_number`,
        [orgId, saleId],
      );
    }

    async function findSale() {
      return query<{
        id: string;
        branch_id: string;
        branch_name: string;
        receipt_number: string;
      }>(
        `SELECT s.id, s.branch_id, b.name AS branch_name, s.receipt_number
         FROM sales s
         JOIN branches b ON b.id = s.branch_id
         WHERE s.organization_id = $1 AND UPPER(s.receipt_number) = ANY($2::text[])
         LIMIT 1`,
        [orgId, variants],
      );
    }

    async function ensureSaleTickets(saleId: string) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const created = await ensureEligibleSaleVouchers(client, {
          organizationId: orgId,
          saleId,
          createdBy: req.user!.id,
        });
        await client.query('COMMIT');
        return created;
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

    const today = await chileToday();

    if (lookupKind === 'voucher') {
      const found = await loadByVoucherNumber();
      const row = found.rows[0];
      if (!row) throw new HttpError(404, 'No hay un ticket con ese número.');
      if (row.branch_id !== req.activeBranchId) {
        throw new HttpError(404, `Este ticket es de otra tienda (${row.branch_name})`);
      }
      res.json({ voucher: voucherApiPayload(row, today), saleLookup: null });
      return;
    }

    const sale = await findSale();
    const saleRow = sale.rows[0];
    if (!saleRow) {
      throw new HttpError(404, 'No hay un ticket ni una venta con ese número.');
    }
    if (saleRow.branch_id !== req.activeBranchId) {
      throw new HttpError(404, `Esta venta es de otra tienda (${saleRow.branch_name})`);
    }

    const created = await ensureSaleTickets(saleRow.id);
    let rows = (await loadBySaleId(saleRow.id)).rows;
    if (!rows.length) {
      throw new HttpError(
        404,
        created
          ? 'Esta venta no tiene ticket de cambio.'
          : 'Esta venta no tiene ticket de cambio: la prenda no admite cambio ni devolución.',
      );
    }

    if (rows.some((r) => r.branch_id !== req.activeBranchId)) {
      throw new HttpError(404, `Este ticket es de otra tienda (${rows[0].branch_name})`);
    }

    const pick = pickVoucherForSaleLookup(rows, garmentVariants);
    const saleLookupBase = {
      kind: 'sale' as const,
      receiptNumber: saleRow.receipt_number,
      openCount: rows.filter((r) => r.status === 'open' || r.status === 'expired').length,
      usedCount: rows.filter((r) => r.status === 'used').length,
      totalCount: rows.length,
      needsProductScan: false,
    };

    if (pick.result === 'need_garment') {
      res.json({
        voucher: null,
        saleLookup: {
          ...saleLookupBase,
          needsProductScan: true,
          openCount: pick.openCount,
        },
      });
      return;
    }
    if (pick.result === 'all_closed') {
      throw new HttpError(404, saleLookupClosedMessage());
    }
    if (pick.result === 'garment_unknown') {
      throw new HttpError(404, 'Esa prenda no corresponde a un ticket de esta venta.');
    }
    if (pick.result === 'garment_used') {
      throw new HttpError(400, saleLookupGarmentUsedMessage(pick.openSiblings));
    }
    if (pick.result === 'empty') {
      throw new HttpError(404, 'Esta venta no tiene ticket de cambio.');
    }

    const row = rows[pick.index];
    res.json({
      voucher: voucherApiPayload(row, today),
      saleLookup: saleLookupBase,
    });
  }),
);

opsRouter.post(
  '/vouchers/:id/fulfill',
  requireRoles('owner', 'branch_manager', 'seller'),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = fulfillBodySchema.parse(req.body ?? {});
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const todayCl = await chileTodayWithClient(client);
      const vRes = await client.query(
        `SELECT id, status, product_id, sale_id, sale_item_id, voucher_number,
                expires_at::text, issued_at::text, branch_id, organization_id
         FROM change_vouchers
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [id, req.user!.organizationId],
      );
      const voucher = vRes.rows[0];
      if (!voucher) throw new HttpError(404, 'Ticket no encontrado');
      if (voucher.branch_id !== req.activeBranchId) {
        throw new HttpError(404, 'Este ticket es de otra tienda');
      }
      const result = await fulfillVoucherWithClient(client, {
        voucher,
        body,
        organizationId: req.user!.organizationId,
        branchId: req.activeBranchId!,
        userId: req.user!.id,
        todayCl,
      });
      await client.query('COMMIT');
      if (result.merma && !canSeeCost(req.activeRole)) {
        (result.merma as Record<string, unknown>).cost_impact = null;
      }
      res.json(result);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }),
);

opsRouter.post(
  '/vouchers/:id/use',
  requireRoles('owner', 'branch_manager', 'seller'),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        /** mark_only = solo cierra el voucher; return_stock = devolución con reingreso a stock */
        mode: z.enum(['mark_only', 'return_stock']).default('mark_only'),
        notes: z.string().trim().max(500).optional(),
      })
      .parse(req.body ?? {});

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const vRes = await client.query<{
        id: string;
        status: string;
        product_id: string;
        sale_item_id: string | null;
        voucher_number: string;
        expires_at: string;
      }>(
        `SELECT id, status, product_id, sale_item_id, voucher_number, expires_at::text
         FROM change_vouchers
         WHERE id = $1 AND branch_id = $2 AND organization_id = $3
         FOR UPDATE`,
        [id, req.activeBranchId, req.user!.organizationId],
      );
      const voucher = vRes.rows[0];
      if (!voucher) throw new HttpError(404, 'Voucher no encontrado');
      if (voucher.status === 'used') throw new HttpError(400, 'El voucher ya fue usado');
      if (voucher.status === 'cancelled') throw new HttpError(400, 'El voucher está anulado');
      if (voucher.status === 'expired' || voucher.expires_at < new Date().toISOString().slice(0, 10)) {
        if (voucher.status === 'open') {
          await client.query(`UPDATE change_vouchers SET status = 'expired' WHERE id = $1`, [id]);
        }
        throw new HttpError(400, 'El voucher está vencido');
      }
      if (voucher.status !== 'open') throw new HttpError(400, 'El voucher no está disponible');

      let qty = 1;
      if (voucher.sale_item_id) {
        const item = await client.query<{ quantity: number }>(
          `SELECT quantity FROM sale_items WHERE id = $1`,
          [voucher.sale_item_id],
        );
        if (item.rows[0]?.quantity) qty = item.rows[0].quantity;
      }

      if (body.mode === 'return_stock') {
        await applyStockDeltaWithClient(client, {
          organizationId: req.user!.organizationId,
          branchId: req.activeBranchId!,
          productId: voucher.product_id,
          delta: qty,
          movementType: 'RETURN_IN',
          referenceType: 'change_voucher',
          referenceId: voucher.id,
          userId: req.user!.id,
          notes: body.notes?.trim() || `Devolución voucher ${voucher.voucher_number}`,
        });
        await client.query(
          `UPDATE products SET status = 'available', updated_at = now() WHERE id = $1`,
          [voucher.product_id],
        );
      }

      await client.query(`UPDATE change_vouchers SET status = 'used' WHERE id = $1`, [id]);

      const er = await client.query(
        `INSERT INTO exchange_returns
          (organization_id, branch_id, voucher_id, original_product_id, new_product_id, notes, created_by)
         VALUES ($1,$2,$3,$4,NULL,$5,$6) RETURNING *`,
        [
          req.user!.organizationId,
          req.activeBranchId,
          voucher.id,
          voucher.product_id,
          body.notes?.trim() ||
            (body.mode === 'return_stock' ? 'Devolución con reingreso a stock' : 'Cambio / voucher usado'),
          req.user!.id,
        ],
      );

      await client.query('COMMIT');
      res.json({ voucherId: id, status: 'used', exchangeReturn: er.rows[0], mode: body.mode });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }),
);

opsRouter.post(
  '/vouchers/:id/cancel',
  requireRoles('owner', 'branch_manager', 'seller'),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        notes: z.string().trim().max(500).optional(),
      })
      .parse(req.body ?? {});

    const result = await query(
      `UPDATE change_vouchers
       SET status = 'cancelled'
       WHERE id = $1 AND branch_id = $2 AND organization_id = $3 AND status = 'open'
       RETURNING *`,
      [id, req.activeBranchId, req.user!.organizationId],
    );
    if (!result.rows[0]) {
      const existing = await query<{ status: string }>(
        `SELECT status FROM change_vouchers
         WHERE id = $1 AND branch_id = $2 AND organization_id = $3`,
        [id, req.activeBranchId, req.user!.organizationId],
      );
      if (!existing.rows[0]) throw new HttpError(404, 'Voucher no encontrado');
      throw new HttpError(400, `No se puede anular un voucher en estado «${existing.rows[0].status}»`);
    }

    if (body.notes?.trim()) {
      await query(
        `INSERT INTO exchange_returns
          (organization_id, branch_id, voucher_id, original_product_id, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          req.user!.organizationId,
          req.activeBranchId,
          id,
          result.rows[0].product_id,
          `Anulación: ${body.notes.trim()}`,
          req.user!.id,
        ],
      );
    }

    res.json({ voucher: result.rows[0] });
  }),
);

opsRouter.get(
  '/expenses',
  requireRoles('owner'),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const description = String(req.query.description || '').trim();
    const user = String(req.query.user || '').trim();
    const category = String(req.query.category || '').trim();
    const dateFrom = String(req.query.dateFrom || '').trim();
    const dateTo = String(req.query.dateTo || '').trim();
    const { limit, offset } = parsePagination(req.query);

    const params: unknown[] = [req.activeBranchId];
    let where = `WHERE e.branch_id = $1`;

    if (category && category !== 'all') {
      params.push(category);
      where += ` AND e.category = $${params.length}`;
    }
    if (dateFrom) {
      params.push(dateFrom);
      where += ` AND e.incurred_on >= $${params.length}::date`;
    }
    if (dateTo) {
      params.push(dateTo);
      where += ` AND e.incurred_on <= $${params.length}::date`;
    }
    if (description) {
      params.push(`%${description}%`);
      where += ` AND e.description ILIKE $${params.length}`;
    }
    if (user) {
      params.push(`%${user}%`);
      where += ` AND COALESCE(u.full_name, '') ILIKE $${params.length}`;
    }
    if (q && !description && !user) {
      params.push(`%${q}%`);
      const p = params.length;
      where += ` AND (
        e.description ILIKE $${p}
        OR e.category ILIKE $${p}
        OR COALESCE(u.full_name, '') ILIKE $${p}
      )`;
    }

    const summaryRes = await query<{ count: string; total_amount: string }>(
      `SELECT COUNT(*)::text AS count,
              COALESCE(SUM(e.amount), 0)::text AS total_amount
       FROM expenses e
       LEFT JOIN users u ON u.id = e.created_by
       ${where}`,
      params,
    );

    const monthRes = await query<{ total: string; count: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS total,
              COUNT(*)::text AS count
       FROM expenses
       WHERE branch_id = $1
         AND incurred_on >= date_trunc('month', CURRENT_DATE)::date
         AND incurred_on < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date`,
      [req.activeBranchId],
    );

    params.push(fetchLimit(limit), offset);
    const result = await query(
      `SELECT e.*, u.full_name AS created_by_name
       FROM expenses e
       LEFT JOIN users u ON u.id = e.created_by
       ${where}
       ORDER BY e.incurred_on DESC, e.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const page = slicePage(result.rows, limit, offset);
    const summary = summaryRes.rows[0];
    const month = monthRes.rows[0];
    res.json({
      expenses: page.items,
      hasMore: page.hasMore,
      nextOffset: page.nextOffset,
      limit: page.limit,
      offset: page.offset,
      summary: {
        count: Number(summary?.count || 0),
        totalAmount: Number(summary?.total_amount || 0),
        monthTotal: Number(month?.total || 0),
        monthCount: Number(month?.count || 0),
      },
    });
  }),
);

opsRouter.post(
  '/expenses',
  requireRoles('owner'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        category: z.string().trim().min(1).max(80),
        description: z.string().trim().min(1).max(800),
        amount: z.number().nonnegative(),
        incurredOn: z.string().optional(),
      })
      .parse(req.body);
    const result = await query(
      `INSERT INTO expenses (organization_id, branch_id, category, description, amount, incurred_on, created_by)
       VALUES ($1,$2,$3,$4,$5,COALESCE($6::date, CURRENT_DATE),$7) RETURNING *`,
      [
        req.user!.organizationId,
        req.activeBranchId,
        body.category,
        body.description,
        body.amount,
        body.incurredOn ?? null,
        req.user!.id,
      ],
    );
    res.status(201).json({ expense: result.rows[0] });
  }),
);
