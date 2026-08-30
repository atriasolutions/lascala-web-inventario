import { isHiddenSuperAdmin } from './authPassword';

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

/** Rutas mobile permitidas para Encargado/a y Vendedor/a (consulta en piso + ayuda). */
export const MOBILE_STAFF_ROUTE_PREFIXES = [
  '/ventas',
  '/productos',
  '/inventario',
  '/movimientos',
  '/ayuda',
] as const;

export function isMobileStaffRole(role: string) {
  return role === 'branch_manager' || role === 'seller';
}

/** Bottom nav admin (Inicio, Compras, …) vs staff (Historial, Productos, Stock, Movimientos). */
export function hasFullMobileNav(
  user: Parameters<typeof isHiddenSuperAdmin>[0],
  branchRole: string,
) {
  if (isHiddenSuperAdmin(user)) return true;
  return isAdminRole(branchRole);
}

export function isMobileStaffRouteAllowed(pathname: string) {
  if (pathname === '/') return true;
  return MOBILE_STAFF_ROUTE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/** Mobile (~900px): todos los roles de piso; staff con rutas acotadas. */
export function canUseMobileApp(
  user: Parameters<typeof isHiddenSuperAdmin>[0],
  branchRole: string,
) {
  if (isHiddenSuperAdmin(user)) return true;
  return isAdminRole(branchRole) || isMobileStaffRole(branchRole);
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

/** Ingresos → «Sin código de barras»: vendedora puede alta mínima (sin p. venta en ficha). */
export function canCreateProductInIngresosNoBarcode(role: string) {
  return role === 'owner' || role === 'branch_manager' || role === 'seller';
}

export const CODE_REGISTER_FORBIDDEN =
  'Solo la administración puede dar de alta el código en el sistema.';

