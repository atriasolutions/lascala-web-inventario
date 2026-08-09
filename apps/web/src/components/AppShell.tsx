import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ConfirmDialog } from './ConfirmDialog';
import { NotificationBell } from './NotificationBell';
import { ShellTitleContext } from './shellTitle';
import { WorkplaceSwitcher } from './WorkplaceSwitcher';
import {
  IconAlertTriangle,
  IconBox,
  IconChart,
  IconChevronDown,
  IconHome,
  IconLogout,
  IconMore,
  IconPos,
  IconReceipt,
  IconShirt,
  IconStore,
  IconSwap,
  IconTruck,
  IconUsers,
  IconWallet,
} from './icons';

const ROLE_LABEL: Record<string, string> = {
  owner: 'Propietaria',
  branch_manager: 'Encargada de sucursal',
  seller: 'Vendedora',
};

const pinnedNav = { to: '/', label: 'Dashboard', icon: IconHome, end: true as const };

/** Accesos más usados — siempre primero en el sidebar */
const primaryNav = [
  { to: '/vender', label: 'Caja (POS)', icon: IconPos },
  { to: '/ingresos', label: 'Ingresos', icon: IconTruck },
];

const navSections = [
  {
    label: 'Operación',
    items: [
      { to: '/compras', label: 'Compras', icon: IconReceipt },
      { to: '/ventas', label: 'Historial de ventas', icon: IconReceipt },
    ],
  },
  {
    label: 'Inventario',
    items: [
      { to: '/productos', label: 'Productos', icon: IconShirt },
      { to: '/inventario', label: 'Inventario', icon: IconBox },
      { to: '/movimientos', label: 'Movimientos', icon: IconSwap },
    ],
  },
  {
    label: 'Control',
    items: [
      { to: '/mermas', label: 'Mermas y cambios', icon: IconAlertTriangle },
      { to: '/gastos', label: 'Gastos', icon: IconWallet },
      { to: '/reportes', label: 'Reportes', icon: IconChart },
    ],
  },
  {
    label: 'Administración',
    items: [{ to: '/admin', label: 'Ajustes e impresoras', icon: IconUsers }],
  },
];

const allNavItems = [pinnedNav, ...primaryNav, ...navSections.flatMap((s) => s.items)];

const primaryMobile = [
  { to: '/', label: 'Inicio', icon: IconHome, end: true },
  { to: '/ingresos', label: 'Ingresos', icon: IconTruck },
  { to: '/vender', label: 'Caja', icon: IconPos, primary: true },
  { to: '/inventario', label: 'Stock', icon: IconBox },
];

const moreLinks = [
  { to: '/compras', label: 'Compras', icon: IconReceipt },
  { to: '/ventas', label: 'Historial de ventas', icon: IconReceipt },
  { to: '/productos', label: 'Productos', icon: IconShirt },
  { to: '/movimientos', label: 'Movimientos', icon: IconSwap },
  { to: '/mermas', label: 'Mermas', icon: IconAlertTriangle },
  { to: '/gastos', label: 'Gastos', icon: IconWallet },
  { to: '/reportes', label: 'Reportes', icon: IconChart },
  { to: '/admin', label: 'Ajustes', icon: IconUsers },
];

function initials(name?: string) {
  if (!name) return '·';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '·';
}

export function AppShell() {
  const { user, branches, branchId, posId, logout } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  const location = useLocation();
  const activeBranch = branches.find((b) => b.id === branchId);
  const activePos = activeBranch?.pos_terminals?.find((p) => p.id === posId);
  const role = activeBranch?.role || '';
  const isOwner = role === 'owner';
  const roleLabel = role ? ROLE_LABEL[role] || role : '';

  const openLogout = useCallback(() => {
    setUserMenuOpen(false);
    setLogoutOpen(true);
  }, []);

  const cancelLogout = useCallback(() => setLogoutOpen(false), []);

  const doLogout = useCallback(() => {
    setLogoutOpen(false);
    setMoreOpen(false);
    logout();
  }, [logout]);

  useEffect(() => {
    setTitleOverride(null);
  }, [location.pathname]);

  const title = useMemo(() => {
    if (titleOverride) return titleOverride;
    if (location.pathname.startsWith('/vender')) return 'Caja (POS)';
    if (location.pathname === '/ventas' || location.pathname.startsWith('/ventas?')) {
      return 'Historial de ventas';
    }
    if (location.pathname === '/compras/nuevo') return 'Nueva compra';
    if (/^\/compras\/[^/]+$/.test(location.pathname)) return 'Compra';
    if (location.pathname === '/compras' || location.pathname.startsWith('/compras?')) return 'Compras';
    if (location.pathname.startsWith('/compras')) return 'Compras';
    if (/^\/ingresos\/[^/]+$/.test(location.pathname)) return 'Recepción de mercadería';
    if (location.pathname === '/ingresos' || location.pathname.startsWith('/ingresos?')) return 'Ingresos';
    if (location.pathname.startsWith('/ingresos')) return 'Ingresos';
    const hit = allNavItems.find((l) =>
      'end' in l && l.end ? location.pathname === l.to : location.pathname.startsWith(l.to),
    );
    return hit?.label || "L'Scala";
  }, [location.pathname, titleOverride]);

  const eyebrow = useMemo(() => {
    if (location.pathname.startsWith('/compras')) return "Boutique L'Scala · operación";
    if (location.pathname.startsWith('/ingresos')) return "Boutique L'Scala · piso de venta";
    return "Boutique L'Scala · piso de venta";
  }, [location.pathname]);

  const visibleSections = navSections.filter(
    (s) => !('ownerOnly' in s && (s as { ownerOnly?: boolean }).ownerOnly) || isOwner,
  );
  const visibleMoreLinks = moreLinks.filter((l) => !('ownerOnly' in l && l.ownerOnly) || isOwner);
  const moreActive = visibleMoreLinks.some((l) => location.pathname.startsWith(l.to));
  const workplaceLabel = [activeBranch?.name, activePos?.name].filter(Boolean).join(' · ');

  return (
    <ShellTitleContext.Provider value={setTitleOverride}>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand-lockup">
            <img src="/brand/lscala-logo.png" alt="L'Scala" />
            <strong>L'Scala</strong>
          </div>
          <NavLink to={pinnedNav.to} end={pinnedNav.end} className="nav-pinned">
            <span className="nav-ico"><pinnedNav.icon size={18} /></span>
            {pinnedNav.label}
          </NavLink>
          <nav className="nav-primary" aria-label="Accesos frecuentes">
            {primaryNav.map((l) => (
              <NavLink key={l.to} to={l.to}>
                <span className="nav-ico"><l.icon size={18} /></span>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <nav className="nav-list">
            {visibleSections.map((section) => (
              <div className="nav-section" key={section.label}>
                <span className="nav-section-label">{section.label}</span>
                {section.items.map((l) => (
                  <NavLink key={l.to} to={l.to}>
                    <span className="nav-ico"><l.icon size={18} /></span>
                    {l.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        <div className="main">
          <header className="mobile-header mobile-only">
            <div className="mobile-brand">
              <img src="/brand/lscala-logo-mark.png" alt="" />
              <div>
                <strong>{title}</strong>
                <span>{roleLabel || user?.fullName?.split(' ')[0]} · {activeBranch?.name || 'Sucursal'}</span>
              </div>
            </div>
            <div className="mobile-actions">
              <NotificationBell variant="mobile" />
              <button className="icon-btn" type="button" aria-label="Salir" onClick={openLogout}>
                <IconLogout size={18} />
              </button>
            </div>
          </header>

          <header className="topbar-desktop">
            <div className="topbar-title">
              <span className="topbar-eyebrow">{eyebrow}</span>
              <h1>{title === 'Dashboard' ? `Hola, ${user?.fullName?.split(' ')[0] || ''}` : title}</h1>
            </div>
            <div className="right">
              {isOwner ? (
                <div className="topbar-workplace-switch">
                  <WorkplaceSwitcher compact />
                </div>
              ) : (
                workplaceLabel && (
                  <p className="topbar-workplace">
                    <IconStore size={13} /> {workplaceLabel}
                  </p>
                )
              )}
              <NotificationBell />
              <div className="user-menu">
                <button className="user-chip" type="button" onClick={() => setUserMenuOpen((v) => !v)}>
                  <span className="avatar">{initials(user?.fullName)}</span>
                  <span className="user-chip-text">
                    <strong>{user?.fullName?.split(' ')[0] || 'Usuaria'}</strong>
                    <span>{roleLabel}</span>
                  </span>
                  <IconChevronDown size={14} />
                </button>
                {userMenuOpen && (
                  <div className="user-menu-panel" onMouseLeave={() => setUserMenuOpen(false)}>
                    <div className="user-menu-head">
                      <strong>{user?.fullName}</strong>
                      <span className="muted">{user?.email}</span>
                      <span className="muted">{roleLabel} · {activeBranch?.name}</span>
                    </div>
                    <button className="btn ghost block" type="button" onClick={openLogout}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', width: '100%' }}>
                        <IconLogout size={16} /> Cerrar sesión
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          <div className="main-content">
            <Outlet />
          </div>
        </div>

        <nav className="bottom-nav mobile-only" aria-label="Navegación principal">
          {primaryMobile.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) => `${isActive ? 'active' : ''} ${l.primary ? 'primary' : ''}`.trim()}
            >
              <span className="nav-ico"><l.icon size={20} /></span>
              {l.label}
            </NavLink>
          ))}
          <button
            type="button"
            className={`nav-more ${moreActive ? 'active' : ''}`}
            onClick={() => setMoreOpen(true)}
          >
            <span className="nav-ico"><IconMore size={20} /></span>
            Más
          </button>
        </nav>

        <div className={`more-sheet mobile-only ${moreOpen ? 'open' : ''}`} onClick={() => setMoreOpen(false)}>
          <div className="more-sheet-panel" onClick={(e) => e.stopPropagation()}>
            <h3>Más opciones</h3>
            {isOwner && (
              <div className="more-workplace">
                <WorkplaceSwitcher />
              </div>
            )}
            {!isOwner && workplaceLabel && (
              <p className="more-workplace-ro">
                <IconStore size={14} /> {workplaceLabel}
              </p>
            )}
            <div className="more-grid">
              {visibleMoreLinks.map((l) => (
                <NavLink key={l.to} to={l.to} onClick={() => setMoreOpen(false)}>
                  <span className="nav-ico"><l.icon size={18} /></span>
                  {l.label}
                </NavLink>
              ))}
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  openLogout();
                }}
              >
                <span className="nav-ico"><IconLogout size={18} /></span>
                Salir
              </button>
            </div>
          </div>
        </div>

        <ConfirmDialog
          open={logoutOpen}
          title="Cerrar sesión"
          message="¿Seguro que quieres cerrar sesión?"
          cancelLabel="Cancelar"
          confirmLabel="Cerrar sesión"
          danger
          onCancel={cancelLogout}
          onConfirm={doLogout}
        />
      </div>
    </ShellTitleContext.Provider>
  );
}
