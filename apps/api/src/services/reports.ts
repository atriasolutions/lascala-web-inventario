import { query } from '../db/pool.js';
import { HttpError } from '../utils/errors.js';
import { CHILE_TZ, buildChartBuckets } from '../utils/chileDate.js';
import { parsePagination } from '../utils/pagination.js';
import { stocktakeAppliedVariance } from './stocktakes.js';

export const REPORT_VISTAS = ['ventas', 'stock', 'ingresos', 'gastos', 'mermas', 'inventarios'] as const;
export type ReportVista = (typeof REPORT_VISTAS)[number];

export const EXPORT_ROW_CAP = 5000;

export type ReportMeta = {
  vista: ReportVista;
  timezone: typeof CHILE_TZ;
  from: string;
  to: string;
  generatedAt: string;
  branch: { id: string; name: string; code: string };
};

export function isReportVista(v: string): v is ReportVista {
  return (REPORT_VISTAS as readonly string[]).includes(v);
}

export async function loadBranch(branchId: string) {
  const res = await query<{ id: string; name: string; code: string }>(
    `SELECT id, name, code FROM branches WHERE id = $1`,
    [branchId],
  );
  if (!res.rows[0]) throw new HttpError(400, 'Sucursal no encontrada');
  return res.rows[0];
}

export function reportMeta(
  vista: ReportVista,
  branch: { id: string; name: string; code: string },
  from: string,
  to: string,
): ReportMeta {
  return {
    vista,
    timezone: CHILE_TZ,
    from,
    to,
    generatedAt: new Date().toISOString(),
    branch,
  };
}

/**
 * KPIs de Reportes (independientes de GET /api/dashboard/summary):
 * - Fechas civiles America/Santiago; sucursal = X-Branch-Id; todas las cajas.
 * - Gráfico: grain day|week|month según días del rango (≤45 / ≤120 / más).
 *   Canónico: series[{ period, label, total, count? }]. monthly = alias si grain=month.
 * - Ventas: tickets del rango, ranking 50 con margen (venta − último Precio costo).
 * - Stock: snapshot actual a p. venta (no es historial).
 * - Ingresos: Σ Precio costo × ud. pedidas (reinversión), no gasto operativo.
 * - Gastos: categoría × mes + ratio gastos/ventas del rango.
 * - Mermas: uds + impacto Precio costo; vouchers por estado (issued_at del rango).
 * - Inventarios: pérdida/ganancia de tomas aplicadas; valor a p. venta; Neto = sobrante − faltante.
 */

export type ReportSeriesPoint = {
  period: string;
  label: string;
  total: string;
  count: string;
};

function mapSeries(
  buckets: { period: string; label: string }[],
  rows: { period: string; total: string; count: string; extra?: string }[],
): ReportSeriesPoint[] {
  const by = new Map(rows.map((r) => [r.period, r]));
  return buckets.map((b) => {
    const hit = by.get(b.period);
    return {
      period: b.period,
      label: b.label,
      total: hit?.total ?? '0',
      count: hit?.count ?? '0',
    };
  });
}

export async function getVentasReport(
  branchId: string,
  from: string,
  to: string,
  pagination: { limit?: unknown; offset?: unknown },
) {
  const { limit, offset } = parsePagination(pagination);
  const { grain, buckets } = buildChartBuckets(from, to);
  const periods = buckets.map((b) => b.period);
  const starts = buckets.map((b) => b.start);
  const ends = buckets.map((b) => b.end);

  const [agg, ticketsCount, tickets, ranking, bySeller, byPos] = await Promise.all([
    query<{ period: string; total: string; count: string; units: string }>(
      `WITH buckets AS (
         SELECT x.period, x.start_d::date, x.end_d::date
         FROM unnest($2::text[], $3::date[], $4::date[]) AS x(period, start_d, end_d)
       )
       SELECT b.period,
              COALESCE(SUM(s.total), 0)::text AS total,
              COUNT(s.id)::text AS count,
              COALESCE(SUM(u.units), 0)::text AS units
       FROM buckets b
       LEFT JOIN sales s
         ON s.branch_id = $1
        AND (timezone('${CHILE_TZ}', s.sold_at))::date >= b.start_d
        AND (timezone('${CHILE_TZ}', s.sold_at))::date <= b.end_d
       LEFT JOIN LATERAL (
         SELECT SUM(si.quantity)::numeric AS units
         FROM sale_items si WHERE si.sale_id = s.id
       ) u ON true
       GROUP BY b.period
       ORDER BY b.period`,
      [branchId, periods, starts, ends],
    ),
    query<{ count: string; total: string }>(
      `SELECT COUNT(*)::text AS count, COALESCE(SUM(s.total), 0)::text AS total
       FROM sales s
       WHERE s.branch_id = $1
         AND (timezone('${CHILE_TZ}', s.sold_at))::date >= $2::date
         AND (timezone('${CHILE_TZ}', s.sold_at))::date <= $3::date`,
      [branchId, from, to],
    ),
    query(
      `SELECT s.id, s.receipt_number, s.sold_at, s.total::text AS total,
              s.subtotal::text AS subtotal, s.discount::text AS discount,
              s.client_sale_id, s.offline_synced_at,
              u.full_name AS seller_name, u.id AS seller_id,
              p.name AS pos_name, p.id AS pos_id
       FROM sales s
       JOIN users u ON u.id = s.seller_user_id
       JOIN pos_terminals p ON p.id = s.pos_id
       WHERE s.branch_id = $1
         AND (timezone('${CHILE_TZ}', s.sold_at))::date >= $2::date
         AND (timezone('${CHILE_TZ}', s.sold_at))::date <= $3::date
       ORDER BY s.sold_at DESC
       LIMIT $4 OFFSET $5`,
      [branchId, from, to, limit, offset],
    ),
    query<{
      id: string;
      name: string;
      internal_code: string;
      qty_sold: number;
      revenue: string;
      cost_total: string;
      margin: string;
    }>(
      `SELECT p.id, p.name, p.internal_code,
              SUM(si.quantity)::int AS qty_sold,
              COALESCE(SUM(si.line_total), 0)::text AS revenue,
              COALESCE(SUM(si.quantity * COALESCE(p.cost_price, 0)), 0)::text AS cost_total,
              COALESCE(SUM(si.line_total - si.quantity * COALESCE(p.cost_price, 0)), 0)::text AS margin
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN products p ON p.id = si.product_id
       WHERE s.branch_id = $1
         AND (timezone('${CHILE_TZ}', s.sold_at))::date >= $2::date
         AND (timezone('${CHILE_TZ}', s.sold_at))::date <= $3::date
       GROUP BY p.id, p.name, p.internal_code
       ORDER BY SUM(si.quantity) DESC, SUM(si.line_total) DESC
       LIMIT 50`,
      [branchId, from, to],
    ),
    query<{ seller_id: string; seller_name: string; total: string; count: string }>(
      `SELECT u.id AS seller_id, u.full_name AS seller_name,
              COALESCE(SUM(s.total), 0)::text AS total, COUNT(s.id)::text AS count
       FROM sales s
       JOIN users u ON u.id = s.seller_user_id
       WHERE s.branch_id = $1
         AND (timezone('${CHILE_TZ}', s.sold_at))::date >= $2::date
         AND (timezone('${CHILE_TZ}', s.sold_at))::date <= $3::date
       GROUP BY u.id, u.full_name
       ORDER BY SUM(s.total) DESC`,
      [branchId, from, to],
    ),
    query<{ pos_id: string; pos_name: string; total: string; count: string }>(
      `SELECT p.id AS pos_id, p.name AS pos_name,
              COALESCE(SUM(s.total), 0)::text AS total, COUNT(s.id)::text AS count
       FROM sales s
       JOIN pos_terminals p ON p.id = s.pos_id
       WHERE s.branch_id = $1
         AND (timezone('${CHILE_TZ}', s.sold_at))::date >= $2::date
         AND (timezone('${CHILE_TZ}', s.sold_at))::date <= $3::date
       GROUP BY p.id, p.name
       ORDER BY SUM(s.total) DESC`,
      [branchId, from, to],
    ),
  ]);

  const totalCount = Number(ticketsCount.rows[0]?.count || 0);
  const byPeriod = new Map(agg.rows.map((r) => [r.period, r]));
  const series = buckets.map((b) => {
    const hit = byPeriod.get(b.period);
    return {
      period: b.period,
      label: b.label,
      total: hit?.total ?? '0',
      count: hit?.count ?? '0',
      units: hit?.units ?? '0',
    };
  });
  /** Alias legacy: monthly = series si grain=month; si no, mismos puntos con month=period. */
  const monthly = series.map((s) => ({
    month: s.period,
    total: s.total,
    count: s.count,
    units: s.units,
  }));
  return {
    periodTotal: ticketsCount.rows[0]?.total ?? '0',
    periodCount: totalCount,
    grain,
    series,
    monthly,
    tickets: {
      items: tickets.rows,
      totalCount,
      limit,
      offset,
      hasMore: offset + tickets.rows.length < totalCount,
    },
    ranking: ranking.rows,
    bySeller: bySeller.rows,
    byPos: byPos.rows,
    notes: {
      margin:
        'Margen = venta − último Precio costo de la ficha (no el costo histórico de cada ingreso).',
    },
  };
}

export async function exportVentasTickets(branchId: string, from: string, to: string) {
  return query(
    `SELECT s.receipt_number,
            timezone('${CHILE_TZ}', s.sold_at)::text AS sold_at_cl,
            s.total::float8 AS total,
            u.full_name AS seller_name,
            p.name AS pos_name,
            CASE WHEN s.client_sale_id IS NOT NULL THEN 'offline' ELSE 'online' END AS origen
     FROM sales s
     JOIN users u ON u.id = s.seller_user_id
     JOIN pos_terminals p ON p.id = s.pos_id
     WHERE s.branch_id = $1
       AND (timezone('${CHILE_TZ}', s.sold_at))::date >= $2::date
       AND (timezone('${CHILE_TZ}', s.sold_at))::date <= $3::date
     ORDER BY s.sold_at DESC
     LIMIT $4`,
    [branchId, from, to, EXPORT_ROW_CAP],
  );
}

export async function getStockReport(branchId: string) {
  const [byCategory, totals, aging] = await Promise.all([
    query<{
      category_id: string | null;
      category_name: string;
      sku_count: number;
      units: number;
      sale_value: string;
      low_count: number;
      negative_count: number;
    }>(
      `SELECT p.category_id,
              COALESCE(c.name, 'Sin categoría') AS category_name,
              COUNT(*)::int AS sku_count,
              COALESCE(SUM(ib.quantity), 0)::int AS units,
              COALESCE(SUM(GREATEST(ib.quantity, 0) * COALESCE(p.sale_price, 0)), 0)::text AS sale_value,
              COALESCE(SUM(CASE
                WHEN ib.quantity <= COALESCE(ib.low_stock_threshold, p.low_stock_threshold, 1)
                THEN 1 ELSE 0 END), 0)::int AS low_count,
              COALESCE(SUM(CASE WHEN ib.quantity < 0 THEN 1 ELSE 0 END), 0)::int AS negative_count
       FROM inventory_balances ib
       JOIN products p ON p.id = ib.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE ib.branch_id = $1
         AND COALESCE(p.tracks_stock, true) = true
         AND p.status NOT IN ('archived', 'merma', 'returned_to_supplier')
       GROUP BY p.category_id, c.name
       ORDER BY COALESCE(SUM(GREATEST(ib.quantity, 0) * COALESCE(p.sale_price, 0)), 0) DESC`,
      [branchId],
    ),
    query<{
      sku_count: number;
      units: number;
      sale_value: string;
      low_count: number;
      negative_count: number;
    }>(
      `SELECT COUNT(*)::int AS sku_count,
              COALESCE(SUM(ib.quantity), 0)::int AS units,
              COALESCE(SUM(GREATEST(ib.quantity, 0) * COALESCE(p.sale_price, 0)), 0)::text AS sale_value,
              COALESCE(SUM(CASE
                WHEN ib.quantity <= COALESCE(ib.low_stock_threshold, p.low_stock_threshold, 1)
                THEN 1 ELSE 0 END), 0)::int AS low_count,
              COALESCE(SUM(CASE WHEN ib.quantity < 0 THEN 1 ELSE 0 END), 0)::int AS negative_count
       FROM inventory_balances ib
       JOIN products p ON p.id = ib.product_id
       WHERE ib.branch_id = $1
         AND COALESCE(p.tracks_stock, true) = true
         AND p.status NOT IN ('archived', 'merma', 'returned_to_supplier')`,
      [branchId],
    ),
    query<{
      id: string;
      name: string;
      internal_code: string;
      quantity: number;
      sale_price: string;
      sale_value: string;
      last_movement_at: string | null;
      days_without_movement: number | null;
    }>(
      `SELECT p.id, p.name, p.internal_code,
              ib.quantity::int AS quantity,
              p.sale_price::text AS sale_price,
              (GREATEST(ib.quantity, 0) * COALESCE(p.sale_price, 0))::text AS sale_value,
              MAX(m.created_at) AS last_movement_at,
              CASE
                WHEN MAX(m.created_at) IS NULL THEN NULL
                ELSE (
                  (timezone('${CHILE_TZ}', now()))::date
                  - (timezone('${CHILE_TZ}', MAX(m.created_at)))::date
                )
              END AS days_without_movement
       FROM inventory_balances ib
       JOIN products p ON p.id = ib.product_id
       LEFT JOIN inventory_movements m
         ON m.product_id = p.id AND m.branch_id = ib.branch_id
       WHERE ib.branch_id = $1
         AND ib.quantity > 0
         AND COALESCE(p.tracks_stock, true) = true
         AND p.status NOT IN ('archived', 'merma', 'returned_to_supplier')
       GROUP BY p.id, p.name, p.internal_code, ib.quantity, p.sale_price
       ORDER BY days_without_movement DESC NULLS FIRST, p.name ASC
       LIMIT 50`,
      [branchId],
    ),
  ]);

  const t = totals.rows[0] ?? {
    sku_count: 0,
    units: 0,
    sale_value: '0',
    low_count: 0,
    negative_count: 0,
  };
  const sku = t.sku_count || 0;
  return {
    byCategory: byCategory.rows,
    totals: {
      sku_count: sku,
      units: t.units,
      sale_value: t.sale_value,
      low_count: t.low_count,
      negative_count: t.negative_count,
      low_pct: sku ? Math.round((t.low_count / sku) * 1000) / 10 : 0,
      negative_pct: sku ? Math.round((t.negative_count / sku) * 1000) / 10 : 0,
    },
    aging: aging.rows,
    notes: {
      snapshot: 'Stock es un retrato actual de la sucursal (no un histórico del rango from/to).',
      sale_value: 'Valor a precio de venta de unidades ≥ 0 (quiebre negativo no resta valor de sala).',
    },
  };
}

export async function exportStockAging(branchId: string) {
  return query(
    `SELECT p.internal_code, p.name, COALESCE(c.name, 'Sin categoría') AS category_name,
            ib.quantity::int AS quantity,
            p.sale_price::float8 AS sale_price,
            (GREATEST(ib.quantity, 0) * COALESCE(p.sale_price, 0))::float8 AS sale_value,
            MAX(m.created_at) AS last_movement_at
     FROM inventory_balances ib
     JOIN products p ON p.id = ib.product_id
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN inventory_movements m ON m.product_id = p.id AND m.branch_id = ib.branch_id
     WHERE ib.branch_id = $1
       AND COALESCE(p.tracks_stock, true) = true
       AND p.status NOT IN ('archived', 'merma', 'returned_to_supplier')
     GROUP BY p.id, p.name, p.internal_code, c.name, ib.quantity, p.sale_price
     ORDER BY p.name
     LIMIT $2`,
    [branchId, EXPORT_ROW_CAP],
  );
}

const purchaseDateSql = (alias: string) =>
  `COALESCE(${alias}.purchased_at, (timezone('${CHILE_TZ}', ${alias}.created_at))::date)`;

export async function getIngresosReport(branchId: string, from: string, to: string) {
  const { grain, buckets } = buildChartBuckets(from, to);
  const periods = buckets.map((b) => b.period);
  const starts = buckets.map((b) => b.start);
  const ends = buckets.map((b) => b.end);
  const [agg, status, docs, pendingOpen] = await Promise.all([
    query<{ period: string; total: string; count: string }>(
      `WITH buckets AS (
         SELECT x.period, x.start_d::date, x.end_d::date
         FROM unnest($2::text[], $3::date[], $4::date[]) AS x(period, start_d, end_d)
       )
       SELECT b.period,
              COALESCE(SUM(pi.unit_cost * pi.quantity_ordered), 0)::text AS total,
              COUNT(DISTINCT p.id)::text AS count
       FROM buckets b
       LEFT JOIN purchases p
         ON p.destination_branch_id = $1
        AND p.status <> 'cancelled'
        AND ${purchaseDateSql('p')} >= b.start_d
        AND ${purchaseDateSql('p')} <= b.end_d
       LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
       GROUP BY b.period
       ORDER BY b.period`,
      [branchId, periods, starts, ends],
    ),
    query<{ status: string; count: string; cost_total: string }>(
      `SELECT p.status::text AS status,
              COUNT(DISTINCT p.id)::text AS count,
              COALESCE(SUM(pi.unit_cost * pi.quantity_ordered), 0)::text AS cost_total
       FROM purchases p
       LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
       WHERE p.destination_branch_id = $1
         AND p.status <> 'cancelled'
         AND ${purchaseDateSql('p')} >= $2::date
         AND ${purchaseDateSql('p')} <= $3::date
       GROUP BY p.status`,
      [branchId, from, to],
    ),
    query(
      `SELECT p.id, p.invoice_number, p.document_type, p.status,
              ${purchaseDateSql('p')}::text AS doc_date,
              COALESCE(SUM(pi.unit_cost * pi.quantity_ordered), 0)::text AS cost_total,
              COALESCE(SUM(pi.quantity_ordered), 0)::int AS units_ordered,
              COALESCE(SUM(pi.quantity_received), 0)::int AS units_received,
              s.name AS supplier_name
       FROM purchases p
       LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.destination_branch_id = $1
         AND p.status <> 'cancelled'
         AND ${purchaseDateSql('p')} >= $2::date
         AND ${purchaseDateSql('p')} <= $3::date
       GROUP BY p.id, s.name
       ORDER BY ${purchaseDateSql('p')} DESC, p.created_at DESC
       LIMIT 200`,
      [branchId, from, to],
    ),
    query<{ pending: string; partially_received: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending_reception')::text AS pending,
         COUNT(*) FILTER (WHERE status = 'partially_received')::text AS partially_received
       FROM purchases
       WHERE destination_branch_id = $1
         AND status IN ('pending_reception', 'partially_received')`,
      [branchId],
    ),
  ]);

  const periodCost = docs.rows.reduce((acc, r) => acc + Number((r as { cost_total: string }).cost_total || 0), 0);
  const docsCount = docs.rows.length;
  const series = mapSeries(buckets, agg.rows);
  const monthly = series.map((s) => ({
    month: s.period,
    cost_total: s.total,
    docs: s.count,
  }));
  return {
    grain,
    series,
    monthly,
    byStatus: status.rows,
    pendingOpen: {
      pending_reception: Number(pendingOpen.rows[0]?.pending || 0),
      partially_received: Number(pendingOpen.rows[0]?.partially_received || 0),
    },
    avgDocCost: docsCount ? (periodCost / docsCount).toFixed(2) : '0',
    docs: docs.rows,
    notes: {
      cost: 'Reinversión = Σ Precio costo × unidades pedidas (no es gasto operativo).',
    },
  };
}

export async function exportIngresosDocs(branchId: string, from: string, to: string) {
  return query(
    `SELECT ${purchaseDateSql('p')}::text AS doc_date,
            p.invoice_number, p.document_type, p.status::text AS status,
            s.name AS supplier_name,
            COALESCE(SUM(pi.unit_cost * pi.quantity_ordered), 0)::float8 AS cost_total,
            COALESCE(SUM(pi.quantity_ordered), 0)::int AS units_ordered,
            COALESCE(SUM(pi.quantity_received), 0)::int AS units_received
     FROM purchases p
     LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
     LEFT JOIN suppliers s ON s.id = p.supplier_id
     WHERE p.destination_branch_id = $1
       AND p.status <> 'cancelled'
       AND ${purchaseDateSql('p')} >= $2::date
       AND ${purchaseDateSql('p')} <= $3::date
     GROUP BY p.id, s.name
     ORDER BY ${purchaseDateSql('p')} DESC
     LIMIT $4`,
    [branchId, from, to, EXPORT_ROW_CAP],
  );
}

export async function getGastosReport(branchId: string, from: string, to: string) {
  const { grain, buckets } = buildChartBuckets(from, to);
  const periods = buckets.map((b) => b.period);
  const starts = buckets.map((b) => b.start);
  const ends = buckets.map((b) => b.end);
  const [byCategoryMonth, totals, items, salesPeriod, agg] = await Promise.all([
    query<{ month: string; category: string; total: string }>(
      `SELECT to_char(e.incurred_on, 'YYYY-MM') AS month,
              e.category,
              COALESCE(SUM(e.amount), 0)::text AS total
       FROM expenses e
       WHERE e.branch_id = $1
         AND e.incurred_on >= $2::date
         AND e.incurred_on <= $3::date
       GROUP BY 1, 2
       ORDER BY 1, 2`,
      [branchId, from, to],
    ),
    query<{ total: string; count: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS total, COUNT(*)::text AS count
       FROM expenses
       WHERE branch_id = $1 AND incurred_on >= $2::date AND incurred_on <= $3::date`,
      [branchId, from, to],
    ),
    query(
      `SELECT e.id, e.category, e.description, e.amount::text AS amount,
              e.incurred_on::text AS incurred_on, u.full_name AS created_by_name
       FROM expenses e
       LEFT JOIN users u ON u.id = e.created_by
       WHERE e.branch_id = $1 AND e.incurred_on >= $2::date AND e.incurred_on <= $3::date
       ORDER BY e.incurred_on DESC, e.created_at DESC
       LIMIT 200`,
      [branchId, from, to],
    ),
    query<{ total: string }>(
      `SELECT COALESCE(SUM(s.total), 0)::text AS total
       FROM sales s
       WHERE s.branch_id = $1
         AND (timezone('${CHILE_TZ}', s.sold_at))::date >= $2::date
         AND (timezone('${CHILE_TZ}', s.sold_at))::date <= $3::date`,
      [branchId, from, to],
    ),
    query<{ period: string; total: string; count: string }>(
      `WITH buckets AS (
         SELECT x.period, x.start_d::date, x.end_d::date
         FROM unnest($2::text[], $3::date[], $4::date[]) AS x(period, start_d, end_d)
       )
       SELECT b.period,
              COALESCE(SUM(e.amount), 0)::text AS total,
              COUNT(e.id)::text AS count
       FROM buckets b
       LEFT JOIN expenses e
         ON e.branch_id = $1
        AND e.incurred_on >= b.start_d
        AND e.incurred_on <= b.end_d
       GROUP BY b.period
       ORDER BY b.period`,
      [branchId, periods, starts, ends],
    ),
  ]);

  const expensesTotal = Number(totals.rows[0]?.total || 0);
  const salesTotal = Number(salesPeriod.rows[0]?.total || 0);
  const stacked = byCategoryMonth.rows.filter((r) => r.category);
  const series = mapSeries(buckets, agg.rows);
  return {
    grain,
    series,
    byCategoryMonth: stacked,
    period: {
      expenses: totals.rows[0]?.total ?? '0',
      expensesCount: Number(totals.rows[0]?.count || 0),
      sales: salesPeriod.rows[0]?.total ?? '0',
      expenses_to_sales: salesTotal > 0 ? Math.round((expensesTotal / salesTotal) * 1000) / 1000 : null,
    },
    items: items.rows,
  };
}

export async function exportGastosItems(branchId: string, from: string, to: string) {
  return query(
    `SELECT e.incurred_on::text AS incurred_on, e.category, e.description,
            e.amount::float8 AS amount, u.full_name AS created_by_name
     FROM expenses e
     LEFT JOIN users u ON u.id = e.created_by
     WHERE e.branch_id = $1 AND e.incurred_on >= $2::date AND e.incurred_on <= $3::date
     ORDER BY e.incurred_on DESC
     LIMIT $4`,
    [branchId, from, to, EXPORT_ROW_CAP],
  );
}

export async function getMermasReport(branchId: string, from: string, to: string) {
  const [byReasonMonth, totals, items, vouchers] = await Promise.all([
    query<{ month: string; reason: string; units: string; cost_impact: string }>(
      `SELECT to_char(timezone('${CHILE_TZ}', m.created_at), 'YYYY-MM') AS month,
              m.reason,
              SUM(m.quantity)::text AS units,
              COALESCE(SUM(m.cost_impact), 0)::text AS cost_impact
       FROM mermas m
       WHERE m.branch_id = $1
         AND (timezone('${CHILE_TZ}', m.created_at))::date >= $2::date
         AND (timezone('${CHILE_TZ}', m.created_at))::date <= $3::date
       GROUP BY 1, 2
       ORDER BY 1, SUM(m.quantity) DESC`,
      [branchId, from, to],
    ),
    query<{ units: string; cost_impact: string; count: string }>(
      `SELECT COALESCE(SUM(quantity), 0)::text AS units,
              COALESCE(SUM(cost_impact), 0)::text AS cost_impact,
              COUNT(*)::text AS count
       FROM mermas
       WHERE branch_id = $1
         AND (timezone('${CHILE_TZ}', created_at))::date >= $2::date
         AND (timezone('${CHILE_TZ}', created_at))::date <= $3::date`,
      [branchId, from, to],
    ),
    query(
      `SELECT m.id, m.quantity, m.reason, m.cost_impact::text AS cost_impact,
              timezone('${CHILE_TZ}', m.created_at)::text AS created_at_cl,
              p.name AS product_name, p.internal_code,
              u.full_name AS created_by_name
       FROM mermas m
       JOIN products p ON p.id = m.product_id
       LEFT JOIN users u ON u.id = m.created_by
       WHERE m.branch_id = $1
         AND (timezone('${CHILE_TZ}', m.created_at))::date >= $2::date
         AND (timezone('${CHILE_TZ}', m.created_at))::date <= $3::date
       ORDER BY m.created_at DESC
       LIMIT 200`,
      [branchId, from, to],
    ),
    query<{ status: string; count: string }>(
      `SELECT status::text AS status, COUNT(*)::text AS count
       FROM change_vouchers
       WHERE branch_id = $1
         AND issued_at >= $2::date AND issued_at <= $3::date
       GROUP BY status`,
      [branchId, from, to],
    ),
  ]);

  const voucherMap = { open: 0, used: 0, expired: 0, cancelled: 0 };
  for (const row of vouchers.rows) {
    if (row.status in voucherMap) {
      voucherMap[row.status as keyof typeof voucherMap] = Number(row.count);
    }
  }

  return {
    byReasonMonth: byReasonMonth.rows,
    period: {
      count: Number(totals.rows[0]?.count || 0),
      units: totals.rows[0]?.units ?? '0',
      cost_impact: totals.rows[0]?.cost_impact ?? '0',
    },
    vouchers: voucherMap,
    items: items.rows,
    notes: {
      cost_impact: 'Impacto = Precio costo de la ficha al registrar la merma.',
    },
  };
}

export async function exportMermasItems(branchId: string, from: string, to: string) {
  return query(
    `SELECT timezone('${CHILE_TZ}', m.created_at)::text AS created_at_cl,
            p.internal_code, p.name AS product_name, m.quantity, m.reason,
            m.cost_impact::float8 AS cost_impact, u.full_name AS created_by_name
     FROM mermas m
     JOIN products p ON p.id = m.product_id
     LEFT JOIN users u ON u.id = m.created_by
     WHERE m.branch_id = $1
       AND (timezone('${CHILE_TZ}', m.created_at))::date >= $2::date
       AND (timezone('${CHILE_TZ}', m.created_at))::date <= $3::date
     ORDER BY m.created_at DESC
     LIMIT $4`,
    [branchId, from, to, EXPORT_ROW_CAP],
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseStocktakeIdQuery(raw: unknown): string | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (!UUID_RE.test(s)) throw new HttpError(400, 'Toma inválida');
  return s;
}

function decisionLabel(decision: string | null) {
  if (decision === 'use_physical') return 'Conservar inventario';
  if (decision === 'adjust') return 'Ajustar';
  if (decision === 'keep_system') return 'Conservar stock anterior';
  return decision || '—';
}

export async function getInventariosReport(
  branchId: string,
  from: string,
  to: string,
  stocktakeId: string | null,
) {
  if (stocktakeId) {
    const ok = await query<{ id: string }>(
      `SELECT id FROM stocktakes
       WHERE id = $1 AND branch_id = $2 AND status = 'completed'`,
      [stocktakeId, branchId],
    );
    if (!ok.rows[0]) throw new HttpError(404, 'No hay una toma aplicada con ese número');
  }

  const takes = await query<{
    id: string;
    take_label: string;
    applied_at_cl: string | null;
    applied_by_name: string | null;
  }>(
    `SELECT s.id, s.take_label,
            timezone('${CHILE_TZ}', s.applied_at)::text AS applied_at_cl,
            u.full_name AS applied_by_name
     FROM stocktakes s
     LEFT JOIN users u ON u.id = s.applied_by
     WHERE s.branch_id = $1
       AND s.status = 'completed'
       AND s.applied_at IS NOT NULL
       AND (
         $2::uuid IS NOT NULL
         OR (
           (timezone('${CHILE_TZ}', s.applied_at))::date >= $3::date
           AND (timezone('${CHILE_TZ}', s.applied_at))::date <= $4::date
         )
       )
       AND ($2::uuid IS NULL OR s.id = $2::uuid)
     ORDER BY s.applied_at DESC`,
    [branchId, stocktakeId, from, to],
  );

  const takesForSelect = stocktakeId
    ? await query<{
        id: string;
        take_label: string;
        applied_at_cl: string | null;
        applied_by_name: string | null;
      }>(
        `SELECT s.id, s.take_label,
                timezone('${CHILE_TZ}', s.applied_at)::text AS applied_at_cl,
                u.full_name AS applied_by_name
         FROM stocktakes s
         LEFT JOIN users u ON u.id = s.applied_by
         WHERE s.branch_id = $1
           AND s.status = 'completed'
           AND s.applied_at IS NOT NULL
           AND (timezone('${CHILE_TZ}', s.applied_at))::date >= $2::date
           AND (timezone('${CHILE_TZ}', s.applied_at))::date <= $3::date
         ORDER BY s.applied_at DESC`,
        [branchId, from, to],
      )
    : takes;

  const lines = await query<{
    stocktake_id: string;
    take_label: string;
    product_id: string;
    product_name: string;
    internal_code: string;
    sale_price: string;
    qty_counted: number;
    qty_system_at_close: number;
    qty_override: number | null;
    decision: string | null;
  }>(
    `SELECT s.id AS stocktake_id, s.take_label,
            l.product_id, p.name AS product_name, p.internal_code,
            COALESCE(p.sale_price, 0)::text AS sale_price,
            l.qty_counted, l.qty_system_at_close, l.qty_override, l.decision
     FROM stocktake_lines l
     JOIN stocktakes s ON s.id = l.stocktake_id
     JOIN products p ON p.id = l.product_id
     WHERE s.branch_id = $1
       AND s.status = 'completed'
       AND s.applied_at IS NOT NULL
       AND ($2::uuid IS NOT NULL OR (
         (timezone('${CHILE_TZ}', s.applied_at))::date >= $3::date
         AND (timezone('${CHILE_TZ}', s.applied_at))::date <= $4::date
       ))
       AND ($2::uuid IS NULL OR s.id = $2::uuid)
     ORDER BY s.applied_at DESC, p.name`,
    [branchId, stocktakeId, from, to],
  );

  let faltanteUnits = 0;
  let sobranteUnits = 0;
  let faltanteValue = 0;
  let sobranteValue = 0;
  const items: {
    stocktake_id: string;
    take_label: string;
    product_name: string;
    internal_code: string;
    decision: string | null;
    decision_label: string;
    qty_system: number;
    qty_final: number;
    kind: 'faltante' | 'sobrante';
    units: number;
    sale_price: string;
    sale_value: string;
  }[] = [];

  for (const row of lines.rows) {
    const v = stocktakeAppliedVariance({
      decision: row.decision,
      qtyCounted: Number(row.qty_counted || 0),
      qtySystem: Number(row.qty_system_at_close || 0),
      qtyOverride: row.qty_override == null ? null : Number(row.qty_override),
    });
    if (v.kind === 'ok' || v.units === 0) continue;
    const price = Number(row.sale_price || 0);
    const value = v.units * price;
    if (v.kind === 'faltante') {
      faltanteUnits += v.units;
      faltanteValue += value;
    } else {
      sobranteUnits += v.units;
      sobranteValue += value;
    }
    items.push({
      stocktake_id: row.stocktake_id,
      take_label: row.take_label,
      product_name: row.product_name,
      internal_code: row.internal_code,
      decision: row.decision,
      decision_label: decisionLabel(row.decision),
      qty_system: Number(row.qty_system_at_close || 0),
      qty_final: v.qtyFinal,
      kind: v.kind,
      units: v.units,
      sale_price: String(price),
      sale_value: String(value),
    });
  }

  const netoValue = sobranteValue - faltanteValue;
  let selectTakes = takesForSelect.rows;
  if (stocktakeId && !selectTakes.some((t) => t.id === stocktakeId) && takes.rows[0]) {
    selectTakes = [takes.rows[0], ...selectTakes];
  }

  return {
    takes: selectTakes,
    selected_stocktake_id: stocktakeId,
    totals: {
      takes_count: stocktakeId ? 1 : selectTakes.length,
      faltante_units: faltanteUnits,
      sobrante_units: sobranteUnits,
      faltante_value: String(faltanteValue),
      sobrante_value: String(sobranteValue),
      neto_value: String(netoValue),
    },
    items: items.slice(0, 2000),
    notes: {
      valuation:
        'Valorado a precio de venta de sala (el de la ficha). El Precio costo vive en Ingresos, no se usa acá.',
      neto: 'Neto = valor sobrante − valor faltante. Positivo = ganancia neta; negativo = pérdida neta.',
      movements:
        'Cada prenda que movió stock dejó un ajuste en Movimientos con el n° INV-…. Conservar stock anterior no genera movimiento.',
    },
  };
}
