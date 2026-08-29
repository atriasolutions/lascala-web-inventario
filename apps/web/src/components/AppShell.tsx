import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useNetworkStatus } from '../lib/networkStatus';
import { countPendingOfflineSales } from '../lib/posCatalogCache';
import { AccountSheet } from './AccountSheet';
import { ConfirmDialog } from './ConfirmDialog';
import { HelpModeBanner } from './help/HelpModeProvider';
import { HelpModeToggle } from './help/HelpModeToggle';
import { NotificationBell } from './NotificationBell';
import { OfflineBanner } from './OfflineBanner';
import { PwaInstallHint } from './PwaInstallHint';
import { ShellTitleContext } from './shellTitle';
import { WorkplaceSwitcher } from './WorkplaceSwitcher';
import { canUseMobileApp, isAdminRole, roleLabel as formatRoleLabel } from '../lib/roles';
import { useMobileViewport } from '../hooks/useMobileViewport';
import {
  IconAlertTriangle,
  IconBox,
  IconClipboardList,
  IconChart,
  IconChevronDown,
  IconHelp,
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

type NavItem = {
  to: string;
  label: string;
  icon: typeof IconHome;
  helpKey: string;
  end?: boolean;
  primary?: boolean;
  /** Si falta, lo ven los tres roles de piso. */
  roles?: Array<'owner' | 'branch_manager' | 'seller'>;
};

const adminOnly: NavItem['roles'] = ['owner'];

const pinnedNav: NavItem = {
  to: '/',
  label: 'Dashboard',
  icon: IconHome,
  helpKey: 'nav.dashboard',
  end: true,
  roles: adminOnly,
};

/**
 * Sidebar desktop — grupos colapsables.
 * Tienda / Administración / Control logístico; pie: Ayuda → Ajustes.
 */
const navSections: { id: string; label: string; items: NavItem[] }[] = [
  {
    id: 'tienda',
    label: 'Tienda',
    items: [
      { to: '/vender', label: 'Ventas', icon: IconPos, helpKey: 'nav.caja' },
      { to: '/ingresos', label: 'Ingresos', icon: IconTruck, helpKey: 'nav.ingresos' },
      { to: '/mermas', label: 'Mermas y cambios', icon: IconAlertTriangle, helpKey: 'nav.mermas' },
    ],
  },
  {
    id: 'administracion',
    label: 'Administración',
    items: [
      { to: '/compras', label: 'Compras', icon: IconReceipt, helpKey: 'nav.compras', roles: adminOnly },
      { to: '/ventas', label: 'Historial de ventas', icon: IconReceipt, helpKey: 'nav.ventas' },
      { to: '/gastos', label: 'Gastos', icon: IconWallet, helpKey: 'nav.gastos', roles: adminOnly },
      { to: '/reportes', label: 'Reportes', icon: IconChart, helpKey: 'nav.reportes', roles: adminOnly },
    ],
  },
  {
    id: 'logistica',
    label: 'Control logístico',
    items: [
      { to: '/productos', label: 'Productos', icon: IconShirt, helpKey: 'nav.productos' },
      { to: '/inventario', label: 'Stock', icon: IconBox, helpKey: 'nav.stock', end: true },
      { to: '/inventarios', label: 'Inventarios', icon: IconClipboardList, helpKey: 'nav.inventarios' },
      { to: '/movimientos', label: 'Movimientos', icon: IconSwap, helpKey: 'nav.movimientos' },
    ],
  },
];

const helpNavItem: NavItem = {
  to: '/ayuda',
  label: 'Ayuda',
  icon: IconHelp,
  helpKey: 'nav.ayuda',
};

const settingsNavItem: NavItem = {
  to: '/admin',
  label: 'Ajustes',
  icon: IconUsers,
  helpKey: 'nav.ajustes',
};

/** Bottom nav móvil (administradora): Inicio, Compras, Gastos + Más. */
const primaryMobile: NavItem[] = [
  { to: '/', label: 'Inicio', icon: IconHome, helpKey: 'nav.dashboard', end: true, roles: adminOnly },
  { to: '/compras', label: 'Compras', icon: IconReceipt, helpKey: 'nav.compras', roles: adminOnly },
  { to: '/gastos', label: 'Gastos', icon: IconWallet, helpKey: 'nav.gastos', roles: adminOnly },
];

/** Sheet «Más» — operación de piso (POS, ingresos, mermas) solo en desktop. */
const moreLinks: NavItem[] = [
  { to: '/productos', label: 'Productos', icon: IconShirt, helpKey: 'nav.productos' },
  { to: '/inventario', label: 'Stock', icon: IconBox, helpKey: 'nav.stock', end: true },
  { to: '/movimientos', label: 'Movimientos', icon: IconSwap, helpKey: 'nav.movimientos' },
  { to: '/reportes', label: 'Reportes', icon: IconChart, helpKey: 'nav.reportes', roles: adminOnly },
  { to: '/ayuda', label: 'Ayuda', icon: IconHelp, helpKey: 'nav.ayuda' },
  { to: '/admin', label: 'Ajustes', icon: IconUsers, helpKey: 'nav.ajustes' },
];

const NAV_SECTIONS_LS_KEY = 'lscala-nav-sections-open';

const DEFAULT_OPEN_SECTIONS: Record<string, boolean> = {
  tienda: true,
  administracion: true,
  logistica: true,
};

function canSeeNav(item: NavItem, role: string) {
  if (!item.roles) return true;
  return item.roles.includes(role as 'owner' | 'branch_manager' | 'seller');
}

function readOpenSections(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(NAV_SECTIONS_LS_KEY);
    if (!raw) return { ...DEFAULT_OPEN_SECTIONS };
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return { ...DEFAULT_OPEN_SECTIONS, ...parsed };
  } catch {
    return { ...DEFAULT_OPEN_SECTIONS };
  }
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
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(readOpenSections);
  const location = useLocation();
  const isMobile = useMobileViewport();
  const activeBranch = branches.find((b) => b.id === branchId);
  const role = activeBranch?.role || '';
  const isOwner = isAdminRole(role);
  const mobileAllowed = canUseMobileApp(user, role);
  const roleLabel = role ? formatRoleLabel(role) : '';

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

  const toggleSection = useCallback((id: string) => {
    setOpenSections((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(NAV_SECTIONS_LS_KEY, JSON.stringify(next));
      } catch {
        /* ignore quota */
      }
      return next;
    });
  }, []);

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
    if (location.pathname.startsWith('/vender')) return 'Ventas';
    if (location.pathname === '/ventas' || location.pathname.startsWith('/ventas?')) {
      return isMobile ? 'Ventas' : 'Historial de ventas';
    }
    if (location.pathname === '/compras/nuevo') return 'Nueva compra';
    if (/^\/compras\/[^/]+$/.test(location.pathname)) return 'Compra';
    if (location.pathname === '/compras' || location.pathname.startsWith('/compras?')) return 'Compras';
    if (location.pathname.startsWith('/compras')) return 'Compras';
    if (/^\/ingresos\/[^/]+$/.test(location.pathname)) return 'Recepción de mercadería';
    if (location.pathname === '/ingresos' || location.pathname.startsWith('/ingresos?')) return 'Ingresos';
    if (location.pathname.startsWith('/ingresos')) return 'Ingresos';
    if (location.pathname.startsWith('/inventarios')) return 'Inventarios';
    if (location.pathname.startsWith('/ayuda')) return 'Ayuda';
    if (location.pathname.startsWith('/admin')) return 'Ajustes';
    const hit = [...navSections.flatMap((s) => s.items), ...primaryMobile].find((l) =>
      'end' in l && l.end ? location.pathname === l.to : location.pathname.startsWith(l.to),
    );
    return hit ? hit.label : "L'Scala";
  }, [location.pathname, titleOverride, isMobile]);

  const eyebrow = useMemo(() => {
    if (location.pathname.startsWith('/admin')) return "Boutique L'Scala · administración";
    if (location.pathname.startsWith('/compras') || location.pathname.startsWith('/reportes')) {
      return "Boutique L'Scala · administración";
    }
    if (location.pathname.startsWith('/productos') || location.pathname.startsWith('/inventario')) {
      return "Boutique L'Scala · control logístico";
    }
    return "Boutique L'Scala · tienda";
  }, [location.pathname]);

  const visibleSections = useMemo(
    () =>
      navSections
        .map((s) => ({
          ...s,
          items: s.items.filter((l) => canSeeNav(l, role)),
        }))
        .filter((s) => s.items.length > 0),
    [role],
  );
  const visibleMoreLinks = moreLinks.filter((l) => canSeeNav(l, role));
  const visibleMobile = primaryMobile.filter((l) => canSeeNav(l, role));
  const showPinned = canSeeNav(pinnedNav, role);
  const showSettingsNav = canSeeNav(settingsNavItem, role);
  const moreActive = visibleMoreLinks.some((l) => location.pathname.startsWith(l.to));

  /** Abre la sección que contiene la ruta activa (sin pisar el resto del acordeón). */
  useEffect(() => {
    const activeId = visibleSections.find((s) =>
      s.items.some((l) =>
        l.end ? location.pathname === l.to : location.pathname.startsWith(l.to),
      ),
    )?.id;
    if (!activeId) return;
    setOpenSections((prev) => {
      if (prev[activeId]) return prev;
      const next = { ...prev, [activeId]: true };
      try {
        localStorage.setItem(NAV_SECTIONS_LS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [location.pathname, visibleSections]);

  function offlineNavClass(to: string) {
    return !online && to !== '/vender' ? ' is-nav-offline' : '';
  }

  if (isMobile && !mobileAllowed) {
    return (
      <>
        <div className="mobile-admin-blocked">
          <div className="mobile-blocked-screen">
            <img className="mobile-blocked-logo" src="/brand/lscala-logo.png" alt="L'Scala" />
            <h1 className="mobile-blocked-title">Operación en computador</h1>
            <p className="mobile-blocked-copy">
              Esta versión móvil es solo para administración. Usa un computador para operar en piso.
            </p>
            <button type="button" className="btn primary" onClick={openLogout}>
              Cerrar sesión
            </button>
          </div>
        </div>
        <ConfirmDialog
          open={logoutOpen}
          title="Cerrar sesión"
          message={logoutMessage}
          confirmLabel="Cerrar sesión"
          cancelLabel="Cancelar"
          onConfirm={doLogout}
          onCancel={cancelLogout}
        />
      </>
    );
  }

  return (
    <ShellTitleContext.Provider value={setTitleOverride}>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand-lockup">
            <img src="/brand/lscala-logo.png" alt="L'Scala" />
            <strong>L'Scala</strong>
          </div>
          {showPinned ? (
          <NavLink
            to={pinnedNav.to}
            end={pinnedNav.end}
            data-help={pinnedNav.helpKey}
            className={({ isActive }) =>
              `nav-pinned${isActive ? ' active' : ''}${offlineNavClass(pinnedNav.to)}`
            }
            title={!online && pinnedNav.to !== '/vender' ? 'Se necesita conexión' : undefined}
          >
            <span className="nav-ico"><pinnedNav.icon size={18} /></span>
            {pinnedNav.label}
          </NavLink>
          ) : null}
          <nav className="nav-list" aria-label="Menú principal">
            {visibleSections.map((section) => {
              const isOpen = openSections[section.id] !== false;
              const panelId = `nav-section-${section.id}`;
              return (
                <div
                  className={`nav-section${isOpen ? ' is-open' : ''}${
                    section.id === 'tienda' ? ' is-piso' : ''
                  }`}
                  key={section.id}
                >
                  <button
                    type="button"
                    className="nav-section-toggle"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggleSection(section.id)}
                  >
                    <span className="nav-section-label">{section.label}</span>
                    <span className="nav-section-chevron" aria-hidden>
                      <IconChevronDown size={14} />
                    </span>
                  </button>
                  <div
                    id={panelId}
                    className="nav-section-panel"
                    role="region"
                    hidden={!isOpen}
                  >
                    {section.items.map((l) => (
                      <NavLink
                        key={l.to}
                        to={l.to}
                        end={l.end}
                        data-help={l.helpKey}
                        className={({ isActive }) =>
                          `${isActive ? 'active' : ''}${
                            section.id === 'tienda' ? ' nav-link-piso' : ''
                          }${offlineNavClass(l.to)}`.trim()
                        }
                        title={!online && l.to !== '/vender' ? 'Se necesita conexión' : undefined}
                      >
                        <span className="nav-ico"><l.icon size={18} /></span>
                        {l.label}
                      </NavLink>
                    ))}
                  </div>
                </div>
              );
            })}
          </nav>
          <div className="nav-sidebar-footer">
            <NavLink
              to={helpNavItem.to}
              data-help={helpNavItem.helpKey}
              className={({ isActive }) =>
                `nav-footer-link nav-help-link${isActive ? ' active' : ''}${offlineNavClass(helpNavItem.to)}`
              }
              title={!online ? 'Se necesita conexión' : undefined}
            >
              <span className="nav-ico">
                <helpNavItem.icon size={18} />
              </span>
              {helpNavItem.label}
            </NavLink>
            {showSettingsNav ? (
              <NavLink
                to={settingsNavItem.to}
                data-help={settingsNavItem.helpKey}
                className={({ isActive }) =>
                  `nav-footer-link${isActive ? ' active' : ''}${offlineNavClass(settingsNavItem.to)}`
                }
                title={!online ? 'Se necesita conexión' : undefined}
              >
                <span className="nav-ico">
                  <settingsNavItem.icon size={18} />
                </span>
                {settingsNavItem.label}
              </NavLink>
            ) : null}
          </div>
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
              <HelpModeToggle />
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
              <h1>{title}</h1>
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
              <HelpModeToggle />
              <NotificationBell />
              <div className="user-menu" ref={userMenuRef}>
                <button
                  className={`user-chip${userMenuOpen ? ' is-open' : ''}`}
                  type="button"
                  data-help="header.usuaria"
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                  onClick={() => setUserMenuOpen((v) => !v)}
                >
                  <span className="avatar">{initials(user?.fullName)}</span>
                  <span className="user-chip-text">
                    <strong>{user?.fullName?.split(' ')[0] || 'Usuario'}</strong>
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

          <HelpModeBanner />

          <div className="main-content">
            <Outlet />
          </div>
        </div>

        <nav className="bottom-nav mobile-only" aria-label="Navegación principal">
          {visibleMobile.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              data-help={l.helpKey}
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
            data-help="nav.mas"
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
                  end={l.end}
                  data-help={l.helpKey}
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
