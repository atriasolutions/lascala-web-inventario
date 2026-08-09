import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireAuth, requireBranch, requireRoles } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../utils/errors.js';

export const catalogRouter = Router();
catalogRouter.use(requireAuth);

catalogRouter.get(
  '/categories',
  asyncHandler(async (req, res) => {
    const result = await query(
      'SELECT * FROM categories WHERE organization_id = $1 ORDER BY sort_order, name',
      [req.user!.organizationId],
    );
    res.json({ categories: result.rows });
  }),
);

catalogRouter.post(
  '/categories',
  requireBranch,
  requireRoles('owner', 'branch_manager'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1),
        slug: z.string().min(1),
        allowsExchangeDefault: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
      })
      .parse(req.body);
    const result = await query(
      `INSERT INTO categories (organization_id, name, slug, allows_exchange_default, sort_order)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [
        req.user!.organizationId,
        body.name,
        body.slug,
        body.allowsExchangeDefault ?? true,
        body.sortOrder ?? 0,
      ],
    );
    res.status(201).json({ category: result.rows[0] });
  }),
);

catalogRouter.get(
  '/suppliers',
  asyncHandler(async (req, res) => {
    const result = await query(
      'SELECT * FROM suppliers WHERE organization_id = $1 ORDER BY name',
      [req.user!.organizationId],
    );
    res.json({ suppliers: result.rows });
  }),
);

catalogRouter.post(
  '/suppliers',
  requireBranch,
  requireRoles('owner', 'branch_manager', 'seller'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1),
        contactName: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional().or(z.literal('')),
        notes: z.string().optional(),
      })
      .parse(req.body);
    const result = await query(
      `INSERT INTO suppliers (organization_id, name, contact_name, phone, email, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        req.user!.organizationId,
        body.name,
        body.contactName ?? null,
        body.phone ?? null,
        body.email || null,
        body.notes ?? null,
      ],
    );
    res.status(201).json({ supplier: result.rows[0] });
  }),
);

catalogRouter.get(
  '/settings',
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT * FROM system_settings WHERE organization_id = $1 AND (branch_id IS NULL OR branch_id = $2)`,
      [req.user!.organizationId, req.activeBranchId ?? null],
    );
    res.json({ settings: result.rows });
  }),
);

catalogRouter.get(
  '/branches',
  requireRoles('owner'),
  requireBranch,
  asyncHandler(async (req, res) => {
    const result = await query('SELECT * FROM branches WHERE organization_id = $1 ORDER BY name', [
      req.user!.organizationId,
    ]);
    res.json({ branches: result.rows });
  }),
);

catalogRouter.post(
  '/branches',
  requireBranch,
  requireRoles('owner'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        code: z.string().min(1),
        name: z.string().min(1),
        city: z.string().optional(),
        address: z.string().optional(),
      })
      .parse(req.body);
    const result = await query(
      `INSERT INTO branches (organization_id, code, name, city, address)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user!.organizationId, body.code, body.name, body.city ?? null, body.address ?? null],
    );
    res.status(201).json({ branch: result.rows[0] });
  }),
);

catalogRouter.post(
  '/pos',
  requireBranch,
  requireRoles('owner', 'branch_manager'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        branchId: z.string().uuid(),
        code: z.string().min(1),
        name: z.string().min(1),
      })
      .parse(req.body);
    if (!req.user!.branches.some((b) => b.branchId === body.branchId)) {
      throw new HttpError(403, 'Sin acceso a la sucursal');
    }
    const result = await query(
      `INSERT INTO pos_terminals (branch_id, code, name) VALUES ($1,$2,$3) RETURNING *`,
      [body.branchId, body.code, body.name],
    );
    res.status(201).json({ pos: result.rows[0] });
  }),
);
