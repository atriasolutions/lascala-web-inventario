import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useMobileViewport } from '../../hooks/useMobileViewport';
import { api, money, userFacingError } from '../../lib/api';
import { unpackComprobante } from '../../lib/comprobanteEmbed';
import { chartColor } from '../../lib/chartColors';
import { paymentMethodLabel } from '../../lib/paymentMethod';
import { statusLabel } from '../../lib/purchasesStatus';
import { useReportsFilters } from './reportsContext';
import type { ReportsVista } from './reportsPeriod';
import type {
  GastosReport,
  IngresosReport,
  InventariosReport,
  MermasReport,
  ReportGrain,
  ReportSeriesPoint,
  StockReport,
  VentasReport,
} from './reportsTypes';

/** Loading unificado mientras llega GET /api/reports/:vista. */
export function ReportsPanelSkeleton() {
  return (
    <div className="reports-skel" aria-busy="true" aria-label="Cargando reporte">
      <div className="reports-skel-chart" />
      <div className="reports-skel-row" />
      <div className="reports-skel-row" />
      <div className="reports-skel-row" />
    </div>
  );
}

const MONTHS_CL = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const GRAIN_NOUN: Record<ReportGrain, string> = { day: 'día', week: 'semana', month: 'mes' };

function formatMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return ym;
  return `${MONTHS_CL[m - 1]} ${y}`;
}

/** Fallback si llega un period YYYY-MM-DD sin `series.label`. */
function formatPeriodFallback(period: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) {
    const [, m, d] = period.split('-').map(Number);
    return `${d} ${MONTHS_SHORT[(m || 1) - 1]}`;
  }
  if (/^\d{4}-\d{2}$/.test(period)) return formatMonth(period);
  return period;
}

function grainTitle(prefix: string, grain: ReportGrain) {
  return `${prefix} por ${GRAIN_NOUN[grain]}`;
}

type TimePoint = { period: string; label: string; value: number };

function timePointsFromSeries(
  grain: ReportGrain | undefined,
  series: ReportSeriesPoint[] | undefined,
  monthly: { month: string; total?: string; cost_total?: string }[] | undefined,
): { grain: ReportGrain; points: TimePoint[] } {
  if (series?.length) {
    return {
      grain: grain || 'month',
      points: series.map((s) => ({
        period: s.period,
        label: s.label || formatPeriodFallback(s.period),
        value: Number(s.total) || 0,
      })),
    };
  }
  return {
    grain: 'month',
    points: (monthly || []).map((r) => ({
      period: r.month,
      label: formatPeriodFallback(r.month),
      value: Number(r.total ?? r.cost_total) || 0,
    })),
  };
}

/** day: muestreo. week/month: en mobile menos ticks para no solapar. */
function xTicksForGrain(grain: ReportGrain, periods: string[], compact = false): string[] {
  const n = periods.length;
  const maxCompact = 5;
  if (!compact) {
    if (grain !== 'day' || n <= 8) return periods;
    const step = n <= 20 ? 4 : 7;
    const ticks: string[] = [];
    for (let i = 0; i < n; i += step) ticks.push(periods[i]!);
    const last = periods[n - 1]!;
    if (ticks[ticks.length - 1] !== last) ticks.push(last);
    return ticks;
  }
  // Mobile: máx. ~5 etiquetas legibles
  if (n <= maxCompact) return periods;
  if (grain === 'day') {
    const step = Math.max(1, Math.ceil((n - 1) / (maxCompact - 1)));
    const ticks: string[] = [];
    for (let i = 0; i < n; i += step) ticks.push(periods[i]!);
    const last = periods[n - 1]!;
    if (ticks[ticks.length - 1] !== last) ticks.push(last);
    return ticks;
  }
  const step = Math.max(1, Math.ceil((n - 1) / (maxCompact - 1)));
  const ticks: string[] = [];
  for (let i = 0; i < n; i += step) ticks.push(periods[i]!);
  const last = periods[n - 1]!;
  if (ticks[ticks.length - 1] !== last) ticks.push(last);
  return ticks;
}

function shortAxisLabel(label: string): string {
  // "ene 2026" / "Ene 2026" → "ene"
  const m = label.trim().match(/^([A-Za-zÁÉÍÓÚáéíóúÑñ]{3})\s+\d{4}$/);
  if (m) return m[1]!.toLowerCase();
  // "1–7 ene" ya corto
  if (label.length <= 8) return label;
  return label.slice(0, 7);
}

function TimeChartXAxis({ grain, points }: { grain: ReportGrain; points: TimePoint[] }) {
  const compact = useMobileViewport();
  const ticks = xTicksForGrain(
    grain,
    points.map((p) => p.period),
    compact,
  );
  const labelBy = new Map(points.map((p) => [p.period, p.label]));
  const angled = compact && ticks.length > 4;
  return (
    <XAxis
      dataKey="period"
      ticks={ticks}
      interval={0}
      minTickGap={compact ? 4 : 24}
      angle={angled ? -40 : 0}
      textAnchor={angled ? 'end' : 'middle'}
      height={angled ? 52 : 28}
      tick={{ fontSize: compact ? 10 : 11, fill: '#6e5a64' }}
      axisLine={false}
      tickLine={false}
      tickFormatter={(period: string) => {
        const label = labelBy.get(period) || period;
        return compact ? shortAxisLabel(label) : label;
      }}
    />
  );
}

function timeChartMargin(compact: boolean) {
  return {
    top: 12,
    right: compact ? 10 : 20,
    bottom: compact ? 12 : 8,
    left: compact ? 4 : 12,
  };
}

function formatCivilDate(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatSoldAt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function daysWithoutLabel(last: string | null, days: number | null) {
  if (last == null || days == null) return 'Sin movimientos aún';
  if (days === 1) return '1 día';
  return `${days} días`;
}

function ticketWord(n: number) {
  return `${n} ticket${n === 1 ? '' : 's'}`;
}

type TooltipRow = {
  value?: number;
  name?: string;
  color?: string;
  dataKey?: string | number;
  payload?: { label?: string; period?: string };
};

function MoneyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipRow[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const heading = payload[0]?.payload?.label || label;
  const nonzero = payload.filter((p) => Number(p.value) !== 0);
  const rows = nonzero.length ? nonzero : payload.slice(0, 1);
  return (
    <div className="chart-tooltip reports-chart-tooltip">
      {heading ? <strong>{heading}</strong> : null}
      <ul className="chart-tooltip-rows">
        {rows.map((p, i) => {
          const series =
            p.name && p.name !== 'total' && p.name !== 'value' ? p.name : null;
          return (
            <li key={`${p.dataKey || p.name || i}`} className="chart-tooltip-row">
              <span className="chart-tooltip-row-name">
                {p.color ? (
                  <i className="chart-tooltip-swatch" style={{ background: p.color }} aria-hidden />
                ) : null}
                {series || 'Monto'}
              </span>
              <span className="chart-tooltip-row-value">{money(Number(p.value) || 0)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const TOOLTIP_PROPS = {
  content: <MoneyTooltip />,
  allowEscapeViewBox: { x: true, y: true },
  wrapperStyle: { outline: 'none', zIndex: 20, pointerEvents: 'none' as const },
};

function CategoryTick({
  x = 0,
  y = 0,
  payload,
  maxChars = 18,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string };
  maxChars?: number;
}) {
  const full = String(payload?.value ?? '');
  const text = full.length > maxChars ? `${full.slice(0, Math.max(1, maxChars - 1))}…` : full;
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fill="#2a1a22" fontSize={11}>
      <title>{full}</title>
      {text}
    </text>
  );
}

function barsShellHeight(n: number) {
  return Math.min(520, Math.max(240, n * 48 + 24));
}

function MoneyHBars({
  data,
  seriesName,
  yWidth = 148,
  maxChars = 18,
}: {
  data: { name: string; value: number }[];
  seriesName: string;
  yWidth?: number;
  maxChars?: number;
}) {
  return (
    <div className="chart-shell reports-bars" style={{ height: barsShellHeight(data.length) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 108, bottom: 8, left: 12 }}
          barCategoryGap="22%"
        >
          <CartesianGrid horizontal={false} stroke="#f2d5e4" strokeDasharray="4 6" />
          <XAxis
            type="number"
            hide
            domain={[0, (max: number) => (Number.isFinite(max) && max > 0 ? max * 1.22 : 1)]}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={yWidth}
            interval={0}
            tick={<CategoryTick maxChars={maxChars} />}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip {...TOOLTIP_PROPS} cursor={{ fill: 'rgba(230,0,126,0.06)' }} />
          <Bar dataKey="value" name={seriesName} radius={[0, 8, 8, 0]} barSize={22} maxBarSize={28}>
            {data.map((row, i) => (
              <Cell key={row.name} fill={chartColor(i)} />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              formatter={(v) => money(Number(v) || 0)}
              style={{ fontSize: 11, fill: '#2a1a22', fontWeight: 650 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SectionEmpty({ children }: { children: string }) {
  return <p className="muted reports-section-empty">{children}</p>;
}

function Kpi({
  label,
  value,
  meta,
}: {
  label: string;
  value: string;
  meta?: string;
}) {
  return (
    <div className="inv-stat">
      <span className="inv-stat-label">{label}</span>
      <strong className="inv-stat-value">{value}</strong>
      {meta ? <span className="inv-stat-meta">{meta}</span> : null}
    </div>
  );
}

const compactClp = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  notation: 'compact',
  maximumFractionDigits: 1,
});

function formatAxisClp(v: number) {
  return compactClp.format(v);
}

function useReport<T>(
  vista: ReportsVista,
  from: string,
  to: string,
  branchId: string | null,
  extra?: Record<string, string | undefined>,
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const extraKey = JSON.stringify(extra || {});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const qs = new URLSearchParams({ from, to });
    if (vista === 'ventas') qs.set('limit', '100');
    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        if (value) qs.set(key, value);
      }
    }
    void (async () => {
      try {
        const json = await api<T>(`/api/reports/${vista}?${qs}`);
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) {
          setData(null);
          setError(userFacingError(err, 'No se pudo cargar el reporte'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vista, from, to, branchId, extraKey]);

  return { data, loading, error };
}

function VentasPanel({ data }: { data: VentasReport }) {
  const compact = useMobileViewport();
  const { grain, points } = useMemo(
    () => timePointsFromSeries(data.grain, data.series, data.monthly),
    [data.grain, data.series, data.monthly],
  );
  const hasChart = points.some((r) => r.value > 0);
  const sellers = data.bySeller.map((r) => ({
    name: r.seller_name,
    value: Number(r.total) || 0,
    count: Number(r.count) || 0,
  }));
  const pos = data.byPos.map((r) => ({
    name: r.pos_name,
    value: Number(r.total) || 0,
    count: Number(r.count) || 0,
  }));

  return (
    <>
      <div className="inv-stats reports-stats" aria-label="Totales del período">
        <Kpi
          label="Ventas del período"
          value={money(data.periodTotal)}
          meta={ticketWord(data.periodCount)}
        />
        <Kpi label="Tickets" value={String(data.periodCount)} meta="Todas las cajas" />
      </div>

      <section className="reports-section" aria-labelledby="reports-chart-ventas">
        <h3 id="reports-chart-ventas" className="reports-section-title">
          {grainTitle('Ventas', grain)}
        </h3>
        {!hasChart ? (
          <div className="reports-chart-slot">
            <SectionEmpty>No hay ventas para graficar en este período.</SectionEmpty>
          </div>
        ) : (
          <div className="chart-shell reports-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={timeChartMargin(compact)}>
                <defs>
                  <linearGradient id="repVentasFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#E6007E" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#E6007E" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#f2d5e4" strokeDasharray="4 6" />
                <TimeChartXAxis grain={grain} points={points} />
                <YAxis
                  tick={{ fontSize: compact ? 10 : 11, fill: '#6e5a64' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={formatAxisClp}
                  width={compact ? 56 : 88}
                  tickMargin={6}
                />
                <Tooltip {...TOOLTIP_PROPS} />
                <Area type="monotone" dataKey="value" name="Ventas" stroke="#E6007E" strokeWidth={2.2} fill="url(#repVentasFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <div className="reports-split">
        <section className="reports-section">
          <h3 className="reports-section-title">Por vendedora</h3>
          {!sellers.length ? (
            <SectionEmpty>No hay ventas por vendedora en este período.</SectionEmpty>
          ) : (
            <MoneyHBars data={sellers} seriesName="Ventas" yWidth={128} maxChars={16} />
          )}
        </section>
        <section className="reports-section">
          <h3 className="reports-section-title">Por caja</h3>
          {!pos.length ? (
            <SectionEmpty>No hay ventas por caja en este período.</SectionEmpty>
          ) : (
            <MoneyHBars data={pos} seriesName="Ventas" yWidth={128} maxChars={16} />
          )}
        </section>
      </div>

      <section className="reports-section">
        <h3 className="reports-section-title">Ranking con margen</h3>
        {data.notes?.margin ? <p className="muted reports-section-hint">{data.notes.margin}</p> : null}
        {!data.ranking.length ? (
          <SectionEmpty>No hay ranking de prendas en este período.</SectionEmpty>
        ) : (
          <div className="table-wrap reports-table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Prenda</th>
                  <th>Código</th>
                  <th>Ud.</th>
                  <th>Venta</th>
                  <th>Margen</th>
                </tr>
              </thead>
              <tbody>
                {data.ranking.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.internal_code}</td>
                    <td>{p.qty_sold}</td>
                    <td>{money(p.revenue)}</td>
                    <td>{money(p.margin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="reports-section" aria-labelledby="reports-table-ventas">
        <h3 id="reports-table-ventas" className="reports-section-title">
          Tickets del período
        </h3>
        {!data.tickets.items.length ? (
          <div className="sales-empty" role="status">
            <h3>Sin tickets en este período</h3>
            <p>Cuando registres ventas, aparecerán aquí.</p>
          </div>
        ) : (
          <>
            <div className="table-wrap reports-table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Folio</th>
                    <th>Fecha</th>
                    <th>Vendedora</th>
                    <th>Caja</th>
                    <th>Pago</th>
                    <th>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tickets.items.map((t) => (
                    <tr key={t.id}>
                      <td>
                        {t.receipt_number}
                        {t.client_sale_id ? <span className="muted"> · offline</span> : null}
                      </td>
                      <td>{formatSoldAt(t.sold_at)}</td>
                      <td>{t.seller_name}</td>
                      <td>{t.pos_name}</td>
                      <td>{paymentMethodLabel(t.payment_method)}</td>
                      <td>{money(t.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.tickets.hasMore ? (
              <p className="muted reports-section-hint">
                Mostrando {data.tickets.items.length} de {data.tickets.totalCount}. El Excel trae el listado
                completo.
              </p>
            ) : null}
          </>
        )}
      </section>
    </>
  );
}

function StockPanel({ data }: { data: StockReport }) {
  const cats = data.byCategory.map((c) => ({
    name: c.category_name,
    value: Number(c.sale_value) || 0,
  }));
  const hasChart = cats.some((c) => c.value > 0);

  return (
    <>
      <div className="inv-stats reports-stats" aria-label="Stock actual">
        <Kpi label="Unidades" value={String(data.totals.units)} meta={`${data.totals.sku_count} prendas`} />
        <Kpi label="Valor en sala" value={money(data.totals.sale_value)} meta="A precio de venta" />
        <Kpi
          label="Stock bajo"
          value={String(data.totals.low_count)}
          meta={`${data.totals.low_pct}% de las prendas`}
        />
        <Kpi
          label="Negativos"
          value={String(data.totals.negative_count)}
          meta={`${data.totals.negative_pct}%`}
        />
      </div>
      {data.notes?.snapshot ? <p className="muted reports-section-hint">{data.notes.snapshot}</p> : null}

      <section className="reports-section" aria-labelledby="reports-chart-stock">
        <h3 id="reports-chart-stock" className="reports-section-title">
          Valor a precio de venta por categoría
        </h3>
        {!hasChart ? (
          <div className="reports-chart-slot">
            <SectionEmpty>No hay stock para graficar en esta sucursal.</SectionEmpty>
          </div>
        ) : (
          <MoneyHBars data={cats} seriesName="Valor a p. venta" yWidth={148} maxChars={18} />
        )}
      </section>

      <section className="reports-section" aria-labelledby="reports-table-stock">
        <h3 id="reports-table-stock" className="reports-section-title">
          Prendas sin movimiento
        </h3>
        {!data.aging.length ? (
          <div className="sales-empty" role="status">
            <h3>Sin prendas para revisar</h3>
            <p>No hay stock con días sin salida en esta sucursal.</p>
          </div>
        ) : (
          <div className="table-wrap reports-table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Prenda</th>
                  <th>Código</th>
                  <th>Ud.</th>
                  <th>Sin salida</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {data.aging.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.internal_code}</td>
                    <td>{p.quantity}</td>
                    <td>{daysWithoutLabel(p.last_movement_at, p.days_without_movement)}</td>
                    <td>{money(p.sale_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function IngresosPanel({ data }: { data: IngresosReport }) {
  const compact = useMobileViewport();
  const { grain, points } = useMemo(
    () => timePointsFromSeries(data.grain, data.series, data.monthly),
    [data.grain, data.series, data.monthly],
  );
  const hasChart = points.some((r) => r.value > 0);
  const pending = data.pendingOpen.pending_reception + data.pendingOpen.partially_received;

  return (
    <>
      <div className="inv-stats reports-stats" aria-label="Reinversión del período">
        <Kpi
          label="Reinversión"
          value={money(data.docs.reduce((s, d) => s + (Number(d.cost_total) || 0), 0))}
          meta="Precio costo × unidades pedidas"
        />
        <Kpi label="Documentos" value={String(data.docs.length)} meta={`Promedio ${money(data.avgDocCost)}`} />
        <Kpi
          label="Por recibir"
          value={String(pending)}
          meta={`${data.pendingOpen.pending_reception} pendientes · ${data.pendingOpen.partially_received} parciales`}
        />
      </div>
      {data.notes?.cost ? <p className="muted reports-section-hint">{data.notes.cost}</p> : null}

      <section className="reports-section" aria-labelledby="reports-chart-ingresos">
        <h3 id="reports-chart-ingresos" className="reports-section-title">
          {grainTitle('Reinversión', grain)}
        </h3>
        {!hasChart ? (
          <div className="reports-chart-slot">
            <SectionEmpty>No hay ingresos con Precio costo en este período.</SectionEmpty>
          </div>
        ) : (
          <div className="chart-shell reports-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={points} margin={timeChartMargin(compact)}>
                <CartesianGrid vertical={false} stroke="#f2d5e4" />
                <TimeChartXAxis grain={grain} points={points} />
                <YAxis
                  tick={{ fontSize: compact ? 10 : 11, fill: '#6e5a64' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={formatAxisClp}
                  width={compact ? 56 : 88}
                  tickMargin={6}
                />
                <Tooltip {...TOOLTIP_PROPS} cursor={{ fill: 'rgba(230,0,126,0.06)' }} />
                <Bar dataKey="value" name="Reinversión" fill="#E6007E" radius={[8, 8, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="reports-section" aria-labelledby="reports-table-ingresos">
        <h3 id="reports-table-ingresos" className="reports-section-title">
          Documentos del período
        </h3>
        {!data.docs.length ? (
          <div className="sales-empty" role="status">
            <h3>Sin documentos</h3>
            <p>No hay ingresos en este período.</p>
          </div>
        ) : (
          <div className="table-wrap reports-table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Documento</th>
                  <th>Proveedor</th>
                  <th>Estado</th>
                  <th>Costo</th>
                </tr>
              </thead>
              <tbody>
                {data.docs.map((d) => (
                  <tr key={d.id}>
                    <td>{formatCivilDate(d.doc_date)}</td>
                    <td>{d.invoice_number || 'Sin número'}</td>
                    <td>{d.supplier_name || '—'}</td>
                    <td>{statusLabel(d.status)}</td>
                    <td>{money(d.cost_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function GastosPanel({ data }: { data: GastosReport }) {
  const compact = useMobileViewport();
  const { grain, points } = useMemo(
    () => timePointsFromSeries(data.grain, data.series, undefined),
    [data.grain, data.series],
  );
  const cats = useMemo(
    () => Array.from(new Set(data.byCategoryMonth.map((r) => r.category))),
    [data.byCategoryMonth],
  );
  const stackRows = useMemo(() => {
    const byPeriod = new Map<string, Record<string, number>>();
    for (const row of data.byCategoryMonth) {
      const cur = byPeriod.get(row.month) || {};
      cur[row.category] = Number(row.total) || 0;
      byPeriod.set(row.month, cur);
    }
    return points.map((p) => ({
      ...p,
      ...Object.fromEntries(cats.map((c) => [c, byPeriod.get(p.period)?.[c] || 0])),
    }));
  }, [data.byCategoryMonth, points, cats]);
  const stackCategories = grain === 'month' && cats.length > 0 && points.length > 0;
  const chartRows = stackCategories ? stackRows : points;
  const hasChart = points.some((r) => r.value > 0) || data.byCategoryMonth.some((r) => Number(r.total) > 0);
  const ratio = data.period.expenses_to_sales;
  const ratioLabel =
    ratio == null ? 'Sin ventas en el período' : `${Math.round(ratio * 1000) / 10}% de las ventas`;

  return (
    <>
      <div className="inv-stats reports-stats" aria-label="Gastos del período">
        <Kpi
          label="Gastos de operación"
          value={money(data.period.expenses)}
          meta={`${data.period.expensesCount} registro${data.period.expensesCount === 1 ? '' : 's'}`}
        />
        <Kpi label="Ventas del período" value={money(data.period.sales)} meta="Para el ratio" />
        <Kpi label="Gastos / ventas" value={ratio == null ? '—' : `${Math.round(ratio * 100)}%`} meta={ratioLabel} />
      </div>

      <section className="reports-section" aria-labelledby="reports-chart-gastos">
        <h3 id="reports-chart-gastos" className="reports-section-title">
          {points.length ? grainTitle('Gastos', grain) : 'Gastos por categoría'}
        </h3>
        {!hasChart ? (
          <div className="reports-chart-slot">
            <SectionEmpty>No hay gastos para graficar en este período.</SectionEmpty>
          </div>
        ) : (
          <>
          <div className="chart-shell reports-chart reports-chart-gastos">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows} margin={timeChartMargin(compact)}>
                <CartesianGrid vertical={false} stroke="#f2d5e4" />
                {points.length ? (
                  <TimeChartXAxis grain={grain} points={points} />
                ) : (
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: compact ? 10 : 11, fill: '#6e5a64' }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={compact ? 8 : 24}
                    interval="preserveStartEnd"
                    angle={compact ? -30 : 0}
                    textAnchor={compact ? 'end' : 'middle'}
                    height={compact ? 48 : 28}
                  />
                )}
                <YAxis
                  tick={{ fontSize: compact ? 10 : 11, fill: '#6e5a64' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={formatAxisClp}
                  width={compact ? 56 : 88}
                  tickMargin={6}
                />
                <Tooltip {...TOOLTIP_PROPS} cursor={{ fill: 'rgba(230,0,126,0.06)' }} />
                {stackCategories ? (
                  cats.map((cat, i) => (
                    <Bar
                      key={cat}
                      dataKey={cat}
                      name={cat}
                      stackId="g"
                      fill={chartColor(i)}
                      maxBarSize={44}
                      radius={i === cats.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                    />
                  ))
                ) : (
                  <Bar dataKey="value" name="Gastos" fill={chartColor(0)} maxBarSize={44} radius={[6, 6, 0, 0]} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
          {stackCategories ? (
          <ul className="chart-legend reports-legend">
            {cats.map((cat, i) => (
              <li key={cat}>
                <i style={{ background: chartColor(i) }} aria-hidden />
                {cat}
              </li>
            ))}
          </ul>
          ) : null}
          </>
        )}
      </section>

      <section className="reports-section" aria-labelledby="reports-table-gastos">
        <h3 id="reports-table-gastos" className="reports-section-title">
          Gastos del período
        </h3>
        {!data.items.length ? (
          <div className="sales-empty" role="status">
            <h3>Sin gastos</h3>
            <p>No hay gastos registrados en este período.</p>
          </div>
        ) : (
          <div className="table-wrap reports-table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Categoría</th>
                  <th>Detalle</th>
                  <th>Monto</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((e) => (
                  <tr key={e.id}>
                    <td>{formatCivilDate(e.incurred_on)}</td>
                    <td>{e.category}</td>
                    <td>{unpackComprobante(e.description).text.trim() || '—'}</td>
                    <td>{money(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function MermasPanel({ data }: { data: MermasReport }) {
  const reasons = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of data.byReasonMonth) {
      map.set(row.reason, (map.get(row.reason) || 0) + (Number(row.cost_impact) || 0));
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [data.byReasonMonth]);
  const vouchersOpen = data.vouchers.open;

  return (
    <>
      <div className="inv-stats reports-stats" aria-label="Mermas del período">
        <Kpi
          label="Bajas"
          value={String(data.period.count)}
          meta={`${data.period.units} unidad${Number(data.period.units) === 1 ? '' : 'es'}`}
        />
        <Kpi label="Impacto (Precio costo)" value={money(data.period.cost_impact)} />
        <Kpi
          label="Vouchers abiertos"
          value={String(vouchersOpen)}
          meta={`${data.vouchers.used} usados · ${data.vouchers.expired} vencidos`}
        />
      </div>
      {data.notes?.cost_impact ? <p className="muted reports-section-hint">{data.notes.cost_impact}</p> : null}

      <section className="reports-section" aria-labelledby="reports-chart-mermas">
        <h3 id="reports-chart-mermas" className="reports-section-title">
          Bajas por motivo
        </h3>
        {!reasons.length ? (
          <div className="reports-chart-slot">
            <SectionEmpty>No hay mermas para graficar en este período.</SectionEmpty>
          </div>
        ) : (
          <MoneyHBars data={reasons} seriesName="Impacto (Precio costo)" yWidth={168} maxChars={22} />
        )}
      </section>

      <section className="reports-section" aria-labelledby="reports-table-mermas">
        <h3 id="reports-table-mermas" className="reports-section-title">
          Mermas del período
        </h3>
        {!data.items.length ? (
          <div className="sales-empty" role="status">
            <h3>Sin mermas</h3>
            <p>No hay bajas registradas en este período.</p>
          </div>
        ) : (
          <div className="table-wrap reports-table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Prenda</th>
                  <th>Motivo</th>
                  <th>Ud.</th>
                  <th>Impacto</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((m) => (
                  <tr key={m.id}>
                    <td>{formatCivilDate(m.created_at_cl)}</td>
                    <td>
                      {m.product_name}
                      <div className="muted">{m.internal_code}</div>
                    </td>
                    <td>{m.reason}</td>
                    <td>{m.quantity}</td>
                    <td>{money(m.cost_impact)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function InventariosPanel({ data }: { data: InventariosReport }) {
  const [, setSearchParams] = useSearchParams();
  const selected = data.selected_stocktake_id || '';
  const neto = Number(data.totals.neto_value);
  const netoLabel = neto > 0 ? 'Ganancia neta' : neto < 0 ? 'Pérdida neta' : 'Empate';
  const selectedTake = data.takes.find((t) => t.id === selected);
  const movQ = selectedTake?.take_label || '';

  const bars = [
    { name: 'Faltante', value: Number(data.totals.faltante_value) },
    { name: 'Sobrante', value: Number(data.totals.sobrante_value) },
  ].filter((r) => r.value > 0);

  return (
    <>
      <label className="reports-filter-field reports-take-field">
        <span>Inventario realizado</span>
        <select
          value={selected}
          onChange={(e) => {
            const id = e.target.value;
            if (!id) setSearchParams({}, { replace: true });
            else setSearchParams({ take: id }, { replace: true });
          }}
        >
          <option value="">Todas las tomas del período</option>
          {data.takes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.take_label}
              {t.applied_by_name ? ` · ${t.applied_by_name}` : ''}
            </option>
          ))}
        </select>
      </label>

      <div className="inv-stats reports-kpis">
        <Kpi
          label="Faltante"
          value={money(data.totals.faltante_value)}
          meta={`${data.totals.faltante_units} ud. a p. venta`}
        />
        <Kpi
          label="Sobrante"
          value={money(data.totals.sobrante_value)}
          meta={`${data.totals.sobrante_units} ud. a p. venta`}
        />
        <Kpi
          label="Neto"
          value={money(data.totals.neto_value)}
          meta={`${netoLabel} · ${data.totals.takes_count} toma${data.totals.takes_count === 1 ? '' : 's'}`}
        />
      </div>
      {data.notes?.valuation ? <p className="muted reports-section-hint">{data.notes.valuation}</p> : null}
      {data.notes?.neto ? <p className="muted reports-section-hint">{data.notes.neto}</p> : null}

      <section className="reports-section" aria-labelledby="reports-chart-inv">
        <h3 id="reports-chart-inv" className="reports-section-title">
          Valor a precio de venta
        </h3>
        {!bars.length ? (
          <div className="reports-chart-slot">
            <SectionEmpty>No hay faltante ni sobrante en esta selección.</SectionEmpty>
          </div>
        ) : (
          <MoneyHBars data={bars} seriesName="Valor a p. venta" yWidth={120} maxChars={16} />
        )}
      </section>

      <section className="reports-section" aria-labelledby="reports-table-inv">
        <h3 id="reports-table-inv" className="reports-section-title">
          Prendas que movieron stock
        </h3>
        {data.notes?.movements ? <p className="muted reports-section-hint">{data.notes.movements}</p> : null}
        {movQ ? (
          <p className="reports-section-hint">
            <Link to={`/movimientos?q=${encodeURIComponent(movQ)}&type=ADJUSTMENT`}>
              Ver ajustes de {movQ} en Movimientos →
            </Link>
          </p>
        ) : null}
        {!data.items.length ? (
          <div className="sales-empty" role="status">
            <h3>Sin diferencias aplicadas</h3>
            <p>
              Elige una toma {selectedTake ? selectedTake.take_label : 'del período'} o aplica una
              conciliación con Conservar inventario o Ajustar.
            </p>
          </div>
        ) : (
          <div className="table-wrap reports-table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Toma</th>
                  <th>Prenda</th>
                  <th>Decisión</th>
                  <th>Tipo</th>
                  <th>Ud.</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={`${row.stocktake_id}-${row.internal_code}`}>
                    <td>
                      <Link to={`/inventarios/${row.stocktake_id}`}>{row.take_label}</Link>
                    </td>
                    <td>
                      {row.product_name}
                      <div className="muted">{row.internal_code}</div>
                    </td>
                    <td>{row.decision_label}</td>
                    <td>{row.kind === 'faltante' ? 'Faltante' : 'Sobrante'}</td>
                    <td>{row.units}</td>
                    <td>{money(row.sale_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export function ReportsViewPage({ vista }: { vista: ReportsVista }) {
  const { branchName, from, to, branchId, period } = useReportsFilters();
  const [searchParams] = useSearchParams();
  const stocktakeId = vista === 'inventarios' ? searchParams.get('take') || undefined : undefined;
  const reportExtra = useMemo(() => {
    const extra: Record<string, string | undefined> = {};
    if (stocktakeId) extra.stocktakeId = stocktakeId;
    if (vista === 'ventas' && period.paymentMethod) {
      extra.paymentMethod = period.paymentMethod;
    }
    return Object.keys(extra).length ? extra : undefined;
  }, [stocktakeId, vista, period.paymentMethod]);
  const { data, loading, error } = useReport<
    VentasReport | StockReport | IngresosReport | GastosReport | MermasReport | InventariosReport
  >(vista, from, to, branchId, reportExtra);

  if (loading) return <ReportsPanelSkeleton />;
  if (error) {
    return (
      <div className="sales-empty" role="alert">
        <h3>No se pudo cargar el reporte</h3>
        <p>{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="sales-empty" role="status">
        <h3>Sin datos</h3>
        <p>No hay información para {branchName} en este período.</p>
      </div>
    );
  }

  return (
    <div className="reports-panel" role="tabpanel">
      {vista === 'ventas' ? <VentasPanel data={data as VentasReport} /> : null}
      {vista === 'stock' ? <StockPanel data={data as StockReport} /> : null}
      {vista === 'ingresos' ? <IngresosPanel data={data as IngresosReport} /> : null}
      {vista === 'gastos' ? <GastosPanel data={data as GastosReport} /> : null}
      {vista === 'mermas' ? <MermasPanel data={data as MermasReport} /> : null}
      {vista === 'inventarios' ? <InventariosPanel data={data as InventariosReport} /> : null}
    </div>
  );
}

export function ReportsVentasPage() {
  return <ReportsViewPage vista="ventas" />;
}
export function ReportsStockPage() {
  return <ReportsViewPage vista="stock" />;
}
export function ReportsIngresosPage() {
  return <ReportsViewPage vista="ingresos" />;
}
export function ReportsGastosPage() {
  return <ReportsViewPage vista="gastos" />;
}
export function ReportsMermasPage() {
  return <ReportsViewPage vista="mermas" />;
}
export function ReportsInventariosPage() {
  return <ReportsViewPage vista="inventarios" />;
}
