import { Suspense, lazy, type ReactNode } from 'react';
import { Navigate, createBrowserRouter } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { RequireOnline } from './components/RequireOnline';
import { useAuth } from './lib/auth';
import { LoginPage } from './pages/LoginPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { PosPage } from './pages/PosPage';
import { SalesHistoryPage } from './pages/SalesHistoryPage';
import { ProductsPage } from './pages/ProductsPage';
import { InventoryPage } from './pages/InventoryPage';
import { MovementsPage } from './pages/MovementsPage';
import { MermasPage } from './pages/MermasPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { AdminLayout, AdminHomeRedirect, RequireOwner } from './pages/admin/AdminLayout';
import { AdminEquipoPage } from './pages/admin/AdminEquipoPage';
import { AdminSucursalesPage } from './pages/admin/AdminSucursalesPage';
import { AdminCajasPage } from './pages/admin/AdminCajasPage';
import { AdminUsuariasPage } from './pages/admin/AdminUsuariasPage';
import { IngresosListPage } from './pages/ingresos/IngresosListPage';
import { IngresoDetailPage } from './pages/ingresos/IngresoDetailPage';
import { ComprasListPage } from './pages/compras/ComprasListPage';
import { CompraNuevaPage } from './pages/compras/CompraNuevaPage';
import { CompraDetailPage } from './pages/compras/CompraDetailPage';
import {
  ReportsGastosPage,
  ReportsIngresosPage,
  ReportsMermasPage,
  ReportsStockPage,
  ReportsVentasPage,
} from './pages/reportes/ReportsViewPage';

// Cargadas de forma diferida: incluyen Recharts, no bloquean el resto de la app.
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const ReportsLayout = lazy(() =>
  import('./pages/reportes/ReportsLayout').then((m) => ({ default: m.ReportsLayout })),
);

function PageFallback() {
  return <p className="muted" style={{ padding: '2rem' }}>Cargando…</p>;
}

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>;
}

function OnlineOnly({ children }: { children: ReactNode }) {
  return <RequireOnline>{children}</RequireOnline>;
}

function Protected({ children }: { children: React.ReactNode }) {
  const { token, loading, branchId } = useAuth();
  if (loading) return <p className="muted" style={{ padding: '2rem' }}>Cargando…</p>;
  if (!token) return <Navigate to="/login" replace />;
  if (!branchId) return <p className="muted" style={{ padding: '2rem' }}>Sin sucursal asignada</p>;
  return children;
}

/** Data router: habilita `useBlocker` (p. ej. guardia de salida en Caja). */
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    path: '/',
    element: (
      <Protected>
        <AppShell />
      </Protected>
    ),
    children: [
      {
        index: true,
        element: (
          <OnlineOnly>
            <Lazy>
              <DashboardPage />
            </Lazy>
          </OnlineOnly>
        ),
      },
      { path: 'vender', element: <PosPage /> },
      {
        path: 'ventas',
        element: (
          <OnlineOnly>
            <SalesHistoryPage />
          </OnlineOnly>
        ),
      },
      {
        path: 'productos',
        element: (
          <OnlineOnly>
            <ProductsPage />
          </OnlineOnly>
        ),
      },
      {
        path: 'ingresos',
        element: (
          <OnlineOnly>
            <IngresosListPage />
          </OnlineOnly>
        ),
      },
      { path: 'ingresos/nuevo', element: <Navigate to="/compras/nuevo" replace /> },
      {
        path: 'ingresos/:id',
        element: (
          <OnlineOnly>
            <IngresoDetailPage />
          </OnlineOnly>
        ),
      },
      {
        path: 'compras',
        element: (
          <OnlineOnly>
            <ComprasListPage />
          </OnlineOnly>
        ),
      },
      {
        path: 'compras/nuevo',
        element: (
          <OnlineOnly>
            <CompraNuevaPage />
          </OnlineOnly>
        ),
      },
      {
        path: 'compras/:id',
        element: (
          <OnlineOnly>
            <CompraDetailPage />
          </OnlineOnly>
        ),
      },
      {
        path: 'inventario',
        element: (
          <OnlineOnly>
            <InventoryPage />
          </OnlineOnly>
        ),
      },
      {
        path: 'movimientos',
        element: (
          <OnlineOnly>
            <MovementsPage />
          </OnlineOnly>
        ),
      },
      {
        path: 'mermas',
        element: (
          <OnlineOnly>
            <MermasPage />
          </OnlineOnly>
        ),
      },
      {
        path: 'gastos',
        element: (
          <OnlineOnly>
            <ExpensesPage />
          </OnlineOnly>
        ),
      },
      {
        path: 'reportes',
        element: (
          <OnlineOnly>
            <Lazy>
              <ReportsLayout />
            </Lazy>
          </OnlineOnly>
        ),
        children: [
          { index: true, element: <Navigate to="ventas" replace /> },
          { path: 'ventas', element: <ReportsVentasPage /> },
          { path: 'stock', element: <ReportsStockPage /> },
          { path: 'ingresos', element: <ReportsIngresosPage /> },
          { path: 'gastos', element: <ReportsGastosPage /> },
          { path: 'mermas', element: <ReportsMermasPage /> },
        ],
      },
      {
        path: 'admin',
        element: (
          <OnlineOnly>
            <AdminLayout />
          </OnlineOnly>
        ),
        children: [
          { index: true, element: <AdminHomeRedirect /> },
          { path: 'equipo', element: <AdminEquipoPage /> },
          {
            path: 'sucursales',
            element: (
              <RequireOwner>
                <AdminSucursalesPage />
              </RequireOwner>
            ),
          },
          {
            path: 'cajas',
            element: (
              <RequireOwner>
                <AdminCajasPage />
              </RequireOwner>
            ),
          },
          {
            path: 'usuarias',
            element: (
              <RequireOwner>
                <AdminUsuariasPage />
              </RequireOwner>
            ),
          },
        ],
      },
    ],
  },
]);
