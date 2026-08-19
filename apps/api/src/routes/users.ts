import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool, query } from '../db/pool.js';
import { requireAuth, requireBranch, requireRoles } from '../middleware/auth.js';
import { asyncHandler, HttpError, isUniqueViolation } from '../utils/errors.js';

export const usersRouter = Router();
usersRouter.use(requireAuth, requireBranch, requireRoles('owner'));

const roleSchema = z.enum(['owner', 'branch_manager', 'seller']);
const assignmentSchema = z.object({
  branchId: z.string().uuid(),
  role: roleSchema,
  posIds: z.array(z.string().uuid()).default([]),
});

async function countOtherActiveOwners(organizationId: string, excludeUserId: string) {
  const res = await query<{ n: string }>(
    `SELECT COUNT(DISTINCT u.id)::text AS n
     FROM users u
     JOIN user_branches ub ON ub.user_id = u.id AND ub.role = 'owner'
     WHERE u.organization_id = $1 AND u.is_active = true AND u.id <> $2`,
    [organizationId, excludeUserId],
  );
  return Number(res.rows[0]?.n || 0);
}

async function assertOrgKeepsOwner(opts: {
  organizationId: string;
  targetUserId: string;
  nextIsActive: boolean;
  nextHasOwnerRole: boolean;
}) {
  const others = await countOtherActiveOwners(opts.organizationId, opts.targetUserId);
  const selfCounts = opts.nextIsActive && opts.nextHasOwnerRole;
  if (others + (selfCounts ? 1 : 0) < 1) {
    throw new HttpError(400, 'Debe quedar al menos una propietaria activa');
  }
}

async function loadOrgBranches(organizationId: string) {
  const res = await query<{ id: string }>(
    `SELECT id FROM branches WHERE organization_id = $1`,
    [organizationId],
  );
  return new Set(res.rows.map((r) => r.id));
}

async function posByBranch(organizationId: string) {
  const res = await query<{ id: string; branch_id: string }>(
    `SELECT p.id, p.branch_id
     FROM pos_terminals p
     JOIN branches b ON b.id = p.branch_id
     WHERE b.organization_id = $1`,
    [organizationId],
  );
  const map = new Map<string, string>();
  for (const row of res.rows) map.set(row.id, row.branch_id);
  return map;
}

async function replaceUserAccess(
  userId: string,
  organizationId: string,
  assignments: z.infer<typeof assignmentSchema>[],
) {
  const orgBranches = await loadOrgBranches(organizationId);
  const posMap = await posByBranch(organizationId);
  for (const a of assignments) {
    if (!orgBranches.has(a.branchId)) throw new HttpError(404, 'Sucursal no encontrada');
    for (const posId of a.posIds) {
      const branchId = posMap.get(posId);
      if (!branchId) throw new HttpError(404, 'Caja no encontrada');
      if (branchId !== a.branchId) {
        throw new HttpError(400, 'La caja no pertenece a esa sucursal');
      }
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM user_pos WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM user_branches WHERE user_id = $1`, [userId]);
    for (const a of assignments) {
      await client.query(
        `INSERT INTO user_branches (user_id, branch_id, role) VALUES ($1,$2,$3)`,
        [userId, a.branchId, a.role],
      );
      if (a.role === 'owner') continue;
      for (const posId of a.posIds) {
        await client.query(
          `INSERT INTO user_pos (user_id, pos_id) VALUES ($1,$2) ON CONFLICT (user_id, pos_id) DO NOTHING`,
          [userId, posId],
        );
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

usersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT u.id, u.email, u.full_name, u.is_active, u.created_at,
              COALESCE(
                json_agg(
                  json_build_object(
                    'branchId', ub.branch_id,
                    'role', ub.role,
                    'branchName', b.name
                  )
                  ORDER BY b.name
                ) FILTER (WHERE ub.branch_id IS NOT NULL),
                '[]'::json
              ) AS branches,
              COALESCE(
                (
                  SELECT json_agg(
                    json_build_object(
                      'posId', p.id,
                      'posName', p.name,
                      'branchId', p.branch_id,
                      'branchName', br.name
                    )
                    ORDER BY br.name, p.name
                  )
                  FROM user_pos up
                  JOIN pos_terminals p ON p.id = up.pos_id
                  JOIN branches br ON br.id = p.branch_id
                  WHERE up.user_id = u.id
                ),
                '[]'::json
              ) AS pos
       FROM users u
       LEFT JOIN user_branches ub ON ub.user_id = u.id
       LEFT JOIN branches b ON b.id = ub.branch_id
       WHERE u.organization_id = $1
       GROUP BY u.id
       ORDER BY u.is_active DESC, u.full_name`,
      [req.user!.organizationId],
    );
    res.json({ users: result.rows });
  }),
);

usersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(6),
        fullName: z.string().min(1),
        branchId: z.string().uuid().optional(),
        role: roleSchema.optional(),
        posIds: z.array(z.string().uuid()).optional(),
        assignments: z.array(assignmentSchema).optional(),
      })
      .parse(req.body);

    const assignments =
      body.assignments && body.assignments.length
        ? body.assignments
        : body.branchId && body.role
          ? [{ branchId: body.branchId, role: body.role, posIds: body.posIds ?? [] }]
          : [];
    if (!assignments.length) {
      throw new HttpError(400, 'Asigna al menos una sucursal');
    }

    const hash = await bcrypt.hash(body.password, 10);
    let user;
    try {
      const userRes = await query(
        `INSERT INTO users (organization_id, email, password_hash, full_name)
         VALUES ($1,$2,$3,$4) RETURNING id, email, full_name, is_active, created_at`,
        [req.user!.organizationId, body.email.toLowerCase(), hash, body.fullName],
      );
      user = userRes.rows[0];
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new HttpError(409, 'El email ya está registrado');
      }
      throw e;
    }

    try {
      await replaceUserAccess(user.id, req.user!.organizationId, assignments);
    } catch (e) {
      await query(`DELETE FROM users WHERE id = $1`, [user.id]);
      throw e;
    }
    res.status(201).json({ user });
  }),
);

usersRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        isActive: z.boolean().optional(),
        fullName: z.string().trim().min(1).max(120).optional(),
        email: z.string().email().optional(),
        password: z.string().min(6).optional(),
      })
      .parse(req.body);

    if (
      body.isActive === undefined &&
      body.fullName === undefined &&
      body.email === undefined &&
      body.password === undefined
    ) {
      throw new HttpError(400, 'No hay cambios para aplicar');
    }

    if (body.isActive === false && id === req.user!.id) {
      throw new HttpError(400, 'No puedes desactivar tu propia cuenta');
    }

    const exists = await query<{ id: string; is_active: boolean }>(
      `SELECT u.id, u.is_active,
              EXISTS (
                SELECT 1 FROM user_branches ub
                WHERE ub.user_id = u.id AND ub.role = 'owner'
              ) AS is_owner
       FROM users u
       WHERE u.id = $1 AND u.organization_id = $2`,
      [id, req.user!.organizationId],
    );
    const row = exists.rows[0] as { id: string; is_active: boolean; is_owner: boolean } | undefined;
    if (!row) throw new HttpError(404, 'Usuaria no encontrada');

    if (body.isActive === false) {
      await assertOrgKeepsOwner({
        organizationId: req.user!.organizationId,
        targetUserId: id,
        nextIsActive: false,
        nextHasOwnerRole: row.is_owner,
      });
    }

    if (body.password) {
      const hash = await bcrypt.hash(body.password, 10);
      await query(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`, [hash, id]);
    }

    try {
      const result = await query(
        `UPDATE users
         SET is_active = COALESCE($1, is_active),
             full_name = COALESCE($2, full_name),
             email = COALESCE($3, email),
             updated_at = now()
         WHERE id = $4 AND organization_id = $5
         RETURNING id, email, full_name, is_active, created_at`,
        [
          body.isActive ?? null,
          body.fullName ?? null,
          body.email ? body.email.toLowerCase() : null,
          id,
          req.user!.organizationId,
        ],
      );
      res.json({ user: result.rows[0] });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new HttpError(409, 'El email ya está registrado');
      }
      throw e;
    }
  }),
);

usersRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    if (id === req.user!.id) {
      throw new HttpError(400, 'No puedes eliminarte a ti misma');
    }
    const exists = await query<{ id: string; is_owner: boolean }>(
      `SELECT u.id,
              EXISTS (
                SELECT 1 FROM user_branches ub
                WHERE ub.user_id = u.id AND ub.role = 'owner'
              ) AS is_owner
       FROM users u
       WHERE u.id = $1 AND u.organization_id = $2`,
      [id, req.user!.organizationId],
    );
    if (!exists.rows[0]) throw new HttpError(404, 'Usuaria no encontrada');
    await assertOrgKeepsOwner({
      organizationId: req.user!.organizationId,
      targetUserId: id,
      nextIsActive: false,
      nextHasOwnerRole: exists.rows[0].is_owner,
    });
    const result = await query(
      `UPDATE users SET is_active = false, updated_at = now()
       WHERE id = $1 AND organization_id = $2
       RETURNING id, email, full_name, is_active`,
      [id, req.user!.organizationId],
    );
    res.json({ user: result.rows[0] });
  }),
);

usersRouter.put(
  '/:id/access',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = z.object({ assignments: z.array(assignmentSchema) }).parse(req.body);

    const exists = await query<{ id: string; is_active: boolean }>(
      `SELECT id, is_active FROM users WHERE id = $1 AND organization_id = $2`,
      [id, req.user!.organizationId],
    );
    if (!exists.rows[0]) throw new HttpError(404, 'Usuaria no encontrada');

    const nextHasOwnerRole = body.assignments.some((a) => a.role === 'owner');
    if (id === req.user!.id && !nextHasOwnerRole) {
      throw new HttpError(400, 'No puedes quitarte el rol de propietaria');
    }
    await assertOrgKeepsOwner({
      organizationId: req.user!.organizationId,
      targetUserId: id,
      nextIsActive: exists.rows[0].is_active,
      nextHasOwnerRole,
    });

    await replaceUserAccess(id, req.user!.organizationId, body.assignments);
    res.json({ ok: true });
  }),
);

usersRouter.post(
  '/:id/branches',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        branchId: z.string().uuid(),
        role: roleSchema,
      })
      .parse(req.body);
    const userId = z.string().uuid().parse(req.params.id);
    const exists = await query<{ id: string; is_active: boolean }>(
      'SELECT id, is_active FROM users WHERE id = $1 AND organization_id = $2',
      [userId, req.user!.organizationId],
    );
    if (!exists.rows[0]) throw new HttpError(404, 'Usuaria no encontrada');

    const branch = await query<{ id: string }>(
      `SELECT id FROM branches WHERE id = $1 AND organization_id = $2`,
      [body.branchId, req.user!.organizationId],
    );
    if (!branch.rows[0]) throw new HttpError(404, 'Sucursal no encontrada');

    if (userId === req.user!.id && body.role !== 'owner') {
      const current = await query<{ role: string }>(
        `SELECT role FROM user_branches WHERE user_id = $1 AND branch_id = $2`,
        [userId, body.branchId],
      );
      if (current.rows[0]?.role === 'owner') {
        throw new HttpError(400, 'No puedes quitarte el rol de propietaria');
      }
    }

    await query(
      `INSERT INTO user_branches (user_id, branch_id, role) VALUES ($1,$2,$3)
       ON CONFLICT (user_id, branch_id) DO UPDATE SET role = EXCLUDED.role`,
      [userId, body.branchId, body.role],
    );
    res.json({ ok: true });
  }),
);
