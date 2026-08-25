import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db/pool.js';
import {
  loadUser,
  requireAuth,
  signToken,
  resolveSessionTtl,
  isOrgOwner,
  type AuthUser,
} from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../utils/errors.js';

export const authRouter = Router();

const sessionClientSchema = z.object({
  /** App instalada (standalone móvil). El web no debe enviar esto en Chrome de escritorio. */
  client: z.enum(['pwa', 'web']).optional(),
  persistent: z.boolean().optional(),
});

function publicUser(user: AuthUser) {
  return {
    id: user.id,
    organizationId: user.organizationId,
    email: user.email,
    fullName: user.fullName,
    branches: user.branches,
    mustChangePassword: user.mustChangePassword,
    isSuperadmin: user.isSuperadmin,
  };
}

function issueSession(user: { id: string; organizationId: string }, hints: z.infer<typeof sessionClientSchema>) {
  const { persistent, expiresIn } = resolveSessionTtl(hints);
  const token = signToken({ id: user.id, organizationId: user.organizationId }, { expiresIn });
  return { token, persistent, expiresIn };
}

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(1),
      })
      .merge(sessionClientSchema)
      .parse(req.body);
    const result = await query<{ id: string; password_hash: string; organization_id: string }>(
      'SELECT id, password_hash, organization_id FROM users WHERE email = $1 AND is_active = true',
      [body.email.toLowerCase()],
    );
    const row = result.rows[0];
    if (!row || !(await bcrypt.compare(body.password, row.password_hash))) {
      throw new HttpError(401, 'Credenciales inválidas');
    }
    const user = await loadUser(row.id);
    if (!user) throw new HttpError(401, 'Usuario inválido');
    const session = issueSession(user, body);
    res.json({
      ...session,
      user: publicUser(user),
      mustChangePassword: user.mustChangePassword,
    });
  }),
);

/** Reemite JWT. PWA envía client/persistent; escritorio no (sigue 12 h). */
authRouter.post(
  '/refresh',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = sessionClientSchema.parse(req.body ?? {});
    const user = req.user!;
    const session = issueSession(user, body);
    res.json({
      ...session,
      user: publicUser(user),
      mustChangePassword: user.mustChangePassword,
    });
  }),
);

/**
 * Primer ingreso / cambio voluntario autenticado.
 * Limpia must_change_password y setea password_changed_at.
 */
authRouter.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        currentPassword: z.string().min(1, 'Indica tu contraseña actual'),
        newPassword: z.string().min(6, 'La nueva contraseña debe tener al menos 6 caracteres'),
      })
      .parse(req.body);

    if (body.currentPassword === body.newPassword) {
      throw new HttpError(400, 'La nueva contraseña debe ser distinta a la actual');
    }

    const row = await query<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id = $1 AND is_active = true`,
      [req.user!.id],
    );
    if (!row.rows[0]) throw new HttpError(401, 'Usuario inválido');
    if (!(await bcrypt.compare(body.currentPassword, row.rows[0].password_hash))) {
      throw new HttpError(400, 'La contraseña actual no es correcta');
    }

    const hash = await bcrypt.hash(body.newPassword, 10);
    await query(
      `UPDATE users
       SET password_hash = $1,
           must_change_password = false,
           password_changed_at = now(),
           updated_at = now()
       WHERE id = $2`,
      [hash, req.user!.id],
    );

    const user = await loadUser(req.user!.id);
    if (!user) throw new HttpError(401, 'Usuario inválido');
    res.json({
      ok: true,
      message: 'Contraseña actualizada',
      user: publicUser(user),
      mustChangePassword: false,
    });
  }),
);

/** Ya no hay “olvidé mi contraseña” público. Solo admin/soporte restablece. */
authRouter.post(
  '/forgot-password',
  asyncHandler(async (_req, res) => {
    res.status(410).json({
      error: 'No hay recuperación pública. Pide a la administración que restablezca tu contraseña.',
    });
  }),
);

authRouter.post(
  '/reset-password',
  asyncHandler(async (_req, res) => {
    res.status(410).json({
      error: 'No hay recuperación pública. Pide a la administración que restablezca tu contraseña.',
    });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({
      user: publicUser(req.user!),
      mustChangePassword: req.user!.mustChangePassword,
    });
  }),
);

authRouter.patch(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        fullName: z.string().trim().min(1).max(120).optional(),
        password: z.string().min(6).optional(),
        currentPassword: z.string().min(1).optional(),
      })
      .parse(req.body);
    if (body.fullName === undefined && body.password === undefined) {
      throw new HttpError(400, 'No hay cambios para aplicar');
    }
    if (body.password) {
      if (!body.currentPassword) {
        throw new HttpError(400, 'Indica tu contraseña actual');
      }
      const row = await query<{ password_hash: string }>(
        `SELECT password_hash FROM users WHERE id = $1`,
        [req.user!.id],
      );
      if (!row.rows[0] || !(await bcrypt.compare(body.currentPassword, row.rows[0].password_hash))) {
        throw new HttpError(400, 'La contraseña actual no es correcta');
      }
      if (body.currentPassword === body.password) {
        throw new HttpError(400, 'La nueva contraseña debe ser distinta a la actual');
      }
      const hash = await bcrypt.hash(body.password, 10);
      await query(
        `UPDATE users
         SET password_hash = $1,
             must_change_password = false,
             password_changed_at = now(),
             updated_at = now()
         WHERE id = $2`,
        [hash, req.user!.id],
      );
    }
    if (body.fullName !== undefined) {
      await query(`UPDATE users SET full_name = $1, updated_at = now() WHERE id = $2`, [
        body.fullName,
        req.user!.id,
      ]);
    }
    const user = await loadUser(req.user!.id);
    if (!user) throw new HttpError(401, 'Usuario inválido');
    res.json({ user: publicUser(user), mustChangePassword: user.mustChangePassword });
  }),
);

authRouter.get(
  '/context/branches',
  requireAuth,
  asyncHandler(async (req, res) => {
    const owner = isOrgOwner(req.user!);
    if (!owner && !req.user!.branches.length) return res.json({ branches: [] });

    const result = owner
      ? await query(
          `SELECT b.*, json_agg(json_build_object('id', p.id, 'code', p.code, 'name', p.name, 'status', p.status)
             ORDER BY p.name)
             FILTER (WHERE p.id IS NOT NULL) AS pos_terminals
           FROM branches b
           LEFT JOIN pos_terminals p ON p.branch_id = b.id AND p.status = 'active'
           WHERE b.organization_id = $1 AND b.is_active = true
           GROUP BY b.id
           ORDER BY b.name`,
          [req.user!.organizationId],
        )
      : await query(
          `SELECT b.*, json_agg(json_build_object('id', p.id, 'code', p.code, 'name', p.name, 'status', p.status)
             ORDER BY p.name)
             FILTER (WHERE p.id IS NOT NULL) AS pos_terminals
           FROM branches b
           JOIN user_branches ub ON ub.branch_id = b.id AND ub.user_id = $2
           LEFT JOIN pos_terminals p
             ON p.branch_id = b.id AND p.status = 'active'
            AND EXISTS (SELECT 1 FROM user_pos up WHERE up.user_id = $2 AND up.pos_id = p.id)
           WHERE b.organization_id = $1 AND b.is_active = true
             AND b.id = ANY($3::uuid[])
           GROUP BY b.id
           ORDER BY b.name`,
          [
            req.user!.organizationId,
            req.user!.id,
            req.user!.branches.map((b) => b.branchId),
          ],
        );

    const branches = result.rows.map((b) => ({
      ...b,
      role: owner
        ? 'owner'
        : req.user!.branches.find((x) => x.branchId === b.id)?.role,
    }));
    res.json({ branches });
  }),
);
