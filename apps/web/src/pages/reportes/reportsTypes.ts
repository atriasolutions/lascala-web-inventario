/** Payloads GET /api/reports/:vista — TZ America/Santiago, sucursal X-Branch-Id. */

export type ReportMeta = {
  vista: 'ventas' | 'stock' | 'ingresos' | 'gastos' | 'mermas';
  timezone: string;
  from: string;
  to: string;
  generatedAt: string;
  branch: { id: string; name: string; code: string };
};

export type ReportGrain = 'day' | 'week' | 'month';

export type ReportSeriesPoint = {
  period: string;
  label: string;
  total: string;
  count?: string;
};

export type VentasMonthly = { month: string; total: string; count: string; units: string };

export type VentasTicket = {
  id: string;
  receipt_number: string;
  sold_at: string;
  total: string;
  subtotal?: string;
  discount?: string;
  client_sale_id?: string | null;
  offline_synced_at?: string | null;
  seller_name: string;
  seller_id: string;
  pos_name: string;
  pos_id: string;
};

export type VentasRanking = {
  id: string;
  name: string;
  internal_code: string;
  qty_sold: number;
  revenue: string;
  cost_total: string;
  margin: string;
};

export type VentasBySeller = {
  seller_id: string;
  seller_name: string;
  total: string;
  count: string;
};

export type VentasByPos = {
  pos_id: string;
  pos_name: string;
  total: string;
  count: string;
};

export type VentasReport = ReportMeta & {
  periodTotal: string;
  periodCount: number;
  grain?: ReportGrain;
  series?: ReportSeriesPoint[];
  monthly: VentasMonthly[];
  tickets: {
    items: VentasTicket[];
    totalCount: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  ranking: VentasRanking[];
  bySeller: VentasBySeller[];
  byPos: VentasByPos[];
  notes?: { margin?: string };
};

export type StockCategory = {
  category_id: string | null;
  category_name: string;
  sku_count: number;
  units: number;
  sale_value: string;
  low_count: number;
  negative_count: number;
};

export type StockAging = {
  id: string;
  name: string;
  internal_code: string;
  quantity: number;
  sale_price: string;
  sale_value: string;
  last_movement_at: string | null;
  days_without_movement: number | null;
};

export type StockReport = ReportMeta & {
  byCategory: StockCategory[];
  totals: {
    sku_count: number;
    units: number;
    sale_value: string;
    low_count: number;
    negative_count: number;
    low_pct: number;
    negative_pct: number;
  };
  aging: StockAging[];
  notes?: { snapshot?: string; sale_value?: string };
};

export type IngresosMonthly = { month: string; cost_total: string; docs: string };

export type IngresosDoc = {
  id: string;
  invoice_number: string | null;
  document_type: string | null;
  status: string;
  doc_date: string;
  cost_total: string;
  units_ordered: number;
  units_received: number;
  supplier_name: string | null;
};

export type IngresosReport = ReportMeta & {
  grain?: ReportGrain;
  series?: ReportSeriesPoint[];
  monthly: IngresosMonthly[];
  byStatus: { status: string; count: string; cost_total: string }[];
  pendingOpen: { pending_reception: number; partially_received: number };
  avgDocCost: string;
  docs: IngresosDoc[];
  notes?: { cost?: string };
};

export type GastosByCategoryMonth = { month: string; category: string; total: string };

export type GastosItem = {
  id: string;
  category: string;
  description: string | null;
  amount: string;
  incurred_on: string;
  created_by_name: string | null;
};

export type GastosReport = ReportMeta & {
  grain?: ReportGrain;
  series?: ReportSeriesPoint[];
  byCategoryMonth: GastosByCategoryMonth[];
  period: {
    expenses: string;
    expensesCount: number;
    sales: string;
    expenses_to_sales: number | null;
  };
  items: GastosItem[];
};

export type MermasByReasonMonth = {
  month: string;
  reason: string;
  units: string;
  cost_impact: string;
};

export type MermasItem = {
  id: string;
  quantity: number;
  reason: string;
  cost_impact: string;
  created_at_cl: string;
  product_name: string;
  internal_code: string;
  created_by_name: string | null;
};

export type MermasReport = ReportMeta & {
  byReasonMonth: MermasByReasonMonth[];
  period: { count: number; units: string; cost_impact: string };
  vouchers: { open: number; used: number; expired: number; cancelled: number };
  items: MermasItem[];
  notes?: { cost_impact?: string };
};
