import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { isOrgOwner, requireAuth, requireBranch, requireRoles } from '../middleware/auth.js';
import { asyncHandler, HttpError, isUniqueViolation } from '../utils/errors.js';

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
  requireBranch,
  requireRoles('owner'),
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT b.*,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', p.id,
                    'code', p.code,
                    'name', p.name,
                    'status', p.status
                  ) ORDER BY p.name
                ) FILTER (WHERE p.id IS NOT NULL),
                '[]'::json
              ) AS pos_terminals
       FROM branches b
       LEFT JOIN pos_terminals p ON p.branch_id = b.id
       WHERE b.organization_id = $1
       GROUP BY b.id
       ORDER BY b.is_active DESC, b.name`,
      [req.user!.organizationId],
    );
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
    try {
      const result = await query(
        `INSERT INTO branches (organization_id, code, name, city, address)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [req.user!.organizationId, body.code, body.name, body.city ?? null, body.address ?? null],
      );
      res.status(201).json({ branch: result.rows[0] });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new HttpError(409, 'Ya existe una sucursal con ese código');
      }
      throw e;
    }
  }),
);

catalogRouter.patch(
  '/branches/:id',
  requireBranch,
  requireRoles('owner'),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        code: z.string().trim().min(1).max(32).optional(),
        name: z.string().trim().min(1).max(120).optional(),
        city: z.string().trim().max(80).optional().nullable(),
        address: z.string().trim().max(200).optional().nullable(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body);
    if (
      body.code === undefined &&
      body.name === undefined &&
      body.city === undefined &&
      body.address === undefined &&
      body.isActive === undefined
    ) {
      throw new HttpError(400, 'No hay cambios para aplicar');
    }

    const exists = await query<{ id: string; is_active: boolean }>(
      `SELECT id, is_active FROM branches WHERE id = $1 AND organization_id = $2`,
      [id, req.user!.organizationId],
    );
    if (!exists.rows[0]) throw new HttpError(404, 'Sucursal no encontrada');

    if (body.isActive === false) {
      const others = await query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM branches
         WHERE organization_id = $1 AND is_active = true AND id <> $2`,
        [req.user!.organizationId, id],
      );
      if (Number(others.rows[0]?.n || 0) < 1) {
        throw new HttpError(400, 'Debe quedar al menos una sucursal activa');
      }
    }

    try {
      const result = await query(
        `UPDATE branches SET
           code = COALESCE($1, code),
           name = COALESCE($2, name),
           city = CASE WHEN $3::boolean THEN $4 ELSE city END,
           address = CASE WHEN $5::boolean THEN $6 ELSE address END,
           is_active = COALESCE($7, is_active),
           updated_at = now()
         WHERE id = $8 AND organization_id = $9
         RETURNING *`,
        [
          body.code ?? null,
          body.name ?? null,
          body.city !== undefined,
          body.city ?? null,
          body.address !== undefined,
          body.address ?? null,
          body.isActive ?? null,
          id,
          req.user!.organizationId,
        ],
      );
      res.json({ branch: result.rows[0] });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new HttpError(409, 'Ya existe una sucursal con ese código');
      }
      throw e;
    }
  }),
);

catalogRouter.get(
  '/pos',
  requireBranch,
  requireRoles('owner'),
  asyncHandler(async (req, res) => {
    const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
    if (branchId) {
      const parsed = z.string().uuid().safeParse(branchId);
      if (!parsed.success) throw new HttpError(400, 'Sucursal inválida');
    }
    const result = await query(
      `SELECT p.*, b.name AS branch_name, b.code AS branch_code, b.id AS branch_id
       FROM pos_terminals p
       JOIN branches b ON b.id = p.branch_id
       WHERE b.organization_id = $1
         AND ($2::uuid IS NULL OR p.branch_id = $2)
       ORDER BY b.name, p.name`,
      [req.user!.organizationId, branchId ?? null],
    );
    res.json({ pos: result.rows });
  }),
);

catalogRouter.post(
  '/pos',
  requireBranch,
  requireRoles('owner'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        branchId: z.string().uuid(),
        code: z.string().min(1),
        name: z.string().min(1),
      })
      .parse(req.body);

    const branch = await query<{ id: string; name: string }>(
      `SELECT id, name FROM branches WHERE id = $1 AND organization_id = $2`,
      [body.branchId, req.user!.organizationId],
    );
    if (!branch.rows[0]) throw new HttpError(404, 'Sucursal no encontrada');

    const access = req.user!.branches.find((b) => b.branchId === body.branchId);
    const owner = isOrgOwner(req.user!);
    if (!owner && access?.role !== 'owner') {
      throw new HttpError(403, 'Sin permiso para crear cajas en esa sucursal');
    }

    try {
      const result = await query(
        `INSERT INTO pos_terminals (branch_id, code, name) VALUES ($1,$2,$3) RETURNING *`,
        [body.branchId, body.code, body.name],
      );
      res.status(201).json({ pos: result.rows[0], branch: branch.rows[0] });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new HttpError(409, 'Ya existe una caja con ese código en la sucursal');
      }
      throw e;
    }
  }),
);

catalogRouter.patch(
  '/pos/:id',
  requireBranch,
  requireRoles('owner'),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        code: z.string().trim().min(1).max(32).optional(),
        name: z.string().trim().min(1).max(120).optional(),
        status: z.enum(['active', 'inactive']).optional(),
      })
      .parse(req.body);
    if (body.code === undefined && body.name === undefined && body.status === undefined) {
      throw new HttpError(400, 'No hay cambios para aplicar');
    }

    const current = await query<{ id: string }>(
      `SELECT p.id
       FROM pos_terminals p
       JOIN branches b ON b.id = p.branch_id
       WHERE p.id = $1 AND b.organization_id = $2`,
      [id, req.user!.organizationId],
    );
    if (!current.rows[0]) throw new HttpError(404, 'Caja no encontrada');

    try {
      const result = await query(
        `UPDATE pos_terminals SET
           code = COALESCE($1, code),
           name = COALESCE($2, name),
           status = COALESCE($3::pos_status, status),
           updated_at = now()
         WHERE id = $4
         RETURNING *`,
        [body.code ?? null, body.name ?? null, body.status ?? null, id],
      );
      res.json({ pos: result.rows[0] });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new HttpError(409, 'Ya existe una caja con ese código en la sucursal');
      }
      throw e;
    }
  }),
);
