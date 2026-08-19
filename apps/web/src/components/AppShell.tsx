import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useNetworkStatus } from '../lib/networkStatus';
import { countPendingOfflineSales } from '../lib/posCatalogCache';
import { AccountSheet } from './AccountSheet';
import { ConfirmDialog } from './ConfirmDialog';
import { NotificationBell } from './NotificationBell';
import { OfflineBanner } from './OfflineBanner';
import { PwaInstallHint } from './PwaInstallHint';
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

type NavItem = {
  to: string;
  label: string;
  icon: typeof IconHome;
  end?: boolean;
  primary?: boolean;
  /** Oculto para vendedora; visible a propietaria y encargada. */
  ownerOnly?: boolean;
};

const pinnedNav: NavItem = { to: '/', label: 'Dashboard', icon: IconHome, end: true };

/** Accesos más usados — siempre primero en el sidebar */
const primaryNav: NavItem[] = [
  { to: '/vender', label: 'Caja (POS)', icon: IconPos },
  { to: '/ingresos', label: 'Ingresos', icon: IconTruck },
];

const navSections: { label: string; items: NavItem[] }[] = [
  {
    label: 'Operación',
    items: [
      { to: '/compras', label: 'Compras', icon: IconReceipt, ownerOnly: true },
      { to: '/ventas', label: 'Historial de ventas', icon: IconReceipt },
    ],
  },
  {
    label: 'Inventario',
    items: [
      { to: '/productos', label: 'Productos', icon: IconShirt },
      { to: '/inventario', label: 'Stock', icon: IconBox },
      { to: '/movimientos', label: 'Movimientos', icon: IconSwap },
    ],
  },
  {
    label: 'Control',
    items: [
      { to: '/mermas', label: 'Mermas y cambios', icon: IconAlertTriangle },
      { to: '/gastos', label: 'Gastos', icon: IconWallet, ownerOnly: true },
      { to: '/reportes', label: 'Reportes', icon: IconChart, ownerOnly: true },
    ],
  },
  {
    label: 'Administración',
    /* Todos los roles: vendedora usa Impresoras; dueña ve tabs extra en Admin. */
    items: [{ to: '/admin', label: 'Ajustes', icon: IconUsers }],
  },
];

const primaryMobile: NavItem[] = [
  { to: '/', label: 'Inicio', icon: IconHome, end: true },
  { to: '/ingresos', label: 'Ingresos', icon: IconTruck },
  { to: '/vender', label: 'Caja', icon: IconPos, primary: true },
  { to: '/inventario', label: 'Stock', icon: IconBox },
];

const moreLinks: NavItem[] = [
  { to: '/compras', label: 'Compras', icon: IconReceipt, ownerOnly: true },
  { to: '/ventas', label: 'Historial de ventas', icon: IconReceipt },
  { to: '/productos', label: 'Productos', icon: IconShirt },
  { to: '/movimientos', label: 'Movimientos', icon: IconSwap },
  { to: '/mermas', label: 'Mermas', icon: IconAlertTriangle },
  { to: '/gastos', label: 'Gastos', icon: IconWallet, ownerOnly: true },
  { to: '/reportes', label: 'Reportes', icon: IconChart, ownerOnly: true },
  { to: '/admin', label: 'Ajustes', icon: IconUsers },
];

function canSeeOwnerNav(role: string) {
  return role === 'owner' || role === 'branch_manager';
}

function navLabel(item: NavItem, isOwnerLike: boolean) {
  if (item.to === '/admin' && !isOwnerLike) return 'Impresoras';
  return item.label;
}

function initials(name?: string) {
  if (!name) return '·';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '·';
}

export function AppShell() {
  const { user, branches, branchId, logout } = useAuth();
  const { online } = useNetworkStatus();
  const [moreOpen, setMoreOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutPendingCount, setLogoutPendingCount] = useState(0);
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  const location = useLocation();
  const activeBranch = branches.find((b) => b.id === branchId);
  const role = activeBranch?.role || '';
  const isOwner = role === 'owner';
  const ownerNav = canSeeOwnerNav(role);
  const roleLabel = role ? ROLE_LABEL[role] || role : '';

  const openLogout = useCallback(() => {
    setUserMenuOpen(false);
    setLogoutPendingCount(0);
    setLogoutOpen(true);
    if (!branchId) return;
    void countPendingOfflineSales(branchId).then((n) => {
      setLogoutPendingCount(n);
    });
  }, [branchId]);

  const cancelLogout = useCallback(() => {
    setLogoutOpen(false);
    setLogoutPendingCount(0);
  }, []);

  const doLogout = useCallback(() => {
    setLogoutOpen(false);
    setLogoutPendingCount(0);
    setMoreOpen(false);
    logout();
  }, [logout]);

  const logoutMessage =
    logoutPendingCount > 0
      ? `Hay ${logoutPendingCount} venta${logoutPendingCount === 1 ? '' : 's'} pendiente${
          logoutPendingCount === 1 ? '' : 's'
        } de sincronizar. Al cerrar sesión se quedarán en este equipo hasta que vuelvas a entrar. ¿Seguro que quieres cerrar sesión?`
      : '¿Seguro que quieres cerrar sesión?';

  useEffect(() => {
    setTitleOverride(null);
  }, [location.pathname]);

  useEffect(() => {
    if (!userMenuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!userMenuRef.current?.contains(e.target as Node)) setUserMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setUserMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [userMenuOpen]);

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
    if (location.pathname.startsWith('/admin')) return 'Ajustes';
    const hit = [...primaryNav, ...navSections.flatMap((s) => s.items), ...primaryMobile].find((l) =>
      'end' in l && l.end ? location.pathname === l.to : location.pathname.startsWith(l.to),
    );
    return hit ? navLabel(hit, ownerNav) : "L'Scala";
  }, [location.pathname, titleOverride, ownerNav]);

  const eyebrow = useMemo(() => {
    if (location.pathname.startsWith('/admin')) return "Boutique L'Scala · administración";
    if (location.pathname.startsWith('/compras')) return "Boutique L'Scala · operación";
    if (location.pathname.startsWith('/ingresos')) return "Boutique L'Scala · piso de venta";
    return "Boutique L'Scala · piso de venta";
  }, [location.pathname]);

  const visibleSections = navSections
    .map((s) => ({
      ...s,
      items: s.items.filter((l) => !l.ownerOnly || ownerNav),
    }))
    .filter((s) => s.items.length > 0);
  const visibleMoreLinks = moreLinks
    .filter((l) => !l.ownerOnly || ownerNav)
    .map((l) => ({ ...l, label: navLabel(l, ownerNav) }));
  const moreActive = visibleMoreLinks.some((l) => location.pathname.startsWith(l.to));

  function offlineNavClass(to: string) {
    return !online && to !== '/vender' ? ' is-nav-offline' : '';
  }

  return (
    <ShellTitleContext.Provider value={setTitleOverride}>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand-lockup">
            <img src="/brand/lscala-logo.png" alt="L'Scala" />
            <strong>L'Scala</strong>
          </div>
          <NavLink
            to={pinnedNav.to}
            end={pinnedNav.end}
            className={({ isActive }) =>
              `nav-pinned${isActive ? ' active' : ''}${offlineNavClass(pinnedNav.to)}`
            }
            title={!online && pinnedNav.to !== '/vender' ? 'Se necesita conexión' : undefined}
          >
            <span className="nav-ico"><pinnedNav.icon size={18} /></span>
            {pinnedNav.label}
          </NavLink>
          <nav className="nav-primary" aria-label="Accesos frecuentes">
            {primaryNav.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  `${isActive ? 'active' : ''}${offlineNavClass(l.to)}`.trim()
                }
                title={!online && l.to !== '/vender' ? 'Se necesita conexión' : undefined}
              >
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
                  <NavLink
                    key={l.to}
                    to={l.to}
                    className={({ isActive }) =>
                      `${isActive ? 'active' : ''}${offlineNavClass(l.to)}`.trim()
                    }
                    title={!online && l.to !== '/vender' ? 'Se necesita conexión' : undefined}
                  >
                    <span className="nav-ico"><l.icon size={18} /></span>
                    {navLabel(l, ownerNav)}
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

          <OfflineBanner />
          <PwaInstallHint />

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
                <div className="topbar-workplace-switch">
                  <WorkplaceSwitcher compact posOnly />
                </div>
              )}
              <NotificationBell />
              <div className="user-menu" ref={userMenuRef}>
                <button
                  className={`user-chip${userMenuOpen ? ' is-open' : ''}`}
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                  onClick={() => setUserMenuOpen((v) => !v)}
                >
                  <span className="avatar">{initials(user?.fullName)}</span>
                  <span className="user-chip-text">
                    <strong>{user?.fullName?.split(' ')[0] || 'Usuaria'}</strong>
                    <span>{roleLabel}</span>
                  </span>
                  <span className="user-chip-chevron">
                    <IconChevronDown size={14} />
                  </span>
                </button>
                {userMenuOpen && (
                  <div className="user-menu-panel" role="menu">
                    <div className="user-menu-head">
                      <strong>{user?.fullName}</strong>
                      <span className="muted">{user?.email}</span>
                      <span className="muted">{roleLabel} · {activeBranch?.name}</span>
                    </div>
                    <button
                      className="user-menu-item"
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setUserMenuOpen(false);
                        setAccountOpen(true);
                      }}
                    >
                      <IconUsers size={16} /> Mi cuenta
                    </button>
                    <button
                      className="user-menu-item"
                      type="button"
                      role="menuitem"
                      onClick={openLogout}
                    >
                      <IconLogout size={16} /> Cerrar sesión
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
              className={({ isActive }) =>
                `${isActive ? 'active' : ''} ${l.primary ? 'primary' : ''}${offlineNavClass(l.to)}`.trim()
              }
              title={!online && l.to !== '/vender' ? 'Se necesita conexión' : undefined}
            >
              <span className="nav-ico"><l.icon size={20} /></span>
              {l.label}
            </NavLink>
          ))}
          <button
            type="button"
            className={`nav-more ${moreActive ? 'active' : ''}${!online ? ' is-nav-offline' : ''}`}
            onClick={() => setMoreOpen(true)}
          >
            <span className="nav-ico"><IconMore size={20} /></span>
            Más
          </button>
        </nav>

        <div className={`more-sheet mobile-only ${moreOpen ? 'open' : ''}`} onClick={() => setMoreOpen(false)}>
          <div className="more-sheet-panel" onClick={(e) => e.stopPropagation()}>
            <h3>Más opciones</h3>
            {isOwner ? (
              <div className="more-workplace">
                <WorkplaceSwitcher />
              </div>
            ) : (
              <div className="more-workplace">
                <WorkplaceSwitcher posOnly />
              </div>
            )}
            <div className="more-grid">
              {visibleMoreLinks.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  className={offlineNavClass(l.to).trim() || undefined}
                  title={!online && l.to !== '/vender' ? 'Se necesita conexión' : undefined}
                  onClick={() => setMoreOpen(false)}
                >
                  <span className="nav-ico"><l.icon size={18} /></span>
                  {l.label}
                </NavLink>
              ))}
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  setAccountOpen(true);
                }}
              >
                <span className="nav-ico"><IconUsers size={18} /></span>
                Mi cuenta
              </button>
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

        <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} />
        <ConfirmDialog
          open={logoutOpen}
          title="Cerrar sesión"
          message={logoutMessage}
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
