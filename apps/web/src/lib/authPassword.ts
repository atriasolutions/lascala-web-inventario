import type { User } from './api';

/** Flags que puede enviar el API (camel). */
type UserAuthFlags = User & {
  mustChangePassword?: boolean;
  must_change_password?: boolean;
  isSuperadmin?: boolean;
  isSuperAdmin?: boolean;
  is_superadmin?: boolean;
  role?: string;
};

export function userMustChangePassword(user: User | null | undefined): boolean {
  if (!user) return false;
  const u = user as UserAuthFlags;
  return Boolean(u.mustChangePassword ?? u.must_change_password);
}

/** Superadmin de soporte: no debe listarse en Admin / Usuarios. */
export function isHiddenSuperAdmin(user: {
  isSuperadmin?: boolean;
  isSuperAdmin?: boolean;
  is_superadmin?: boolean;
  role?: string | null;
  email?: string | null;
} | null | undefined): boolean {
  if (!user) return false;
  if (user.isSuperadmin || user.isSuperAdmin || user.is_superadmin) return true;
  if (user.role === 'superadmin') return true;
  const email = (user.email || '').toLowerCase();
  return email === 'soporte@atria.cl' || email.startsWith('superadmin@');
}
