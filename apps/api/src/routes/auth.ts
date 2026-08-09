import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { env } from '../config.js';
import { query } from '../db/pool.js';
import { loadUser, requireAuth, signToken } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../utils/errors.js';

export const authRouter = Router();

const GENERIC_FORGOT_MSG =
  'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.';

function hashToken(raw: string) {
  return createHash('sha256').update(raw).digest('hex');
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
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
    const token = signToken({ id: user.id, organizationId: user.organizationId });
    res.json({ token, user });
  }),
);

/**
 * Solicitud de restablecimiento. Siempre responde 200 con mensaje genérico.
 * Sin SMTP: en desarrollo se imprime el link en la consola de la API.
 */
authRouter.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    const body = z.object({ email: z.string().email() }).parse(req.body);
    const email = body.email.toLowerCase().trim();

    const started = Date.now();
    const userRes = await query<{ id: string }>(
      `SELECT id FROM users WHERE email = $1 AND is_active = true`,
      [email],
    );
    const user = userRes.rows[0];

    if (user) {
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawToken);
      const ttl = Math.max(5, env.passwordResetTtlMinutes);

      await query(
        `UPDATE password_reset_tokens
            SET used_at = COALESCE(used_at, now())
          WHERE user_id = $1 AND used_at IS NULL`,
        [user.id],
      );
      await query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + ($3::int * interval '1 minute'))`,
        [user.id, tokenHash, ttl],
      );

      const resetUrl = `${env.webOrigin.replace(/\/$/, '')}/reset-password?token=${rawToken}`;
      // Sin mailer: loguear en consola API (dev / staging sin SMTP).
      console.info('[auth/forgot-password] Reset link (sin SMTP):', resetUrl);
      console.info('[auth/forgot-password] Usuario:', email, `· expira en ${ttl} min`);
    }

    // Mitiga timing aproximado entre email existente / no existente.
    const elapsed = Date.now() - started;
    if (elapsed < 400) await sleep(400 - elapsed);

    res.json({ ok: true, message: GENERIC_FORGOT_MSG });
  }),
);

/**
 * Define nueva contraseña con el token recibido por email / consola.
 */
authRouter.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        token: z.string().min(20),
        password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
      })
      .parse(req.body);

    const tokenHash = hashToken(body.token.trim());
    const rowRes = await query<{ id: string; user_id: string }>(
      `SELECT id, user_id
         FROM password_reset_tokens
        WHERE token_hash = $1
          AND used_at IS NULL
          AND expires_at > now()`,
      [tokenHash],
    );
    const row = rowRes.rows[0];
    if (!row) {
      throw new HttpError(400, 'El enlace no es válido o ya expiró. Solicita uno nuevo.');
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    await query(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`, [
      passwordHash,
      row.user_id,
    ]);
    await query(`UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, [row.id]);
    // Invalida otros tokens pendientes del mismo usuario.
    await query(
      `UPDATE password_reset_tokens
          SET used_at = COALESCE(used_at, now())
        WHERE user_id = $1 AND used_at IS NULL`,
      [row.user_id],
    );

    res.json({ ok: true, message: 'Contraseña actualizada. Ya puedes ingresar.' });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  }),
);

authRouter.get(
  '/context/branches',
  requireAuth,
  asyncHandler(async (req, res) => {
    const ids = req.user!.branches.map((b) => b.branchId);
    if (!ids.length) return res.json({ branches: [] });
    const result = await query(
      `SELECT b.*, json_agg(json_build_object('id', p.id, 'code', p.code, 'name', p.name, 'status', p.status))
         FILTER (WHERE p.id IS NOT NULL) AS pos_terminals
       FROM branches b
       LEFT JOIN pos_terminals p ON p.branch_id = b.id
       WHERE b.id = ANY($1::uuid[])
       GROUP BY b.id
       ORDER BY b.name`,
      [ids],
    );
    const branches = result.rows.map((b) => ({
      ...b,
      role: req.user!.branches.find((x) => x.branchId === b.id)?.role,
    }));
    res.json({ branches });
  }),
);
