import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { InfiniteListFooter } from '../components/InfiniteListFooter';
import { ModalOverlayClose } from '../components/ModalOverlayClose';
import { PosModal } from '../components/PosModal';
import { SaleThermalPrint } from '../components/SaleThermalPrint';
import { SortableTh } from '../components/SortableTh';
import { useInfiniteList } from '../hooks/useInfiniteList';
import { api, money, moneyClp } from '../lib/api';
import { useAuth } from '../lib/auth';
import { loadListFilters, saveListFilters } from '../lib/listFiltersPersist';
import { withPagination } from '../lib/pagination';
import {
  CHANGE_TICKET_DAYS,
  allowsChangeTicket,
  buildChangeTickets,
  daysSinceSale,
  withinChangeWindow,
} from '../lib/salePrint';
import {
  nextSaleSort,
  sortSales,
  type SaleSortKey,
  type SortDir,
} from '../lib/salesListSort';
import { useSalePrint } from '../lib/useSalePrint';
import { toast } from '../lib/toast';
import { paymentMethodLabel } from '../lib/paymentMethod';

type Sale = {
  id: string;
  receipt_number: string;
  total: string;
  subtotal?: string;
  discount: string;
  sold_at: string;
  seller_name: string;
  pos_name: string;
  branch_name?: string;
  notes: string | null;
  payment_method?: string;
};

type SaleItem = {
  id: string;
  product_id: string;
  name: string;
  internal_code: string;
  barcode?: string | null;
  brand?: string | null;
  size_label?: string | null;
  color?: string | null;
  quantity: number;
  unit_price: string;
  line_total: string;
  allows_exchange: boolean;
  allows_return: boolean;
};

type ChangeVoucher = {
  id: string;
  sale_item_id: string | null;
  product_id: string;
  voucher_number: string;
  status: string;
  issued_at: string;
  expires_at: string;
  conditions: string | null;
  product_name: string;
  internal_code: string;
  size_label?: string | null;
  color?: string | null;
};

type PeriodChip = 'today' | 'month' | 'all';

type AppliedFilters = {
  period: PeriodChip;
  dateFrom: string;
  dateTo: string;
  receiptNumber: string;
  seller: string;
  pos: string;
  notes: string;
};

type ListFilters = AppliedFilters & { branchId: string };

const DEFAULT_FILTERS: AppliedFilters = {
  period: 'today',
  dateFrom: '',
  dateTo: '',
  receiptNumber: '',
  seller: '',
  pos: '',
  notes: '',
};

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfMonth(d = new Date()) {
  return isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
}

function resolveDates(f: AppliedFilters): { dateFrom: string; dateTo: string } {
  if (f.dateFrom || f.dateTo) {
    return { dateFrom: f.dateFrom, dateTo: f.dateTo };
  }
  const today = isoDate(new Date());
  if (f.period === 'today') return { dateFrom: today, dateTo: today };
  if (f.period === 'month') return { dateFrom: startOfMonth(), dateTo: today };
  return { dateFrom: '', dateTo: '' };
}

function hasTextFilters(f: AppliedFilters) {
  return Boolean(
    f.receiptNumber.trim() || f.seller.trim() || f.pos.trim() || f.notes.trim(),
  );
}

function buildQuery(f: AppliedFilters, offset: number, limit: number) {
  const { dateFrom, dateTo } = resolveDates(f);
  const params = new URLSearchParams();
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo) params.set('dateTo', dateTo);
  if (f.receiptNumber.trim()) params.set('receiptNumber', f.receiptNumber.trim());
  if (f.seller.trim()) params.set('seller', f.seller.trim());
  if (f.pos.trim()) params.set('pos', f.pos.trim());
  if (f.notes.trim()) params.set('notes', f.notes.trim());
  withPagination(params, offset, limit);
  return `/api/sales?${params.toString()}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDay(d: string) {
  return new Date(d).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function lineEligibility(item: SaleItem): { ok: boolean; label: string } {
  if (allowsChangeTicket(item)) {
    if (item.allows_exchange && item.allows_return) return { ok: true, label: 'Cambio y devolución' };
    if (item.allows_exchange) return { ok: true, label: 'Solo cambio' };
    return { ok: true, label: 'Solo devolución' };
  }
  return { ok: false, label: 'Sin cambio/devolución' };
}

const SORT_OPTIONS: { key: SaleSortKey; label: string }[] = [
  { key: 'date', label: 'Fecha' },
  { key: 'receipt', label: 'N°' },
  { key: 'seller', label: 'Vendedora' },
  { key: 'pos', label: 'POS' },
  { key: 'total', label: 'Total' },
];

export function SalesHistoryPage() {
  const { branchId } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<AppliedFilters>(() =>
    loadListFilters('ventas', branchId, DEFAULT_FILTERS),
  );

  const [sortKey, setSortKey] = useState<SaleSortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [periodSummary, setPeriodSummary] = useState({ count: 0, totalAmount: 0 });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draftDateFrom, setDraftDateFrom] = useState('');
  const [draftDateTo, setDraftDateTo] = useState('');
  const [draftReceiptNumber, setDraftReceiptNumber] = useState('');
  const [draftSeller, setDraftSeller] = useState('');
  const [draftPos, setDraftPos] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const filtersTitleId = useId();
  const modalRef = useRef<HTMLDivElement>(null);

  const [selected, setSelected] = useState<Sale | null>(null);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [vouchers, setVouchers] = useState<ChangeVoucher[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [includeChangeTickets, setIncludeChangeTickets] = useState(true);
  const { printJob, setPrintJob, reminder: printReminder } = useSalePrint();
  const detailTitleId = useId();
  const detailPanelRef = useRef<HTMLDivElement>(null);
  const deepLinkHandled = useRef<string | null>(null);

  const listFilters: ListFilters = useMemo(
    () => ({ ...filters, branchId: branchId || '' }),
    [filters, branchId],
  );

  useEffect(() => {
    setFilters(loadListFilters('ventas', branchId, DEFAULT_FILTERS));
  }, [branchId]);

  useEffect(() => {
    saveListFilters('ventas', branchId, filters);
  }, [branchId, filters]);

  const fetchPage = useCallback(async (f: ListFilters, offset: number, limit: number) => {
    const data = await api<{
      sales: Sale[];
      hasMore: boolean;
      nextOffset?: number;
      summary?: { count: number; totalAmount: number };
    }>(buildQuery(f, offset, limit));
    if (offset === 0 && data.summary) {
      setPeriodSummary({
        count: Number(data.summary.count) || 0,
        totalAmount: Number(data.summary.totalAmount) || 0,
      });
    }
    return {
      items: data.sales,
      hasMore: data.hasMore,
      nextOffset: data.nextOffset,
    };
  }, []);

  const {
    items: sales,
    hasMore,
    loading,
    loadingMore,
    error,
    scrollRef,
    sentinelRef,
  } = useInfiniteList({ filters: listFilters, fetchPage });

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const sorted = useMemo(() => sortSales(sales, sortKey, sortDir), [sales, sortKey, sortDir]);

  const periodRangeActive = Boolean(filters.dateFrom || filters.dateTo);
  const hasExtraFilters = periodRangeActive || hasTextFilters(filters);

  const summaryChips = useMemo(() => {
    const chips: { key: string; label: string }[] = [];
    if (filters.dateFrom) chips.push({ key: 'from', label: `Desde ${fmtDay(filters.dateFrom)}` });
    if (filters.dateTo) chips.push({ key: 'to', label: `Hasta ${fmtDay(filters.dateTo)}` });
    if (filters.receiptNumber.trim()) {
      chips.push({ key: 'receipt', label: `N° ${filters.receiptNumber.trim()}` });
    }
    if (filters.seller.trim()) {
      chips.push({ key: 'seller', label: `Vendedora: ${filters.seller.trim()}` });
    }
    if (filters.pos.trim()) {
      chips.push({ key: 'pos', label: `POS: ${filters.pos.trim()}` });
    }
    if (filters.notes.trim()) {
      chips.push({ key: 'notes', label: `Notas: ${filters.notes.trim()}` });
    }
    return chips;
  }, [filters]);

  const kpiTotal = periodSummary.totalAmount;
  const kpiCount = periodSummary.count;
  const kpiTicket = kpiCount ? kpiTotal / kpiCount : 0;

  function toggleSort(column: SaleSortKey) {
    const next = nextSaleSort(sortKey, sortDir, column);
    setSortKey(next.key);
    setSortDir(next.dir);
  }

  function setPeriod(period: PeriodChip) {
    setFilters({
      ...filters,
      period,
      dateFrom: '',
      dateTo: '',
    });
  }

  function openDrawer() {
    setDraftDateFrom(filters.dateFrom);
    setDraftDateTo(filters.dateTo);
    setDraftReceiptNumber(filters.receiptNumber);
    setDraftSeller(filters.seller);
    setDraftPos(filters.pos);
    setDraftNotes(filters.notes);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  function applyDrawer() {
    setFilters({
      period: draftDateFrom || draftDateTo ? 'all' : filters.period,
      dateFrom: draftDateFrom,
      dateTo: draftDateTo,
      receiptNumber: draftReceiptNumber,
      seller: draftSeller,
      pos: draftPos,
      notes: draftNotes,
    });
    setDrawerOpen(false);
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  useEffect(() => {
    if (!drawerOpen) return;
    const panel = modalRef.current;
    const t = window.setTimeout(() => {
      panel?.querySelector<HTMLElement>('input, select, button')?.focus();
    }, 40);
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDrawer();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
    };
  }, [drawerOpen]);

  async function openSale(sale: Sale) {
    setSelected(sale);
    setDetailLoading(true);
    setItems([]);
    setVouchers([]);
    setIncludeChangeTickets(true);
    try {
      const data = await api<{
        items: SaleItem[];
        sale?: Sale;
        vouchers?: ChangeVoucher[];
      }>(`/api/sales/${sale.id}`);
      setItems(data.items);
      setVouchers(data.vouchers || []);
      const merged: Sale = data.sale
        ? {
            ...sale,
            ...data.sale,
            seller_name: data.sale.seller_name || sale.seller_name,
            pos_name: data.sale.pos_name || sale.pos_name,
            branch_name: data.sale.branch_name,
          }
        : sale;
      setSelected(merged);
      const eligible = data.items.filter(allowsChangeTicket).length;
      const inWindow = withinChangeWindow(merged.sold_at);
      setIncludeChangeTickets(eligible > 0 && inWindow);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al cargar la venta';
      toast.error(msg);
      setSelected(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function openSaleById(id: string) {
    const fromList = sales.find((s) => s.id === id);
    if (fromList) {
      await openSale(fromList);
      return;
    }
    setSelected({
      id,
      receipt_number: '…',
      total: '0',
      discount: '0',
      sold_at: new Date().toISOString(),
      seller_name: '',
      pos_name: '',
      notes: null,
    });
    setDetailLoading(true);
    setItems([]);
    setVouchers([]);
    try {
      const data = await api<{
        items: SaleItem[];
        sale: Sale;
        vouchers?: ChangeVoucher[];
      }>(`/api/sales/${id}`);
      setItems(data.items);
      setVouchers(data.vouchers || []);
      setSelected(data.sale);
      const eligible = data.items.filter(allowsChangeTicket).length;
      const inWindow = withinChangeWindow(data.sale.sold_at);
      setIncludeChangeTickets(eligible > 0 && inWindow);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al cargar la venta';
      toast.error(msg);
      setSelected(null);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setSelected(null);
    setItems([]);
    setVouchers([]);
    if (searchParams.has('sale')) {
      const next = new URLSearchParams(searchParams);
      next.delete('sale');
      setSearchParams(next, { replace: true });
    }
  }

  useEffect(() => {
    const saleId = searchParams.get('sale');
    if (!saleId || loading) return;
    if (deepLinkHandled.current === saleId) return;
    deepLinkHandled.current = saleId;
    void openSaleById(saleId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- abrir solo al llegar el query
  }, [searchParams, loading, sales]);

  const eligibleLines = useMemo(() => items.filter(allowsChangeTicket), [items]);
  const changeWindowOpen = selected ? withinChangeWindow(selected.sold_at) : false;
  const daysOld = selected ? daysSinceSale(selected.sold_at) : 0;
  const canIncludeTickets = changeWindowOpen && eligibleLines.length > 0;
  const changeTicketsPreview = useMemo(() => {
    if (!selected || !canIncludeTickets) return [];
    return buildChangeTickets(selected, items, vouchers);
  }, [selected, items, vouchers, canIncludeTickets]);

  function handleReprint() {
    if (!selected || detailLoading) {
      toast.warn('Selecciona un comprobante primero');
      return;
    }
    const wantTickets = includeChangeTickets && canIncludeTickets;
    const tickets = wantTickets ? buildChangeTickets(selected, items, vouchers) : [];
    setPrintJob({
      sale: selected,
      items,
      changeTickets: tickets,
      reprint: true,
    });
    const parts = ['Comprobante listo para imprimir'];
    if (wantTickets) {
      parts.push(
        tickets.length
          ? `${tickets.length} ticket${tickets.length === 1 ? '' : 's'} de cambio`
          : 'sin tickets elegibles',
      );
    } else if (includeChangeTickets && !changeWindowOpen) {
      parts.push('tickets omitidos: plazo de 7 días vencido');
    }
    toast.success(parts.join(' · '));
  }

  useEffect(() => {
    if (!selected) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDetail();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selected]);

  const isDefaultEmpty =
    filters.period === 'today' && !filters.dateFrom && !filters.dateTo && !hasTextFilters(filters);

  return (
    <div className="ing-list sales-list">
      <div className="ing-list-workspace">
        <div className="ing-list-main">
          <div className="section-title">
            <div className="page-intro" style={{ marginBottom: 0 }}>
              <p>Comprobantes de la sucursal activa</p>
            </div>
            <Link className="btn secondary sales-pos-btn desktop-only" to="/vender">
              Ir a ventas
            </Link>
          </div>

          <div className="inv-stats sales-stats" aria-label="Resumen de ventas">
            <div className="inv-stat">
              <span className="inv-stat-label">Total periodo</span>
              <strong className="inv-stat-value sales-stat-money">{moneyClp(kpiTotal)}</strong>
              <span className="inv-stat-meta">
                {filters.period === 'today' && !periodRangeActive
                  ? 'Hoy'
                  : filters.period === 'month' && !periodRangeActive
                    ? 'Este mes'
                    : 'Filtro activo'}
              </span>
            </div>
            <div className="inv-stat">
              <span className="inv-stat-label">Comprobantes</span>
              <strong className="inv-stat-value">{kpiCount}</strong>
              <span className="inv-stat-meta">En el listado</span>
            </div>
            <div className="inv-stat">
              <span className="inv-stat-label">Ticket medio</span>
              <strong className="inv-stat-value sales-stat-money">{moneyClp(kpiTicket)}</strong>
              <span className="inv-stat-meta">Por venta</span>
            </div>
          </div>

          <div className="ing-filters" role="toolbar" aria-label="Filtros de ventas">
            <button
              type="button"
              className={`ing-chip${filters.period === 'today' && !periodRangeActive ? ' is-active' : ''}`}
              aria-pressed={filters.period === 'today' && !periodRangeActive}
              onClick={() => setPeriod('today')}
            >
              Hoy
            </button>
            <button
              type="button"
              className={`ing-chip${filters.period === 'month' && !periodRangeActive ? ' is-active' : ''}`}
              aria-pressed={filters.period === 'month' && !periodRangeActive}
              onClick={() => setPeriod('month')}
            >
              Este mes
            </button>
            <button
              type="button"
              className={`ing-chip${filters.period === 'all' && !periodRangeActive ? ' is-active' : ''}`}
              aria-pressed={filters.period === 'all' && !periodRangeActive}
              onClick={() => setPeriod('all')}
            >
              Recientes
            </button>
            <button type="button" className="btn secondary ing-filters-btn" onClick={openDrawer}>
              Filtros
              {hasExtraFilters ? (
                <span className="prod-filters-badge" aria-label="Filtros activos">
                  {summaryChips.length}
                </span>
              ) : null}
            </button>
            <div className="field sales-sort-select mobile-only">
              <label className="sr-only" htmlFor="sales-sort">
                Ordenar
              </label>
              <select
                id="sales-sort"
                aria-label="Ordenar por"
                value={`${sortKey}:${sortDir}`}
                onChange={(e) => {
                  const [key, dir] = e.target.value.split(':') as [SaleSortKey, SortDir];
                  setSortKey(key);
                  setSortDir(dir);
                }}
              >
                {SORT_OPTIONS.flatMap((o) => [
                  <option key={`${o.key}:asc`} value={`${o.key}:asc`}>
                    {o.label} ↑
                  </option>,
                  <option key={`${o.key}:desc`} value={`${o.key}:desc`}>
                    {o.label} ↓
                  </option>,
                ])}
              </select>
            </div>
          </div>
{error && <p className="error">{error}</p>}

          <div className="ing-list-scroll" ref={scrollRef}>
            {loading && (
              <div className="ing-skel" aria-busy="true" aria-label="Cargando ventas">
                <div className="ing-skel-row" />
                <div className="ing-skel-row" />
                <div className="ing-skel-row" />
              </div>
            )}

            {!loading && !sales.length && (
              <div className="sales-empty">
                <h3>
                  {isDefaultEmpty ? 'Sin ventas hoy' : 'Ningún comprobante coincide'}
                </h3>
                <p className="muted">
                  {isDefaultEmpty
                    ? 'Cuando cobres en el módulo de ventas, los comprobantes aparecen acá.'
                    : 'Prueba otro periodo o limpia los filtros.'}
                </p>
                {isDefaultEmpty ? (
                  <Link to="/vender" className="btn secondary desktop-only" style={{ marginTop: '0.75rem' }}>
                    Ir a ventas
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="btn secondary"
                    style={{ marginTop: '0.75rem' }}
                    onClick={clearFilters}
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
            )}

            {!loading && sales.length > 0 && (
              <>
                <p className="sales-status muted">
                  {sorted.length} comprobante{sorted.length === 1 ? '' : 's'}
                </p>

                <div className="list-cards mobile-only">
                  {sorted.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="list-card sales-card"
                      onClick={() => void openSale(s)}
                    >
                      <div className="row">
                        <strong>{s.receipt_number}</strong>
                        <strong className="sales-card-total">{money(s.total)}</strong>
                      </div>
                      <div className="meta">
                        {fmtDate(s.sold_at)} · {s.seller_name} · {s.pos_name}
                        {' · '}
                        {paymentMethodLabel(s.payment_method)}
                      </div>
                      <div className="sales-card-foot">
                        <span className="sales-row-action">Ver</span>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="table-wrap desktop-only">
                  <table className="table sales-table">
                    <thead>
                      <tr>
                        <SortableTh
                          label="N°"
                          column="receipt"
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={toggleSort}
                        />
                        <SortableTh
                          label="Fecha"
                          column="date"
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={toggleSort}
                        />
                        <SortableTh
                          label="Vendedora"
                          column="seller"
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={toggleSort}
                        />
                        <SortableTh
                          label="POS"
                          column="pos"
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={toggleSort}
                        />
                        <th>Pago</th>
                        <SortableTh
                          label="Total"
                          column="total"
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={toggleSort}
                        />
                        <th className="sales-th-action">
                          <span className="sr-only">Acción</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((s) => (
                        <tr key={s.id} className="sales-row">
                          <td>
                            <strong>{s.receipt_number}</strong>
                          </td>
                          <td>{fmtDate(s.sold_at)}</td>
                          <td>{s.seller_name}</td>
                          <td>{s.pos_name}</td>
                          <td className="muted">{paymentMethodLabel(s.payment_method)}</td>
                          <td className="sales-num">{money(s.total)}</td>
                          <td className="sales-th-action">
                            <button
                              type="button"
                              className="btn secondary"
                              onClick={() => void openSale(s)}
                            >
                              Ver
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <InfiniteListFooter
                  sentinelRef={sentinelRef}
                  loadingMore={loadingMore}
                  hasMore={hasMore}
                  itemCount={sales.length}
                />
              </>
            )}
          </div>
        </div>

        <aside className="ing-list-figure" aria-hidden="true">
          <img
            className="ing-list-figure-img"
            src="/brand/historial-ventas-modelo.png"
            alt=""
          />
        </aside>
      </div>

      {drawerOpen && (
        <PosModal
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDrawer();
          }}>
          <ModalOverlayClose onClose={closeDrawer}>
          <div
            className="pos-modal-panel ing-filters-sheet"
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={filtersTitleId}
          >
            <div className="pos-modal-head">
              <h3 id={filtersTitleId}>Filtros</h3>
            </div>

            <div className="ing-filters-sheet-body">
              <div className="ing-filter-fields">
                <div className="field">
                  <label htmlFor="sales-f-from">Fecha desde</label>
                  <input
                    id="sales-f-from"
                    type="date"
                    value={draftDateFrom}
                    onChange={(e) => setDraftDateFrom(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="sales-f-to">Fecha hasta</label>
                  <input
                    id="sales-f-to"
                    type="date"
                    value={draftDateTo}
                    onChange={(e) => setDraftDateTo(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="sales-f-receipt">N° / folio</label>
                  <input
                    id="sales-f-receipt"
                    value={draftReceiptNumber}
                    onChange={(e) => setDraftReceiptNumber(e.target.value)}
                    placeholder="Ej. V000123"
                    autoComplete="off"
                  />
                </div>
                <div className="field">
                  <label htmlFor="sales-f-seller">Vendedora</label>
                  <input
                    id="sales-f-seller"
                    value={draftSeller}
                    onChange={(e) => setDraftSeller(e.target.value)}
                    placeholder="Nombre"
                    autoComplete="off"
                  />
                </div>
                <div className="field">
                  <label htmlFor="sales-f-pos">POS / caja</label>
                  <input
                    id="sales-f-pos"
                    value={draftPos}
                    onChange={(e) => setDraftPos(e.target.value)}
                    placeholder="Nombre de caja"
                    autoComplete="off"
                  />
                </div>
                <div className="field">
                  <label htmlFor="sales-f-notes">Notas</label>
                  <input
                    id="sales-f-notes"
                    value={draftNotes}
                    onChange={(e) => setDraftNotes(e.target.value)}
                    placeholder="Texto en notas"
                    autoComplete="off"
                  />
                </div>
              </div>
            </div>

            <div className="btn-row ing-filters-sheet-actions">
              <button type="button" className="btn secondary" onClick={closeDrawer}>
                Cancelar
              </button>
              <button type="button" className="btn" onClick={applyDrawer}>
                Aplicar
              </button>
            </div>
          </div></ModalOverlayClose>
        </PosModal>
      )}

      {selected && (
        <PosModal
          className="no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDetail();
          }}>
          <ModalOverlayClose onClose={closeDetail}>
          <div
            className="pos-modal-panel sales-detail-modal"
            ref={detailPanelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={detailTitleId}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sales-detail-scroll">
              <div className="pos-modal-head">
                <h3 id={detailTitleId}>{selected.receipt_number}</h3>
              </div>

              <p className="sales-detail-meta muted">
                {fmtDate(selected.sold_at)}
                {selected.branch_name ? ` · ${selected.branch_name}` : ''}
                {` · ${selected.seller_name} · ${selected.pos_name}`}
              </p>
              <p className="sales-detail-meta muted">
                Medio de pago: <strong>{paymentMethodLabel(selected.payment_method)}</strong>
              </p>

              {Number(selected.discount) > 0 && (
                <p className="sales-detail-discount muted">
                  Descuento: {money(selected.discount)}
                </p>
              )}

              <div className="sales-detail-rules" role="note">
                <strong>Reglas de cambio / devolución</strong>
                <ul>
                  <li>Plazo máximo: <strong>{CHANGE_TICKET_DAYS} días</strong> desde la fecha de venta.</li>
                  <li>Solo prendas habilitadas (vestidos de fiesta suelen no admitir cambio).</li>
                  <li>Presentar el ticket en piso; prenda en buen estado, sin manchas ni olor a cigarro.</li>
                </ul>
                {!changeWindowOpen && (
                  <p className="sales-detail-rules-warn">
                    Esta venta tiene {daysOld} día{daysOld === 1 ? '' : 's'}: el plazo de tickets venció.
                    Aún puedes reimprimir el comprobante.
                  </p>
                )}
              </div>

              {detailLoading && <p className="muted">Cargando prendas…</p>}

              {!detailLoading && (
                <div className="sales-detail-items">
                  {items.map((i) => {
                    const elig = lineEligibility(i);
                    return (
                      <div className="list-card sales-detail-item" key={i.id}>
                        <div className="row">
                          <strong>{i.name}</strong>
                          <strong>{money(i.line_total)}</strong>
                        </div>
                        <div className="meta">
                          {i.internal_code} · {i.quantity} × {money(i.unit_price)}
                          {i.size_label ? ` · ${i.size_label}` : ''}
                        </div>
                        <div className="meta sales-detail-elig">
                          <span className={`badge${elig.ok ? ' brand' : ''}`}>
                            {elig.ok ? 'Elegible: Sí' : 'Elegible: No'}
                          </span>
                          <span className="muted">{elig.label}</span>
                        </div>
                      </div>
                    );
                  })}
                  {!items.length && <p className="muted">Sin ítems</p>}
                </div>
              )}

              {!detailLoading && (
                <div className="sales-detail-total">
                  <span>Total</span>
                  <strong>{money(selected.total)}</strong>
                </div>
              )}

              {selected.notes?.trim() ? (
                <p className="sales-detail-notes muted">Notas: {selected.notes.trim()}</p>
              ) : null}
            </div>

            {!detailLoading && (
              <div className="sales-detail-footer">
                <label
                  className={`sales-hist-check${canIncludeTickets ? '' : ' is-disabled'}`}
                  title={
                    !changeWindowOpen
                      ? 'Plazo de 7 días vencido'
                      : eligibleLines.length === 0
                        ? 'Ninguna prenda admite cambio o devolución'
                        : undefined
                  }
                >
                  <input
                    type="checkbox"
                    checked={includeChangeTickets && canIncludeTickets}
                    disabled={!canIncludeTickets}
                    onChange={(e) => setIncludeChangeTickets(e.target.checked)}
                  />
                  <span>
                    Incluir tickets de cambio/devolución
                    {canIncludeTickets
                      ? ` (${changeTicketsPreview.length})`
                      : !changeWindowOpen
                        ? ' — plazo vencido'
                        : ' — sin prendas elegibles'}
                  </span>
                </label>
                <button type="button" className="btn" onClick={handleReprint}>
                  Reimprimir comprobante
                </button>
              </div>
            )}
          </div></ModalOverlayClose>
        </PosModal>
      )}

      {printJob ? <SaleThermalPrint job={printJob} /> : null}
      {printReminder}
    </div>
  );
}
