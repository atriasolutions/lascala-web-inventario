import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireAuth, requireBranch, requireRoles } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../utils/errors.js';

export const usersRouter = Router();
usersRouter.use(requireAuth, requireBranch, requireRoles('owner'));

usersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT u.id, u.email, u.full_name, u.is_active, u.created_at,
              json_agg(json_build_object('branchId', ub.branch_id, 'role', ub.role, 'branchName', b.name))
                AS branches
       FROM users u
       LEFT JOIN user_branches ub ON ub.user_id = u.id
       LEFT JOIN branches b ON b.id = ub.branch_id
       WHERE u.organization_id = $1
       GROUP BY u.id
       ORDER BY u.full_name`,
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
        branchId: z.string().uuid(),
        role: z.enum(['owner', 'branch_manager', 'seller']),
      })
      .parse(req.body);

    const hash = await bcrypt.hash(body.password, 10);
    const userRes = await query(
      `INSERT INTO users (organization_id, email, password_hash, full_name)
       VALUES ($1,$2,$3,$4) RETURNING id, email, full_name, is_active, created_at`,
      [req.user!.organizationId, body.email.toLowerCase(), hash, body.fullName],
    );
    const user = userRes.rows[0];
    await query(`INSERT INTO user_branches (user_id, branch_id, role) VALUES ($1,$2,$3)`, [
      user.id,
      body.branchId,
      body.role,
    ]);
    res.status(201).json({ user });
  }),
);

usersRouter.post(
  '/:id/branches',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        branchId: z.string().uuid(),
        role: z.enum(['owner', 'branch_manager', 'seller']),
      })
      .parse(req.body);
    const exists = await query('SELECT id FROM users WHERE id = $1 AND organization_id = $2', [
      req.params.id,
      req.user!.organizationId,
    ]);
    if (!exists.rows[0]) throw new HttpError(404, 'Usuario no encontrado');
    await query(
      `INSERT INTO user_branches (user_id, branch_id, role) VALUES ($1,$2,$3)
       ON CONFLICT (user_id, branch_id) DO UPDATE SET role = EXCLUDED.role`,
      [req.params.id, body.branchId, body.role],
    );
    res.json({ ok: true });
  }),
);
