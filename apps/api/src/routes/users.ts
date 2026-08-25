import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { assertCanResetUserPassword } from '../auth/roles.js';
import { pool, query } from '../db/pool.js';
import { isOrgOwner, requireAuth, requireBranch, requireRoles, type AuthUser } from '../middleware/auth.js';
import { asyncHandler, HttpError, isUniqueViolation } from '../utils/errors.js';

export const usersRouter = Router();
usersRouter.use(requireAuth, requireBranch, requireRoles('owner'));

const roleSchema = z.enum(['owner', 'branch_manager', 'seller']);
const assignmentSchema = z.object({
  branchId: z.string().uuid(),
  role: roleSchema,
  posIds: z.array(z.string().uuid()).default([]),
});

const VISIBLE_USERS = `COALESCE(u.is_superadmin, false) = false`;

async function countOtherActiveOwners(organizationId: string, excludeUserId: string) {
  const res = await query<{ n: string }>(
    `SELECT COUNT(DISTINCT u.id)::text AS n
     FROM users u
     JOIN user_branches ub ON ub.user_id = u.id AND ub.role = 'owner'
     WHERE u.organization_id = $1
       AND u.is_active = true
       AND u.id <> $2
       AND COALESCE(u.is_superadmin, false) = false`,
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
    throw new HttpError(400, 'Debe quedar al menos una persona con rol Administrador/a activa');
  }
}

async function loadVisibleTarget(userId: string, organizationId: string) {
  const res = await query<{
    id: string;
    is_active: boolean;
    is_owner: boolean;
    is_superadmin: boolean;
  }>(
    `SELECT u.id, u.is_active,
            EXISTS (
              SELECT 1 FROM user_branches ub
              WHERE ub.user_id = u.id AND ub.role = 'owner'
            ) AS is_owner,
            COALESCE(u.is_superadmin, false) AS is_superadmin
     FROM users u
     WHERE u.id = $1 AND u.organization_id = $2`,
    [userId, organizationId],
  );
  const row = res.rows[0];
  if (!row || row.is_superadmin) return null;
  return row;
}

function actorResetContext(req: { user?: AuthUser }) {
  const u = req.user!;
  return {
    id: u.id,
    isSuperadmin: Boolean(u.isSuperadmin),
    isOwner: isOrgOwner(u),
  };
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

async function setTemporaryPassword(userId: string, password: string) {
  const hash = await bcrypt.hash(password, 10);
  await query(
    `UPDATE users
     SET password_hash = $1,
         must_change_password = true,
         password_changed_at = NULL,
         updated_at = now()
     WHERE id = $2`,
    [hash, userId],
  );
}

usersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT u.id, u.email, u.full_name, u.is_active, u.created_at,
              COALESCE(u.must_change_password, false) AS must_change_password,
              u.password_changed_at,
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
         AND ${VISIBLE_USERS}
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
        `INSERT INTO users (
           organization_id, email, password_hash, full_name,
           must_change_password, password_changed_at, is_superadmin
         ) VALUES ($1,$2,$3,$4,true,NULL,false)
         RETURNING id, email, full_name, is_active, created_at,
                   must_change_password, password_changed_at`,
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

/**
 * Restablece contraseña temporal. Fuerza must_change_password.
 * Reglas: solo superadmin → admin (owner); admin → vendedoras/encargadas.
 */
usersRouter.post(
  '/:id/reset-password',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
      })
      .parse(req.body);

    const target = await loadVisibleTarget(id, req.user!.organizationId);
    if (!target) throw new HttpError(404, 'Usuario no encontrado');

    assertCanResetUserPassword(actorResetContext(req), {
      id: target.id,
      isSuperadmin: false,
      isOwner: Boolean(target.is_owner),
    });

    await setTemporaryPassword(id, body.password);
    res.json({
      ok: true,
      message: 'Contraseña restablecida. La usuaria deberá crear una nueva al ingresar.',
      userId: id,
      mustChangePassword: true,
    });
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

    const row = await loadVisibleTarget(id, req.user!.organizationId);
    if (!row) throw new HttpError(404, 'Usuario no encontrado');

    if (body.isActive === false) {
      await assertOrgKeepsOwner({
        organizationId: req.user!.organizationId,
        targetUserId: id,
        nextIsActive: false,
        nextHasOwnerRole: row.is_owner,
      });
    }

    if (body.password) {
      assertCanResetUserPassword(actorResetContext(req), {
        id: row.id,
        isSuperadmin: false,
        isOwner: Boolean(row.is_owner),
      });
      await setTemporaryPassword(id, body.password);
    }

    try {
      const result = await query(
        `UPDATE users
         SET is_active = COALESCE($1, is_active),
             full_name = COALESCE($2, full_name),
             email = COALESCE($3, email),
             updated_at = now()
         WHERE id = $4 AND organization_id = $5
           AND COALESCE(is_superadmin, false) = false
         RETURNING id, email, full_name, is_active, created_at,
                   must_change_password, password_changed_at`,
        [
          body.isActive ?? null,
          body.fullName ?? null,
          body.email ? body.email.toLowerCase() : null,
          id,
          req.user!.organizationId,
        ],
      );
      if (!result.rows[0]) throw new HttpError(404, 'Usuario no encontrado');
      res.json({ user: result.rows[0] });
    } catch (e) {
      if (e instanceof HttpError) throw e;
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
      throw new HttpError(400, 'No puedes eliminar tu propia cuenta');
    }
    const exists = await loadVisibleTarget(id, req.user!.organizationId);
    if (!exists) throw new HttpError(404, 'Usuario no encontrado');
    await assertOrgKeepsOwner({
      organizationId: req.user!.organizationId,
      targetUserId: id,
      nextIsActive: false,
      nextHasOwnerRole: exists.is_owner,
    });
    const result = await query(
      `UPDATE users SET is_active = false, updated_at = now()
       WHERE id = $1 AND organization_id = $2
         AND COALESCE(is_superadmin, false) = false
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

    const exists = await loadVisibleTarget(id, req.user!.organizationId);
    if (!exists) throw new HttpError(404, 'Usuario no encontrado');

    const nextHasOwnerRole = body.assignments.some((a) => a.role === 'owner');
    if (id === req.user!.id && !nextHasOwnerRole) {
      throw new HttpError(400, 'No puedes quitarte el rol de Administrador/a');
    }
    await assertOrgKeepsOwner({
      organizationId: req.user!.organizationId,
      targetUserId: id,
      nextIsActive: exists.is_active,
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
    const exists = await loadVisibleTarget(userId, req.user!.organizationId);
    if (!exists) throw new HttpError(404, 'Usuario no encontrado');

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
        throw new HttpError(400, 'No puedes quitarte el rol de Administrador/a');
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
