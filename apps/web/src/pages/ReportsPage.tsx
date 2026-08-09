import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, money } from '../lib/api';
import { chartColor } from '../lib/chartColors';

type Summary = {
  salesMonth: { total: string; count: string };
  salesLast30: { total: string; count: string; units: string };
  topProducts: { id: string; name: string; internal_code: string; qty_sold: number; revenue: string }[];
  lowRotation: { id: string; name: string; internal_code: string; qty_sold: number }[];
  categorySales: { name: string; qty: number; revenue: string }[];
  expensesMonth: { total: string };
};

function RevenueTooltip({ active, payload }: { active?: boolean; payload?: { payload: { name: string; qty: number; revenue: string } }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <strong>{d.name}</strong>
      <span>{money(d.revenue)} · {d.qty} un.</span>
    </div>
  );
}

export function ReportsPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const summary = await api<Summary>('/api/dashboard/summary');
        setData(summary);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error');
      }
    })();
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Generando reportes…</p>;

  const revenueByCategory = data.categorySales.filter((c) => Number(c.revenue) > 0);
  const net = Number(data.salesMonth.total) - Number(data.expensesMonth.total);

  return (
    <div className="grid" style={{ gap: '1rem' }}>
      <div className="page-intro">
        <h2>Reportes</h2>
        <p>Información consolidada para apoyar la gestión del negocio</p>
      </div>

      <div className="grid stats">
        <div className="card stat">
          <span className="muted">Ingresos del mes</span>
          <strong>{money(data.salesMonth.total)}</strong>
          <span className="muted">{data.salesMonth.count} ventas</span>
        </div>
        <div className="card stat">
          <span className="muted">Gastos del mes</span>
          <strong>{money(data.expensesMonth.total)}</strong>
        </div>
        <div className="card stat">
          <span className="muted">Resultado del mes</span>
          <strong style={{ color: net >= 0 ? 'var(--color-success)' : '#b00040' }}>{money(net)}</strong>
          <span className="muted">Ingresos − gastos</span>
        </div>
        <div className="card stat">
          <span className="muted">Prendas vendidas (30d)</span>
          <strong>{data.salesLast30.units}</strong>
        </div>
      </div>

      <div className="card">
        <h2>Ingresos por categoría · 30 días</h2>
        {!revenueByCategory.length && <p className="muted">Sin ventas suficientes para este reporte</p>}
        {!!revenueByCategory.length && (
          <div className="chart-shell">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueByCategory} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid vertical={false} stroke="#f2d5e4" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6e5a64' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#6e5a64' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                  width={42}
                />
                <Tooltip content={<RevenueTooltip />} cursor={{ fill: 'rgba(230,0,126,0.06)' }} />
                <Bar dataKey="revenue" radius={[8, 8, 0, 0]} barSize={34}>
                  {revenueByCategory.map((entry, i) => (
                    <Cell key={entry.name} fill={chartColor(i)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid two">
        <div className="card">
          <h2>Ranking de rotación · top 5</h2>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Producto</th><th>Código</th><th>Vendidos</th><th>Ingreso</th></tr></thead>
              <tbody>
                {data.topProducts.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.internal_code}</td>
                    <td>{p.qty_sold}</td>
                    <td>{money(p.revenue)}</td>
                  </tr>
                ))}
                {!data.topProducts.length && <tr><td colSpan={4} className="muted">Sin datos</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h2>Baja rotación · seguimiento</h2>
          <p className="muted" style={{ marginTop: '-0.5rem', fontSize: '0.82rem' }}>Candidatos a promoción o revisión de precio</p>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Producto</th><th>Código</th><th>Vendidos 30d</th></tr></thead>
              <tbody>
                {data.lowRotation.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.internal_code}</td>
                    <td>{p.qty_sold}</td>
                  </tr>
                ))}
                {!data.lowRotation.length && <tr><td colSpan={3} className="muted">Sin datos</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
