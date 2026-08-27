import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  IconAlertTriangle,
  IconBox,
  IconCamera,
  IconReceipt,
  IconSwap,
  IconTruck,
  IconWallet,
} from '../components/icons';
import { api, money } from '../lib/api';
import { useAuth } from '../lib/auth';
import { chartColor } from '../lib/chartColors';
import { personalDayGreeting } from '../lib/dayGreeting';
import { BoutiqueLoader } from '../components/BoutiqueLoader';

type ExpenseRow = {
  id: string;
  category: string;
  description: string;
  amount: string;
  incurred_on: string;
};

type LowRotationRow = {
  id: string;
  name: string;
  internal_code: string;
  last_movement_at: string | null;
  days_without_movement: number;
  /** Alias temporal del API (= days_without_movement). No usar como “vendidos”. */
  qty_sold?: number;
};

type Summary = {
  salesDay: { total: string; count: string };
  salesMonth: { total: string; count: string };
  salesLast30: { total: string; count: string; units: string };
  topProducts: { id: string; name: string; internal_code: string; qty_sold: number; revenue: string }[];
  lowRotation: LowRotationRow[];
  categorySales: { name: string; qty: number; revenue: string }[];
  salesTrend: { day: string; total: string; count: string }[];
  expensesMonth: { total: string };
  expensesRecent: ExpenseRow[];
  reinvestmentMonth: { total: string; docs: string };
  pendingReceptions: number;
  pendingPhotos: number;
  alertsCount: { lowStock: number; noMovement: number; vouchersExpiring: number };
};

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const date = label
    ? new Date(`${label}T00:00:00`).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
    : '';
  return (
    <div className="chart-tooltip">
      <strong>{date}</strong>
      <span>{money(payload[0].value)}</span>
    </div>
  );
}

function CategoryTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { name: string; qty: number; revenue: string } }[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <strong>{d.name}</strong>
      <span>
        {d.qty} vendidos · {money(d.revenue)}
      </span>
    </div>
  );
}

function ticketLabel(count: string | number) {
  const n = Number(count);
  return `${n} ${n === 1 ? 'ticket' : 'tickets'}`;
}

function unitLabel(count: string | number, one: string, many: string) {
  const n = Number(count);
  return `${n} ${n === 1 ? one : many}`;
}

function formatShortDate(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
}

function daysWithoutMovementLabel(row: {
  last_movement_at: string | null;
  days_without_movement: number;
}) {
  if (row.last_movement_at == null) return 'Sin movimientos aún';
  const n = Number(row.days_without_movement);
  if (!Number.isFinite(n) || n < 0) return 'Sin movimientos aún';
  if (n === 1) return '1 día';
  return `${n} días`;
}

export function DashboardPage() {
  const { user, branches, branchId } = useAuth();
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const branchName = branches.find((b) => b.id === branchId)?.name || 'Sucursal';
  const greeting = useMemo(() => personalDayGreeting(user?.fullName), [user?.fullName]);

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString('es-CL', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError('');
    (async () => {
      try {
        const summary = await api<Summary>('/api/dashboard/summary');
        if (!cancelled) setData(summary);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  if (error) return <p className="error">{error}</p>;
  if (!data) {
    return <BoutiqueLoader label="Preparando el salón de hoy…" variant="block" />;
  }

  const totalAlerts =
    data.alertsCount.lowStock + data.alertsCount.noMovement + data.alertsCount.vouchersExpiring;
  const avgTicket =
    Number(data.salesLast30.count) > 0
      ? Number(data.salesLast30.total) / Number(data.salesLast30.count)
      : 0;
  const categoryData = data.categorySales.filter((c) => c.qty > 0);
  const trendMax = Math.max(...data.salesTrend.map((d) => Number(d.total) || 0), 1);

  const salesMonth = Number(data.salesMonth.total) || 0;
  const expensesMonth = Number(data.expensesMonth.total) || 0;
  const reinvestmentMonth = Number(data.reinvestmentMonth?.total) || 0;
  const cashOut = expensesMonth + reinvestmentMonth;
  const netMonth = salesMonth - cashOut;
  const compareMax = Math.max(salesMonth, expensesMonth, reinvestmentMonth, 1);
  const compareRows = [
    { key: 'sales', label: 'Ventas', value: salesMonth, tone: 'in' as const },
    { key: 'ops', label: 'Gastos operación', value: expensesMonth, tone: 'out' as const },
    {
      key: 'stock',
      label: 'Reinversión mercadería',
      value: reinvestmentMonth,
      tone: 'invest' as const,
    },
  ];

  const attention = [
    {
      to: '/inventario?onlyLow=1',
      label: 'Stock bajo',
      value: data.alertsCount.lowStock,
      icon: IconAlertTriangle,
      tone: data.alertsCount.lowStock > 0 ? 'danger' : 'ok',
    },
    {
      to: '/movimientos',
      label: 'Sin movimiento',
      value: data.alertsCount.noMovement,
      icon: IconSwap,
      tone: data.alertsCount.noMovement > 0 ? 'warn' : 'ok',
    },
    {
      to: '/mermas',
      label: 'Vouchers por vencer',
      value: data.alertsCount.vouchersExpiring,
      icon: IconReceipt,
      tone: data.alertsCount.vouchersExpiring > 0 ? 'warn' : 'ok',
    },
    {
      to: '/ingresos',
      label: 'Por recibir',
      value: data.pendingReceptions,
      icon: IconTruck,
      tone: data.pendingReceptions > 0 ? 'warn' : 'ok',
    },
    {
      to: '/productos',
      label: 'Sin foto',
      value: data.pendingPhotos,
      icon: IconCamera,
      tone: data.pendingPhotos > 0 ? 'warn' : 'ok',
    },
  ] as const;

  return (
    <div className="dash">
      <section className="dash-hero dash-hero-plain" aria-label="Resumen del día">
        <div className="dash-hero-copy">
          <p className="dash-kicker">Hoy en {branchName}</p>
          <h2 className="dash-hero-title">{greeting}</h2>
          <p className="dash-hero-sub">
            {todayLabel} · Toda la sucursal
          </p>
        </div>
        <div className="dash-hero-metrics">
          <div>
            <span>Ventas del día</span>
            <strong>{money(data.salesDay.total)}</strong>
            <em>{ticketLabel(data.salesDay.count)} · sucursal</em>
          </div>
          <div>
            <span>Ventas del mes</span>
            <strong>{money(data.salesMonth.total)}</strong>
            <em>{ticketLabel(data.salesMonth.count)} · sucursal</em>
          </div>
        </div>
      </section>

      <nav className="dash-action-strip desktop-only" aria-label="Acciones rápidas">
        <Link to="/compras" className="btn secondary dash-action-btn">
          <IconReceipt size={18} />
          Compras
        </Link>
      </nav>

      <section className="dash-section">
        <header className="dash-section-head">
          <div>
            <p className="dash-kicker">Caja del mes</p>
            <h3>Ventas frente a salidas</h3>
          </div>
          <Link className="dash-text-link" to="/gastos">
            Ver gastos →
          </Link>
        </header>

        <div className="dash-finance">
          <article className="dash-panel dash-finance-compare">
            <div className="dash-panel-head">
              <h4>Ventas vs salidas</h4>
              <span className={`badge ${netMonth >= 0 ? 'success' : 'warning'}`}>
                {netMonth >= 0 ? 'Neto positivo' : 'Neto negativo'}
              </span>
            </div>
            <p className="dash-panel-note">
              Las compras cuentan como <strong>reinversión en mercadería</strong>, aparte de los
              gastos de operación.
            </p>
            <ul className="dash-compare-list">
              {compareRows.map((row) => (
                <li key={row.key} className={`dash-compare-row tone-${row.tone}`}>
                  <div className="dash-compare-meta">
                    <span>{row.label}</span>
                    <strong>{money(row.value)}</strong>
                  </div>
                  <div className="dash-compare-track" aria-hidden>
                    <span style={{ width: `${Math.round((row.value / compareMax) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            <div className="dash-finance-net">
              <div>
                <span>Salida total</span>
                <strong>{money(cashOut)}</strong>
              </div>
              <div>
                <span>Neto del mes</span>
                <strong className={netMonth >= 0 ? 'is-up' : 'is-down'}>{money(netMonth)}</strong>
              </div>
            </div>
          </article>

          <article className="dash-panel dash-finance-expenses">
            <div className="dash-panel-head">
              <h4>Gastos a revisar</h4>
              <Link className="dash-text-link" to="/gastos">
                + Registrar
              </Link>
            </div>
            <div className="dash-finance-sum">
              <span>Operación del mes</span>
              <strong>{money(expensesMonth)}</strong>
            </div>
            <div className="dash-finance-sum soft">
              <span>
                Reinversión · {Number(data.reinvestmentMonth?.docs || 0)} compra
                {Number(data.reinvestmentMonth?.docs || 0) === 1 ? '' : 's'}
              </span>
              <strong>{money(reinvestmentMonth)}</strong>
            </div>
            {!data.expensesRecent?.length ? (
              <p className="dash-empty-line">Aún no hay gastos registrados este mes.</p>
            ) : (
              <ul className="dash-expense-list">
                {data.expensesRecent.map((e) => (
                  <li key={e.id}>
                    <div>
                      <strong>{e.category}</strong>
                      <span>
                        {formatShortDate(e.incurred_on)}
                        {e.description ? ` · ${e.description}` : ''}
                      </span>
                    </div>
                    <em>{money(e.amount)}</em>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </div>
      </section>

      <section className="dash-section">
        <header className="dash-section-head">
          <div>
            <p className="dash-kicker">Resumen</p>
            <h3>Números de la sucursal</h3>
            <p className="dash-section-note">Incluye todas las cajas de {branchName}</p>
          </div>
        </header>

        <div className="dash-kpi-grid">
          <article className="dash-kpi featured">
            <div className="dash-kpi-top">
              <span>Ticket promedio · 30 días</span>
              <span className="dash-kpi-ico">
                <IconSwap size={16} />
              </span>
            </div>
            <strong>{money(avgTicket)}</strong>
            <p>
              {unitLabel(data.salesLast30.units, 'prenda vendida', 'prendas vendidas')} · sucursal
            </p>
          </article>
          <article className="dash-kpi">
            <div className="dash-kpi-top">
              <span>Gastos operación</span>
              <span className="dash-kpi-ico">
                <IconWallet size={16} />
              </span>
            </div>
            <strong>{money(expensesMonth)}</strong>
            <p>Sin contar reinversión</p>
          </article>
          <article className="dash-kpi">
            <div className="dash-kpi-top">
              <span>Reinversión mercadería</span>
              <span className="dash-kpi-ico">
                <IconReceipt size={16} />
              </span>
            </div>
            <strong>{money(reinvestmentMonth)}</strong>
            <p>Compras del mes</p>
          </article>
          <article className={`dash-kpi ${totalAlerts ? 'alert' : ''}`}>
            <div className="dash-kpi-top">
              <span>Alertas activas</span>
              <span className="dash-kpi-ico">
                <IconBox size={16} />
              </span>
            </div>
            <strong>{totalAlerts}</strong>
            <p>{totalAlerts ? 'Ver notificaciones arriba' : 'Sin alertas por ahora'}</p>
          </article>
        </div>
      </section>

      <section className="dash-section">
        <header className="dash-section-head">
          <div>
            <p className="dash-kicker">Avisos</p>
            <h3>Pendientes por revisar</h3>
          </div>
        </header>
        <div className="dash-attention">
          {attention.map((item) => {
            const hideOnMobile =
              item.to === '/ingresos' || item.to.startsWith('/ingresos?');
            return (
              <Link
                key={item.to + item.label}
                to={item.to}
                className={`dash-chip tone-${item.tone}${hideOnMobile ? ' desktop-only' : ''}`}
              >
                <span className="dash-chip-ico">
                  <item.icon size={16} />
                </span>
                <span className="dash-chip-body">
                  <em>{item.label}</em>
                  <strong>{item.value}</strong>
                </span>
                <span className="dash-chip-go" aria-hidden>
                  →
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="dash-section">
        <header className="dash-section-head">
          <div>
            <p className="dash-kicker">Gráficos</p>
            <h3>Ventas recientes y por categoría</h3>
          </div>
        </header>
        <div className="dash-charts">
          <article className="dash-panel">
            <div className="dash-panel-head">
              <h4>Ventas · 14 días</h4>
              <span className="muted">Máx. {money(trendMax)}</span>
            </div>
            <div className="chart-shell">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.salesTrend} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                  <defs>
                    <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#E6007E" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#E6007E" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#f2d5e4" strokeDasharray="4 6" />
                  <XAxis
                    dataKey="day"
                    tickFormatter={(v: string) =>
                      new Date(`${v}T00:00:00`).toLocaleDateString('es-CL', {
                        day: '2-digit',
                        month: 'short',
                      })
                    }
                    tick={{ fontSize: 11, fill: '#6e5a64', fontFamily: 'DM Sans, sans-serif' }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={28}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#6e5a64', fontFamily: 'DM Sans, sans-serif' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                    width={38}
                  />
                  <Tooltip content={<TrendTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#E6007E"
                    strokeWidth={2.2}
                    fill="url(#salesFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="dash-panel">
            <div className="dash-panel-head">
              <h4>Por categoría · 30 días</h4>
            </div>
            {!categoryData.length ? (
              <div className="dash-empty dash-empty-plain">
                <div>
                  <strong>Todavía no hay ventas por categoría</strong>
                  <p>Cuando registres ventas, aquí verás cuánto se vende de cada tipo de prenda.</p>
                </div>
              </div>
            ) : (
              <div className="chart-shell">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={categoryData}
                    layout="vertical"
                    margin={{ top: 4, right: 16, bottom: 0, left: 0 }}
                  >
                    <CartesianGrid horizontal={false} stroke="#f2d5e4" strokeDasharray="4 6" />
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={108}
                      tick={{ fontSize: 12, fill: '#2a1a22', fontFamily: 'DM Sans, sans-serif' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<CategoryTooltip />} cursor={{ fill: 'rgba(230,0,126,0.06)' }} />
                    <Bar dataKey="qty" radius={[0, 8, 8, 0]} barSize={14}>
                      {categoryData.map((entry, i) => (
                        <Cell key={entry.name} fill={chartColor(i)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </article>
        </div>
      </section>

      <section className="dash-section">
        <header className="dash-section-head">
          <div>
            <p className="dash-kicker">Inventario</p>
            <h3>Más vendidos y sin movimiento</h3>
          </div>
          <Link className="dash-text-link" to="/reportes">
            Ver reportes →
          </Link>
        </header>

        <div className="dash-rotation">
          <article className="dash-panel">
            <div className="dash-panel-head">
              <h4>Más vendidos</h4>
              <span className="badge brand">Top</span>
            </div>
            <p className="dash-panel-note">Prendas con más salida en la sucursal</p>
            {!data.topProducts.length ? (
              <p className="dash-empty-line">Aún no hay ventas en este período.</p>
            ) : (
              <ol className="dash-rank dash-rank-scroll">
                {data.topProducts.map((p, i) => (
                  <li key={p.id}>
                    <span className="dash-rank-n">{i + 1}</span>
                    <div className="dash-rank-body">
                      <strong>{p.name}</strong>
                      <span>
                        {p.internal_code} · {p.qty_sold} vendidos
                      </span>
                    </div>
                    <em>{money(p.revenue)}</em>
                  </li>
                ))}
              </ol>
            )}
          </article>

          <article className="dash-panel">
            <div className="dash-panel-head">
              <h4>Sin movimiento</h4>
              <span className="badge warning">Revisar</span>
            </div>
            <p className="dash-panel-note">Prendas sin salida reciente en la sucursal</p>
            {!data.lowRotation.length ? (
              <p className="dash-empty-line">No hay prendas pendientes de revisar por ahora.</p>
            ) : (
              <ol className="dash-rank soft dash-rank-scroll">
                {data.lowRotation.map((p, i) => (
                  <li key={p.id}>
                    <span className="dash-rank-n">{i + 1}</span>
                    <div className="dash-rank-body">
                      <strong>{p.name}</strong>
                      <span>{p.internal_code}</span>
                    </div>
                    <em>{daysWithoutMovementLabel(p)}</em>
                  </li>
                ))}
              </ol>
            )}
          </article>
        </div>
      </section>
    </div>
  );
}
