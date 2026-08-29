import { HttpError } from '../utils/errors.js';

/** Roles de piso (UI). superadmin es flag en users, no enum de sucursal. */
export type UserRole = 'owner' | 'branch_manager' | 'seller';

export const FLOOR_ROLES: UserRole[] = ['owner', 'branch_manager', 'seller'];
export const LEAD_ROLES: UserRole[] = ['owner', 'branch_manager'];
/** Admin de boutique = owner. */
export const ADMIN_ROLES: UserRole[] = ['owner'];

/** Copy Chile: alta de código / prenda nueva en sistema. */
export const CODE_REGISTER_FORBIDDEN =
  'Solo la administración puede dar de alta el código en el sistema.';

export function isLeadRole(role: string | undefined) {
  return role === 'owner' || role === 'branch_manager';
}

export function isAdminRole(role: string | undefined) {
  return role === 'owner';
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

/** Ingresos → flujo «Sin código de barras»: vendedora puede alta mínima vinculada a la línea. */
export function assertCanCreateProductInIngresosNoBarcode(role: string | undefined) {
  if (role !== 'owner' && role !== 'branch_manager' && role !== 'seller') {
    throw new HttpError(403, CODE_REGISTER_FORBIDDEN);
  }
}

export type PasswordResetActor = {
  id: string;
  isSuperadmin: boolean;
  /** Tiene rol owner en alguna sucursal (admin boutique). */
  isOwner: boolean;
};

export type PasswordResetTarget = {
  id: string;
  isSuperadmin: boolean;
  /** Tiene rol owner en alguna sucursal. */
  isOwner: boolean;
};

/**
 * Quién puede restablecer la contraseña de quién (sin flujo público).
 * - Superadmin → admin (owner) y piso.
 * - Admin (owner) → vendedoras / encargadas; no owners ni a sí misma.
 * - Nadie ve ni toca a otro superadmin (404).
 */
export function assertCanResetUserPassword(actor: PasswordResetActor, target: PasswordResetTarget) {
  if (target.isSuperadmin) {
    throw new HttpError(404, 'Usuario no encontrado');
  }
  if (actor.id === target.id) {
    throw new HttpError(400, 'Para cambiar tu contraseña usa la opción de tu cuenta');
  }
  if (target.isOwner) {
    if (!actor.isSuperadmin) {
      throw new HttpError(
        403,
        'Solo soporte puede restablecer la contraseña de la administradora',
      );
    }
    return;
  }
  if (!actor.isSuperadmin && !actor.isOwner) {
    throw new HttpError(403, 'Permiso insuficiente');
  }
}
