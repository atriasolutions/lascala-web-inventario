import { Router } from 'express';
import { z } from 'zod';
import { pool, query } from '../db/pool.js';
import { requireAuth, requireBranch, requireRoles } from '../middleware/auth.js';
import { applyStockDeltaWithClient } from '../services/inventory.js';
import { asyncHandler, HttpError } from '../utils/errors.js';

export const opsRouter = Router();
opsRouter.use(requireAuth, requireBranch);

opsRouter.get(
  '/mermas',
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT m.*, p.name AS product_name, p.internal_code, u.full_name AS created_by_name
       FROM mermas m
       JOIN products p ON p.id = m.product_id
       LEFT JOIN users u ON u.id = m.created_by
       WHERE m.branch_id = $1
       ORDER BY m.created_at DESC`,
      [req.activeBranchId],
    );
    res.json({ mermas: result.rows });
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
        reason: z.string().min(1),
      })
      .parse(req.body);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const prod = await client.query<{ cost_price: string }>(
        'SELECT cost_price FROM products WHERE id = $1 AND organization_id = $2',
        [body.productId, req.user!.organizationId],
      );
      if (!prod.rows[0]) throw new HttpError(404, 'Producto no encontrado');
      const costImpact = Number(prod.rows[0].cost_price) * body.quantity;
      const merma = await client.query(
        `INSERT INTO mermas (organization_id, branch_id, product_id, quantity, reason, cost_impact, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [
          req.user!.organizationId,
          req.activeBranchId,
          body.productId,
          body.quantity,
          body.reason,
          costImpact,
          req.user!.id,
        ],
      );
      await applyStockDeltaWithClient(client, {
        organizationId: req.user!.organizationId,
        branchId: req.activeBranchId!,
        productId: body.productId,
        delta: -body.quantity,
        movementType: 'MERMA_OUT',
        referenceType: 'merma',
        referenceId: merma.rows[0].id,
        userId: req.user!.id,
        notes: body.reason,
      });
      await client.query(`UPDATE products SET status = 'merma', updated_at = now() WHERE id = $1`, [
        body.productId,
      ]);
      await client.query('COMMIT');
      res.status(201).json({ merma: merma.rows[0] });
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
    const result = await query(
      `SELECT v.*, p.name AS product_name
       FROM change_vouchers v
       JOIN products p ON p.id = v.product_id
       WHERE v.branch_id = $1
       ORDER BY v.created_at DESC`,
      [req.activeBranchId],
    );
    res.json({ vouchers: result.rows });
  }),
);

opsRouter.get(
  '/expenses',
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT * FROM expenses WHERE branch_id = $1 ORDER BY incurred_on DESC, created_at DESC`,
      [req.activeBranchId],
    );
    res.json({ expenses: result.rows });
  }),
);

opsRouter.post(
  '/expenses',
  requireRoles('owner', 'branch_manager'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        category: z.string().min(1),
        description: z.string().min(1),
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
