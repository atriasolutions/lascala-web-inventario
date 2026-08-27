import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config.js';
import { query } from '../db/pool.js';
import { HttpError } from '../utils/errors.js';

export type BranchAccess = { branchId: string; role: 'owner' | 'branch_manager' | 'seller' };

export type AuthUser = {
  id: string;
  organizationId: string;
  email: string;
  fullName: string;
  branches: BranchAccess[];
  mustChangePassword: boolean;
  isSuperadmin: boolean;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      activeBranchId?: string;
      activePosId?: string;
      activeRole?: BranchAccess['role'];
    }
  }
}

type JwtPayload = { sub: string; organizationId: string };

/** Rutas permitidas mientras debe cambiar contraseña. */
const MUST_CHANGE_ALLOW =
  /^\/api\/auth\/(me|change-password|refresh|context\/branches)(\/|$)/;

export function resolveSessionTtl(input: { client?: unknown; persistent?: unknown }): {
  persistent: boolean;
  expiresIn: string;
} {
  const persistent = input.persistent === true || input.client === 'pwa';
  return {
    persistent,
    expiresIn: persistent ? env.jwtPersistentExpiresIn : env.jwtExpiresIn,
  };
}

export function signToken(
  user: { id: string; organizationId: string },
  opts?: { expiresIn?: string },
) {
  return jwt.sign(
    { sub: user.id, organizationId: user.organizationId } satisfies JwtPayload,
    env.jwtSecret,
    { expiresIn: opts?.expiresIn ?? env.jwtExpiresIn } as jwt.SignOptions,
  );
}

export function computeMustChangePassword(row: {
  must_change_password: boolean;
  password_changed_at: string | Date | null;
}): boolean {
  return Boolean(row.must_change_password) || row.password_changed_at == null;
}

export async function loadUser(userId: string): Promise<AuthUser | null> {
  const userRes = await query<{
    id: string;
    organization_id: string;
    email: string;
    full_name: string;
    is_active: boolean;
    must_change_password: boolean;
    password_changed_at: Date | null;
    is_superadmin: boolean;
  }>(
    `SELECT id, organization_id, email, full_name, is_active,
            COALESCE(must_change_password, false) AS must_change_password,
            password_changed_at,
            COALESCE(is_superadmin, false) AS is_superadmin
     FROM users WHERE id = $1`,
    [userId],
  );
  const user = userRes.rows[0];
  if (!user || !user.is_active) return null;

  const branchesRes = await query<{ branch_id: string; role: BranchAccess['role'] }>(
    'SELECT branch_id, role FROM user_branches WHERE user_id = $1',
    [userId],
  );

  return {
    id: user.id,
    organizationId: user.organization_id,
    email: user.email,
    fullName: user.full_name,
    branches: branchesRes.rows.map((b) => ({ branchId: b.branch_id, role: b.role })),
    mustChangePassword: computeMustChangePassword(user),
    isSuperadmin: Boolean(user.is_superadmin),
  };
}

export function isOrgOwner(user: Pick<AuthUser, 'branches' | 'isSuperadmin'>) {
  if (user.isSuperadmin) return true;
  return user.branches.some((b) => b.role === 'owner');
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'No autenticado');
    const token = header.slice(7);
    const payload = jwt.verify(token, env.jwtSecret) as JwtPayload;
    const user = await loadUser(payload.sub);
    if (!user) throw new HttpError(401, 'Usuario inválido');
    req.user = user;

    const pathOnly = (req.originalUrl || req.url || '').split('?')[0];
    if (user.mustChangePassword && !MUST_CHANGE_ALLOW.test(pathOnly)) {
      throw new HttpError(403, 'Debes crear una nueva contraseña antes de continuar');
    }

    const branchHeader = req.headers['x-branch-id'];
    const posHeader = req.headers['x-pos-id'];
    if (typeof branchHeader === 'string' && branchHeader) {
      if (isOrgOwner(user)) {
        const branch = await query<{ id: string }>(
          `SELECT id FROM branches WHERE id = $1 AND organization_id = $2 AND is_active = true`,
          [branchHeader, user.organizationId],
        );
        if (!branch.rows[0]) throw new HttpError(403, 'Sin acceso a la sucursal');
        req.activeBranchId = branchHeader;
        req.activeRole = 'owner';
      } else {
        const access = user.branches.find((b) => b.branchId === branchHeader);
        if (!access) throw new HttpError(403, 'Sin acceso a la sucursal');
        req.activeBranchId = branchHeader;
        req.activeRole = access.role;
      }
    }
    if (typeof posHeader === 'string' && posHeader && req.activeBranchId) {
      const allowed = await isPosAllowedForUser(user, posHeader, req.activeBranchId);
      if (allowed) req.activePosId = posHeader;
    }
    next();
  } catch (err) {
    if (err instanceof HttpError) next(err);
    else next(new HttpError(401, 'Token inválido'));
  }
}

export function requireBranch(req: Request, _res: Response, next: NextFunction) {
  if (!req.activeBranchId) return next(new HttpError(400, 'Selecciona una sucursal (X-Branch-Id)'));
  next();
}

export function requireRoles(...roles: BranchAccess['role'][]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.activeRole) return next(new HttpError(400, 'Contexto de sucursal requerido'));
    if (req.user?.isSuperadmin) return next();
    if (!roles.includes(req.activeRole)) return next(new HttpError(403, 'Permiso insuficiente'));
    next();
  };
}

export async function assertPosInBranch(posId: string, branchId: string) {
  const res = await query('SELECT id FROM pos_terminals WHERE id = $1 AND branch_id = $2 AND status = $3', [
    posId,
    branchId,
    'active',
  ]);
  if (!res.rowCount) throw new HttpError(400, 'POS inválido para la sucursal');
}

export async function isPosAllowedForUser(user: AuthUser, posId: string, branchId: string) {
  const inBranch = await query(
    'SELECT id FROM pos_terminals WHERE id = $1 AND branch_id = $2 AND status = $3',
    [posId, branchId, 'active'],
  );
  if (!inBranch.rowCount) return false;
  if (isOrgOwner(user)) return true;
  const assigned = await query(
    `SELECT 1 FROM user_pos WHERE user_id = $1 AND pos_id = $2`,
    [user.id, posId],
  );
  return Boolean(assigned.rowCount);
}

/** Caja válida en la sucursal y habilitada para la usuaria (Administrador/a: todas). */
export async function assertUserCanUsePos(user: AuthUser, posId: string, branchId: string) {
  await assertPosInBranch(posId, branchId);
  if (isOrgOwner(user)) return;
  const ok = await isPosAllowedForUser(user, posId, branchId);
  if (!ok) throw new HttpError(403, 'Sin acceso a esa caja');
}
