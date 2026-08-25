import { HttpError } from '../utils/errors.js';

export type UserRole = 'owner' | 'branch_manager' | 'seller';

export const FLOOR_ROLES: UserRole[] = ['owner', 'branch_manager', 'seller'];
export const LEAD_ROLES: UserRole[] = ['owner', 'branch_manager'];
export const ADMIN_ROLES: UserRole[] = ['owner'];

/** Copy Chile: alta de código / prenda nueva en sistema. */
export const CODE_REGISTER_FORBIDDEN =
  'Solo la administración puede dar de alta el código en el sistema.';

export function isLeadRole(role: string | undefined) {
  return role === 'owner' || role === 'branch_manager';
}

export function assertCanEditSalePrice(role: string | undefined) {
  if (role === 'seller') {
    throw new HttpError(403, 'No puedes cambiar el precio de venta');
  }
}

/** Crear prenda / vincular código nuevo: Administrador/a o Encargado/a (mismo patrón que p. venta). */
export function assertCanRegisterProductCode(role: string | undefined) {
  if (!isLeadRole(role)) {
    throw new HttpError(403, CODE_REGISTER_FORBIDDEN);
  }
}
