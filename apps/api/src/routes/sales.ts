import { Router } from 'express';
import { z } from 'zod';
import { pool, query } from '../db/pool.js';
import { assertPosInBranch, requireAuth, requireBranch, requireRoles } from '../middleware/auth.js';
import {
  applyStockDeltaWithClient,
  getSettingNumber,
  getSettingText,
  nextReceiptNumber,
} from '../services/inventory.js';
import { asyncHandler, HttpError } from '../utils/errors.js';
import { fetchLimit, parsePagination, slicePage } from '../utils/pagination.js';

export const salesRouter = Router();
salesRouter.use(requireAuth, requireBranch);

salesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const dateFrom = String(req.query.dateFrom || '').trim();
    const dateTo = String(req.query.dateTo || '').trim();
    const receiptNumber = String(req.query.receiptNumber || '').trim();
    const seller = String(req.query.seller || '').trim();
    const pos = String(req.query.pos || '').trim();
    const notes = String(req.query.notes || '').trim();
    /** Legacy omnibox: OR entre campos. Preferir params separados (AND). */
    const q = String(req.query.q || '').trim();
    const params: unknown[] = [req.activeBranchId];
    let sql = `
      SELECT s.*, u.full_name AS seller_name, p.name AS pos_name
      FROM sales s
      JOIN users u ON u.id = s.seller_user_id
      JOIN pos_terminals p ON p.id = s.pos_id
      WHERE s.branch_id = $1`;
    if (dateFrom) {
      params.push(dateFrom);
      sql += ` AND s.sold_at::date >= $${params.length}::date`;
    }
    if (dateTo) {
      params.push(dateTo);
      sql += ` AND s.sold_at::date <= $${params.length}::date`;
    }
    if (receiptNumber) {
      params.push(`%${receiptNumber}%`);
      sql += ` AND s.receipt_number ILIKE $${params.length}`;
    }
    if (seller) {
      params.push(`%${seller}%`);
      sql += ` AND u.full_name ILIKE $${params.length}`;
    }
    if (pos) {
      params.push(`%${pos}%`);
      sql += ` AND p.name ILIKE $${params.length}`;
    }
    if (notes) {
      params.push(`%${notes}%`);
      sql += ` AND COALESCE(s.notes,'') ILIKE $${params.length}`;
    }
    if (q) {
      params.push(`%${q}%`);
      sql += ` AND (
        s.receipt_number ILIKE $${params.length}
        OR u.full_name ILIKE $${params.length}
        OR p.name ILIKE $${params.length}
        OR COALESCE(s.notes,'') ILIKE $${params.length}
      )`;
    }
    const { limit, offset } = parsePagination(req.query);
    params.push(fetchLimit(limit), offset);
    sql += ` ORDER BY s.sold_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const result = await query(sql, params);
    const page = slicePage(result.rows, limit, offset);
    res.json({
      sales: page.items,
      hasMore: page.hasMore,
      limit: page.limit,
      offset: page.offset,
      nextOffset: page.nextOffset,
    });
  }),
);

salesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const sale = await query(
      `SELECT s.*,
              u.full_name AS seller_name,
              p.name AS pos_name,
              b.name AS branch_name
       FROM sales s
       JOIN users u ON u.id = s.seller_user_id
       JOIN pos_terminals p ON p.id = s.pos_id
       JOIN branches b ON b.id = s.branch_id
       WHERE s.id = $1 AND s.branch_id = $2`,
      [req.params.id, req.activeBranchId],
    );
    if (!sale.rows[0]) throw new HttpError(404, 'Venta no encontrada');

    const items = await query(
      `SELECT si.*,
              p.name,
              p.internal_code,
              p.barcode,
              p.brand,
              p.size_label,
              p.color,
              p.allows_exchange,
              p.allows_return
       FROM sale_items si
       JOIN products p ON p.id = si.product_id
       WHERE si.sale_id = $1
       ORDER BY si.created_at ASC`,
      [req.params.id],
    );

    const vouchers = await query(
      `SELECT v.*,
              p.name AS product_name,
              p.internal_code,
              p.barcode,
              p.size_label,
              p.color
       FROM change_vouchers v
       JOIN products p ON p.id = v.product_id
       WHERE v.sale_id = $1 AND v.branch_id = $2
       ORDER BY v.created_at ASC`,
      [req.params.id, req.activeBranchId],
    );

    res.json({ sale: sale.rows[0], items: items.rows, vouchers: vouchers.rows });
  }),
);

salesRouter.post(
  '/',
  requireRoles('owner', 'branch_manager', 'seller'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        posId: z.string().uuid(),
        notes: z.string().optional().nullable(),
        discount: z.number().nonnegative().optional(),
        items: z
          .array(
            z.object({
              productId: z.string().uuid(),
              quantity: z.number().int().positive(),
              unitPrice: z.number().nonnegative().optional(),
            }),
          )
          .min(1),
      })
      .parse(req.body);

    await assertPosInBranch(body.posId, req.activeBranchId!);
    const voucherDays = await getSettingNumber(req.user!.organizationId, 'change_voucher_days', 7);
    const conditions = await getSettingText(
      req.user!.organizationId,
      'change_conditions',
      'Condiciones de cambio L\'Scala',
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let subtotal = 0;
      const lineData: { productId: string; quantity: number; unitPrice: number; lineTotal: number; allowsExchange: boolean }[] =
        [];

      for (const item of body.items) {
        const prod = await client.query<{
          sale_price: string;
          allows_exchange: boolean;
          allows_return: boolean;
        }>(
          `SELECT sale_price, allows_exchange, allows_return FROM products WHERE id = $1 AND organization_id = $2`,
          [item.productId, req.user!.organizationId],
        );
        if (!prod.rows[0]) throw new HttpError(400, 'Producto inválido');
        const unitPrice = item.unitPrice ?? Number(prod.rows[0].sale_price);
        const lineTotal = unitPrice * item.quantity;
        subtotal += lineTotal;
        lineData.push({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice,
          lineTotal,
          allowsExchange: prod.rows[0].allows_exchange || prod.rows[0].allows_return,
        });
      }

      const discount = body.discount ?? 0;
      const total = Math.max(subtotal - discount, 0);
      const receiptNumber = await nextReceiptNumber(req.user!.organizationId);

      const saleRes = await client.query(
        `INSERT INTO sales
          (organization_id, branch_id, pos_id, seller_user_id, receipt_number, subtotal, discount, total, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          req.user!.organizationId,
          req.activeBranchId,
          body.posId,
          req.user!.id,
          receiptNumber,
          subtotal,
          discount,
          total,
          body.notes ?? null,
        ],
      );
      const sale = saleRes.rows[0];
      const vouchers = [];
      const baseVoucherCount = await client.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM change_vouchers WHERE organization_id = $1',
        [req.user!.organizationId],
      );
      let voucherN = Number(baseVoucherCount.rows[0]?.count || 0);

      for (const line of lineData) {
        const itemRes = await client.query(
          `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, line_total)
           VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [sale.id, line.productId, line.quantity, line.unitPrice, line.lineTotal],
        );
        await applyStockDeltaWithClient(client, {
          organizationId: req.user!.organizationId,
          branchId: req.activeBranchId!,
          productId: line.productId,
          delta: -line.quantity,
          movementType: 'SALE_OUT',
          referenceType: 'sale',
          referenceId: sale.id,
          userId: req.user!.id,
        });
        await client.query(`UPDATE products SET status = 'sold', updated_at = now() WHERE id = $1`, [
          line.productId,
        ]);

        if (line.allowsExchange) {
          voucherN += 1;
          const voucherNumber = `VC-${String(voucherN).padStart(6, '0')}`;
          const expires = new Date();
          expires.setDate(expires.getDate() + voucherDays);
          const v = await client.query(
            `INSERT INTO change_vouchers
              (organization_id, branch_id, sale_id, sale_item_id, product_id, voucher_number, expires_at, conditions, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [
              req.user!.organizationId,
              req.activeBranchId,
              sale.id,
              itemRes.rows[0].id,
              line.productId,
              voucherNumber,
              expires.toISOString().slice(0, 10),
              conditions,
              req.user!.id,
            ],
          );
          vouchers.push(v.rows[0]);
        }
      }

      await client.query('COMMIT');
      res.status(201).json({ sale, vouchers });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }),
);
