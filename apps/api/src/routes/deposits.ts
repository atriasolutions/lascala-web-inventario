import { Router } from 'express';
import { z } from 'zod';
import { pool, query } from '../db/pool.js';
import { assertUserCanUsePos, requireAuth, requireBranch, requireRoles } from '../middleware/auth.js';
import {
  cancelDepositWithClient,
  completeDepositBodySchema,
  completeDepositWithClient,
  createDepositBodySchema,
  createDepositWithClient,
} from '../services/deposits.js';
import { asyncHandler, HttpError } from '../utils/errors.js';
import { fetchLimit, parsePagination, slicePage } from '../utils/pagination.js';

export const depositsRouter = Router();
depositsRouter.use(requireAuth, requireBranch);

depositsRouter.get(
  '/',
  requireRoles('owner', 'branch_manager', 'seller'),
  asyncHandler(async (req, res) => {
    const { limit, offset } = parsePagination(req.query);
    const status = z
      .enum(['open', 'completed', 'cancelled', 'all'])
      .optional()
      .parse(req.query.status ?? 'all');
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const dateFrom = typeof req.query.dateFrom === 'string' && dateRe.test(req.query.dateFrom)
      ? req.query.dateFrom
      : '';
    const dateTo = typeof req.query.dateTo === 'string' && dateRe.test(req.query.dateTo)
      ? req.query.dateTo
      : '';
    const number = typeof req.query.number === 'string' ? req.query.number.trim() : '';
    const customer = typeof req.query.customer === 'string' ? req.query.customer.trim() : '';
    const params: unknown[] = [req.user!.organizationId, req.activeBranchId];
    let sql = `
      SELECT d.*,
             u.full_name AS created_by_name,
             s.receipt_number AS sale_receipt_number,
             CASE WHEN d.subtotal > 0
               THEN ROUND((d.paid_amount / d.subtotal) * 100)::int
               ELSE 0
             END AS paid_pct
      FROM deposits d
      LEFT JOIN users u ON u.id = d.created_by
      LEFT JOIN sales s ON s.id = d.sale_id
      WHERE d.organization_id = $1 AND d.branch_id = $2`;
    if (status && status !== 'all') {
      params.push(status);
      sql += ` AND d.status = $${params.length}::deposit_status`;
    }
    if (dateFrom) {
      params.push(dateFrom);
      sql += ` AND (timezone('America/Santiago', d.created_at))::date >= $${params.length}::date`;
    }
    if (dateTo) {
      params.push(dateTo);
      sql += ` AND (timezone('America/Santiago', d.created_at))::date <= $${params.length}::date`;
    }
    if (number) {
      params.push(`%${number}%`);
      sql += ` AND d.deposit_number ILIKE $${params.length}`;
    }
    if (customer) {
      params.push(`%${customer}%`);
      sql += ` AND COALESCE(d.customer_name, '') ILIKE $${params.length}`;
    }
    sql += ` ORDER BY d.created_at DESC`;
    params.push(fetchLimit(limit), offset);
    sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const result = await query(sql, params);
    const page = slicePage(result.rows, limit, offset);
    res.json({
      deposits: page.items,
      hasMore: page.hasMore,
      limit: page.limit,
      offset: page.offset,
      nextOffset: page.nextOffset,
    });
  }),
);

depositsRouter.get(
  '/:id',
  requireRoles('owner', 'branch_manager', 'seller'),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const dep = await query(
      `SELECT d.*,
              u.full_name AS created_by_name,
              s.receipt_number AS sale_receipt_number,
              CASE WHEN d.subtotal > 0
                THEN ROUND((d.paid_amount / d.subtotal) * 100)::int
                ELSE 0
              END AS paid_pct
       FROM deposits d
       LEFT JOIN users u ON u.id = d.created_by
       LEFT JOIN sales s ON s.id = d.sale_id
       WHERE d.id = $1 AND d.organization_id = $2 AND d.branch_id = $3`,
      [id, req.user!.organizationId, req.activeBranchId],
    );
    if (!dep.rows[0]) throw new HttpError(404, 'Abono no encontrado');
    const items = await query(
      `SELECT di.*,
              p.name AS product_name,
              p.internal_code,
              p.barcode,
              p.size_label,
              p.color,
              (SELECT url FROM product_photos ph
               WHERE ph.product_id = p.id ORDER BY sort_order LIMIT 1) AS photo_url
       FROM deposit_items di
       JOIN products p ON p.id = di.product_id
       WHERE di.deposit_id = $1
       ORDER BY di.created_at`,
      [id],
    );
    const payments = await query(
      `SELECT * FROM deposit_payments WHERE deposit_id = $1 ORDER BY created_at`,
      [id],
    );
    res.json({ deposit: dep.rows[0], items: items.rows, payments: payments.rows });
  }),
);

depositsRouter.post(
  '/',
  requireRoles('owner', 'branch_manager', 'seller'),
  asyncHandler(async (req, res) => {
    const body = createDepositBodySchema.parse(req.body);
    await assertUserCanUsePos(req.user!, body.posId, req.activeBranchId!);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await createDepositWithClient(client, {
        organizationId: req.user!.organizationId,
        branchId: req.activeBranchId!,
        userId: req.user!.id,
        body,
      });
      await client.query('COMMIT');
      res.status(201).json(result);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }),
);

depositsRouter.post(
  '/:id/complete',
  requireRoles('owner', 'branch_manager', 'seller'),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = completeDepositBodySchema.parse(req.body ?? {});
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await completeDepositWithClient(client, {
        organizationId: req.user!.organizationId,
        branchId: req.activeBranchId!,
        userId: req.user!.id,
        depositId: id,
        body,
      });
      await client.query('COMMIT');
      res.json(result);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }),
);

depositsRouter.post(
  '/:id/cancel',
  requireRoles('owner', 'branch_manager', 'seller'),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await cancelDepositWithClient(client, {
        organizationId: req.user!.organizationId,
        branchId: req.activeBranchId!,
        userId: req.user!.id,
        depositId: id,
      });
      await client.query('COMMIT');
      res.json(result);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }),
);
