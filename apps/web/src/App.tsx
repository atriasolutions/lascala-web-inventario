import { Suspense, lazy, type ReactNode } from 'react';
import { Navigate, createBrowserRouter } from 'react-router-dom';
import { AppShell } from './components/AppShell';
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
import { AdminPage } from './pages/AdminPage';
import { IngresosListPage } from './pages/ingresos/IngresosListPage';
import { IngresoDetailPage } from './pages/ingresos/IngresoDetailPage';
import { ComprasListPage } from './pages/compras/ComprasListPage';
import { CompraNuevaPage } from './pages/compras/CompraNuevaPage';
import { CompraDetailPage } from './pages/compras/CompraDetailPage';

// Cargadas de forma diferida: incluyen Recharts, no bloquean el resto de la app.
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));

function PageFallback() {
  return <p className="muted" style={{ padding: '2rem' }}>Cargando…</p>;
}

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>;
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
      { index: true, element: <Lazy><DashboardPage /></Lazy> },
      { path: 'vender', element: <PosPage /> },
      { path: 'ventas', element: <SalesHistoryPage /> },
      { path: 'productos', element: <ProductsPage /> },
      { path: 'ingresos', element: <IngresosListPage /> },
      { path: 'ingresos/nuevo', element: <Navigate to="/compras/nuevo" replace /> },
      { path: 'ingresos/:id', element: <IngresoDetailPage /> },
      { path: 'compras', element: <ComprasListPage /> },
      { path: 'compras/nuevo', element: <CompraNuevaPage /> },
      { path: 'compras/:id', element: <CompraDetailPage /> },
      { path: 'inventario', element: <InventoryPage /> },
      { path: 'movimientos', element: <MovementsPage /> },
      { path: 'mermas', element: <MermasPage /> },
      { path: 'gastos', element: <ExpensesPage /> },
      { path: 'reportes', element: <Lazy><ReportsPage /></Lazy> },
      { path: 'admin', element: <AdminPage /> },
    ],
  },
]);
