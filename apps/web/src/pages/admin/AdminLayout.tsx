import { type ReactNode } from 'react';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth';

/** Layout Ajustes: módulos separados. Sin título (lo pone AppShell). */
export function AdminLayout() {
  const { branches } = useAuth();
  const isOwner = branches.some((b) => b.role === 'owner');
  const { pathname } = useLocation();

  const intro = pathname.includes('/usuarias')
    ? 'Nombre, rol y cajas que cada persona puede usar.'
    : pathname.includes('/sucursales')
      ? 'Tiendas de L\'Scala. La sucursal activa se cambia arriba.'
      : pathname.includes('/cajas')
        ? 'Cada caja pertenece a una sucursal. Asigna cuáles puede usar cada usuaria.'
        : 'En este computador. Deja Atria Print Agent abierto en la barra de menú.';

  return (
    <div className="admin-page">
      <p className="admin-lede">{intro}</p>

      <nav className="admin-tabs" aria-label="Secciones de Ajustes">
        {isOwner ? (
          <>
            <NavLink
              to="/admin/usuarias"
              className={({ isActive }) => (isActive ? 'is-active' : undefined)}
            >
              Usuarias
            </NavLink>
            <NavLink
              to="/admin/sucursales"
              className={({ isActive }) => (isActive ? 'is-active' : undefined)}
            >
              Sucursales
            </NavLink>
            <NavLink
              to="/admin/cajas"
              className={({ isActive }) => (isActive ? 'is-active' : undefined)}
            >
              Cajas
            </NavLink>
          </>
        ) : null}
        <NavLink to="/admin/equipo" className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
          Impresoras
        </NavLink>
      </nav>

      <Outlet />
    </div>
  );
}

export function AdminHomeRedirect() {
  const { branches } = useAuth();
  const isOwner = branches.some((b) => b.role === 'owner');
  return <Navigate to={isOwner ? 'usuarias' : 'equipo'} replace />;
}

export function RequireOwner({ children }: { children: ReactNode }) {
  const { branches } = useAuth();
  const isOwner = branches.some((b) => b.role === 'owner');
  if (!isOwner) return <Navigate to="/admin/equipo" replace />;
  return children;
}
