/** Roles de sucursal (DB). Labels de UI: Administrador/a, Encargado/a, Vendedor/a. */

export type AppRole = 'owner' | 'branch_manager' | 'seller';

export const ROLE_LABEL: Record<AppRole, string> = {
  owner: 'Administrador/a',
  branch_manager: 'Encargado/a',
  seller: 'Vendedor/a',
};

export function roleLabel(role: string) {
  return ROLE_LABEL[role as AppRole] || role;
}

export function isAdminRole(role: string) {
  return role === 'owner';
}

/** Administrador/a o Encargado/a: ajustes de stock, aplicar/anular toma, precio de venta. */
export function isLeadRole(role: string) {
  return role === 'owner' || role === 'branch_manager';
}

/**
 * Alta de prenda / código en sistema (Productos, vincular en Ingresos).
 * Misma regla que p. venta: lead. Vendedor/a solo etiqueta / vincula existente.
 */
export function canRegisterProductCode(role: string) {
  return isLeadRole(role);
}

export const CODE_REGISTER_FORBIDDEN =
  'Solo la administración puede dar de alta el código en el sistema.';

