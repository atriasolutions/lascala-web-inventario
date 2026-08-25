import type { Fixtures } from './global-setup';

export type RouteCase = {
  /** Identificador corto para archivos de captura y reporte. */
  slug: string;
  name: string;
  path: (f: Fixtures) => string | null;
  /** CTA principal: selector CSS o `text=Etiqueta`. */
  cta?: { mobile?: string; desktop?: string };
  /** Se ejecuta tras cargar la ruta (abrir pestaña, etc.). */
  prepare?: string;
  /** Espera a que aparezca este selector antes de auditar. */
  ready?: string;
  anonymous?: boolean;
};

export const ROUTES: RouteCase[] = [
  {
    slug: 'login',
    name: 'Login',
    path: () => '/login',
    anonymous: true,
    ready: '.login-card',
    cta: { mobile: '.login-cta', desktop: '.login-cta' },
  },
  { slug: 'dashboard', name: 'Dashboard', path: () => '/', ready: '.main-content' },
  {
    slug: 'productos',
    name: 'Productos',
    path: () => '/productos',
    ready: '.main-content',
    cta: { mobile: 'text=Nueva prenda', desktop: 'text=Nueva prenda' },
  },
  {
    slug: 'compras',
    name: 'Compras',
    path: () => '/compras',
    ready: '.main-content',
    cta: { mobile: 'text=Nueva compra', desktop: 'text=Nueva compra' },
  },
  { slug: 'ingresos-lista', name: 'Ingresos (lista)', path: () => '/ingresos', ready: '.main-content' },
  {
    slug: 'ingresos-detalle',
    name: 'Ingresos (detalle)',
    path: (f) => (f.ingresoId ? `/ingresos/${f.ingresoId}` : null),
    ready: '.main-content',
    cta: { mobile: '.ing-sticky-bar .btn', desktop: '.ing-sticky-bar .btn' },
  },
  {
    slug: 'inventario',
    name: 'Stock',
    path: () => '/inventario',
    ready: '.main-content',
    cta: { mobile: '.inv-mov-btn', desktop: '.inv-mov-btn' },
  },
  {
    slug: 'vender',
    name: 'Caja (POS)',
    path: () => '/vender',
    ready: '.pos-layout',
    cta: { mobile: '.pos-checkout-bar .btn', desktop: '.pos-ticket-footer .btn' },
  },
  { slug: 'ventas', name: 'Historial de ventas', path: () => '/ventas', ready: '.main-content' },
  { slug: 'movimientos', name: 'Movimientos', path: () => '/movimientos', ready: '.main-content' },
  {
    slug: 'mermas-tab-mermas',
    name: 'Mermas · pestaña Mermas',
    path: () => '/mermas',
    ready: '.merma-tabs',
    cta: { mobile: '.merma-register-btn', desktop: '.merma-register-btn' },
  },
  {
    slug: 'mermas-tab-vouchers',
    name: 'Mermas · pestaña Cambios/Vouchers',
    path: () => '/mermas',
    ready: '.merma-tabs',
    prepare: 'tab-vouchers',
    cta: { mobile: '.merma-register-btn', desktop: '.merma-register-btn' },
  },
  {
    slug: 'gastos',
    name: 'Gastos',
    path: () => '/gastos',
    ready: '.main-content',
    cta: { mobile: '.gasto-register-btn', desktop: '.gasto-register-btn' },
  },
  { slug: 'reportes', name: 'Reportes', path: () => '/reportes', ready: '.main-content' },
  { slug: 'admin-equipo', name: 'Ajustes · Impresoras', path: () => '/admin/equipo', ready: '.admin-tabs' },
  {
    slug: 'admin-sucursales',
    name: 'Ajustes · Sucursales',
    path: () => '/admin/sucursales',
    ready: '.admin-tabs',
    cta: { mobile: 'text=Nueva sucursal', desktop: 'text=Nueva sucursal' },
  },
  {
    slug: 'admin-cajas',
    name: 'Ajustes · Cajas',
    path: () => '/admin/cajas',
    ready: '.admin-tabs',
    cta: { mobile: 'text=Nueva caja', desktop: 'text=Nueva caja' },
  },
  {
    slug: 'admin-usuarias',
    name: 'Ajustes · Usuarios',
    path: () => '/admin/usuarias',
    ready: '.admin-tabs',
    cta: { mobile: 'text=Nuevo usuario', desktop: 'text=Nuevo usuario' },
  },
];
