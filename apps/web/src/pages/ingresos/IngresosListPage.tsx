import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { InfiniteListFooter } from '../../components/InfiniteListFooter';
import { ModalOverlayClose } from '../../components/ModalOverlayClose';
import { SortableTh } from '../../components/SortableTh';
import { useInfiniteList } from '../../hooks/useInfiniteList';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { withPagination } from '../../lib/pagination';
import { unpackComprobante } from '../../lib/comprobanteEmbed';
import {
  nextSort,
  sortPurchases,
  type PurchaseSortKey,
  type SortDir,
} from '../../lib/purchaseListSort';
import {
  formatDate,
  purchaseActionLabel,
  purchaseProgress,
  purchaseRef,
  statusBadgeClass,
  statusLabel,
  type Purchase,
  type PurchaseStatus,
} from '../../lib/purchasesStatus';

/** Default de piso: pendientes + parciales. */
const OPEN_STATUSES = 'pending_reception,partially_received';

type StatusFilter =
  | 'pending_and_partial'
  | 'pending_reception'
  | 'partially_received'
  | 'received'
  | 'all';

type AppliedFilters = {
  status: StatusFilter;
  dateFrom: string;
  dateTo: string;
  q: string;
};

const DEFAULT_FILTERS: AppliedFilters = {
  status: 'pending_and_partial',
  dateFrom: '',
  dateTo: '',
  q: '',
};

function statusToQuery(status: StatusFilter): string {
  if (status === 'pending_and_partial') return OPEN_STATUSES;
  return status;
}

function buildQuery(f: AppliedFilters, offset: number, limit: number) {
  const params = new URLSearchParams();
  params.set('status', statusToQuery(f.status));
  if (f.dateFrom) params.set('dateFrom', f.dateFrom);
  if (f.dateTo) params.set('dateTo', f.dateTo);
  if (f.q.trim()) params.set('q', f.q.trim());
  withPagination(params, offset, limit);
  return `/api/purchases?${params.toString()}`;
}

function progressLabel(p: Purchase) {
  const { ordered, received, lines } = purchaseProgress(p);
  if (!lines && !ordered) return '—';
  if (ordered > 0) return `${received} / ${ordered} uds`;
  return `${lines} línea${lines === 1 ? '' : 's'}`;
}

export function IngresosListPage() {
  const { branchId } = useAuth();
  const [filters, setFilters] = useState<AppliedFilters>(DEFAULT_FILTERS);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draftDateFrom, setDraftDateFrom] = useState('');
  const [draftDateTo, setDraftDateTo] = useState('');
  const [draftQ, setDraftQ] = useState('');
  const [draftStatus, setDraftStatus] = useState<StatusFilter>('pending_and_partial');
  const [sortKey, setSortKey] = useState<PurchaseSortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const modalRef = useRef<HTMLDivElement>(null);
  const filtersTitleId = useId();

  const listFilters = useMemo(
    () => ({ ...filters, branchId: branchId || '' }),
    [filters, branchId],
  );

  const fetchPage = useCallback(async (f: AppliedFilters & { branchId: string }, offset: number, limit: number) => {
    const data = await api<{
      purchases: Purchase[];
      hasMore: boolean;
      nextOffset?: number;
    }>(buildQuery(f, offset, limit));
    return {
      items: data.purchases,
      hasMore: data.hasMore,
      nextOffset: data.nextOffset,
    };
  }, []);

  const {
    items: purchases,
    hasMore,
    loading,
    loadingMore,
    error,
    scrollRef,
    sentinelRef,
  } = useInfiniteList({ filters: listFilters, fetchPage });

  const sortedPurchases = useMemo(
    () => sortPurchases(purchases, sortKey, sortDir),
    [purchases, sortKey, sortDir],
  );

  function toggleSort(column: PurchaseSortKey) {
    const next = nextSort(sortKey, sortDir, column);
    setSortKey(next.key);
    setSortDir(next.dir);
  }

  const isDefaultOpen =
    filters.status === 'pending_and_partial' && !filters.dateFrom && !filters.dateTo && !filters.q.trim();

  const hasExtraFilters =
    Boolean(filters.dateFrom) ||
    Boolean(filters.dateTo) ||
    Boolean(filters.q.trim()) ||
    filters.status !== 'pending_and_partial';

  const summaryChips = useMemo(() => {
    const chips: { key: string; label: string }[] = [];
    if (filters.dateFrom) chips.push({ key: 'from', label: `Desde ${formatDate(filters.dateFrom)}` });
    if (filters.dateTo) chips.push({ key: 'to', label: `Hasta ${formatDate(filters.dateTo)}` });
    if (filters.q.trim()) chips.push({ key: 'q', label: `Producto: ${filters.q.trim()}` });
    if (filters.status === 'pending_reception') chips.push({ key: 'st', label: 'Solo pendiente' });
    if (filters.status === 'partially_received') chips.push({ key: 'st', label: 'Parcial' });
    if (filters.status === 'received') chips.push({ key: 'st', label: 'Recibido' });
    if (filters.status === 'all') chips.push({ key: 'st', label: 'Todos' });
    return chips;
  }, [filters]);

  function openDrawer() {
    setDraftDateFrom(filters.dateFrom);
    setDraftDateTo(filters.dateTo);
    setDraftQ(filters.q);
    setDraftStatus(filters.status);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  function applyDrawer() {
    setFilters({
      status: draftStatus,
      dateFrom: draftDateFrom,
      dateTo: draftDateTo,
      q: draftQ,
    });
    setDrawerOpen(false);
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  function activateOpen() {
    setFilters((prev) => ({ ...prev, status: 'pending_and_partial' }));
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

  return (
    <div className="ing-list">
      <div className="ing-list-workspace">
        <div className="ing-list-main">
      <div className="section-title">
        <div className="page-intro" style={{ marginBottom: 0 }}>
          <p>Mercadería a stock por sucursal</p>
        </div>
      </div>

      <div className="ing-filters" role="toolbar" aria-label="Filtros de ingresos">
        <button
          type="button"
          className={`ing-chip${filters.status === 'pending_and_partial' ? ' is-active' : ''}`}
          aria-pressed={filters.status === 'pending_and_partial'}
          data-help="cta.ingresos.pendiente"
          onClick={activateOpen}
        >
          Pendiente + Parcial
        </button>
        <button type="button" className="btn secondary ing-filters-btn" data-help="cta.ingresos.filtros" onClick={openDrawer}>
          Filtros
        </button>
      </div>

      {hasExtraFilters && (
        <div className="ing-filter-summary" aria-label="Filtros activos">
          {summaryChips.map((c) => (
            <span key={c.key} className="ing-chip is-active ing-chip-static">
              {c.label}
            </span>
          ))}
          <button type="button" className="btn ghost" onClick={clearFilters}>
            Limpiar
          </button>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <div className="ing-list-scroll" ref={scrollRef}>
      {loading && (
        <div className="ing-skel" aria-busy="true" aria-label="Cargando ingresos">
          <div className="ing-skel-row" />
          <div className="ing-skel-row" />
          <div className="ing-skel-row" />
        </div>
      )}

      {!loading && !purchases.length && (
        <div className="ing-empty">
          {isDefaultOpen ? (
            <>
              <p>No hay pendientes ni parciales</p>
              <p className="muted">Cuando haya compras por recibir, aparecerán aquí.</p>
              <Link to="/compras" className="btn secondary" style={{ marginTop: '0.75rem' }}>
                Ver compras
              </Link>
            </>
          ) : (
            <>
              <p>Sin resultados con estos filtros</p>
              <p className="muted">Prueba otras fechas, producto o estado.</p>
              <button type="button" className="btn secondary" style={{ marginTop: '0.75rem' }} onClick={clearFilters}>
                Limpiar filtros
              </button>
            </>
          )}
        </div>
      )}

      {!loading && purchases.length > 0 && (
        <>
          <div className="list-cards mobile-only">
            {sortedPurchases.map((p) => {
              const action = purchaseActionLabel(p.status as PurchaseStatus);
              const prog = purchaseProgress(p);
              return (
                <Link key={p.id} to={`/ingresos/${p.id}`} className="list-card ing-row">
                  <div className="row">
                    <strong>{purchaseRef(p)}</strong>
                    <span className={statusBadgeClass(p.status as PurchaseStatus)}>
                      {statusLabel(p.status)}
                    </span>
                  </div>
                  <div className="meta">
                    {formatDate(p.purchased_at || p.created_at)}
                    {p.supplier_name ? ` · ${p.supplier_name}` : ''}
                  </div>
                  <div className="ing-card-foot">
                    <span className="ing-progress-meta">
                      {prog.ordered > 0
                        ? `${prog.received} de ${prog.ordered} uds`
                        : progressLabel(p)}
                    </span>
                    <span className="ing-row-action">{action}</span>
                  </div>
                </Link>
              );
            })}
          </div>
          <div className="table-wrap desktop-only">
            <table className="table ing-table">
              <thead>
                <tr>
                  <SortableTh
                    label="Referencia"
                    column="ref"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Proveedor"
                    column="supplier"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Progreso"
                    column="progress"
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
                    label="Estado"
                    column="status"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <th className="ing-th-action">Acción</th>
                </tr>
              </thead>
              <tbody>
                {sortedPurchases.map((p) => {
                  const action = purchaseActionLabel(p.status as PurchaseStatus);
                  const prog = purchaseProgress(p);
                  const pct =
                    prog.ordered > 0 ? Math.min(100, Math.round((prog.received / prog.ordered) * 100)) : 0;
                  return (
                    <tr key={p.id} className="ing-row">
                      <td>
                        <strong>{purchaseRef(p)}</strong>
                        {unpackComprobante(p.notes).text ? (
                          <div className="meta muted ing-notes-preview">
                            {unpackComprobante(p.notes).text}
                          </div>
                        ) : null}
                      </td>
                      <td className="ing-td-supplier">
                        {p.supplier_name?.trim() || <span className="muted">—</span>}
                      </td>
                      <td className="ing-td-progress">
                        <div className="ing-progress">
                          <div className="ing-progress-bar" aria-hidden>
                            <span style={{ width: `${pct}%` }} />
                          </div>
                          <span className="ing-progress-meta">
                            {prog.ordered > 0
                              ? `${prog.received} / ${prog.ordered} uds`
                              : progressLabel(p)}
                            {prog.lines > 0 ? (
                              <span className="muted">
                                {' '}
                                · {prog.lines} línea{prog.lines === 1 ? '' : 's'}
                              </span>
                            ) : null}
                          </span>
                        </div>
                      </td>
                      <td className="ing-td-date">{formatDate(p.purchased_at || p.created_at)}</td>
                      <td>
                        <span className={statusBadgeClass(p.status as PurchaseStatus)}>
                          {statusLabel(p.status)}
                        </span>
                      </td>
                      <td className="ing-td-action">
                        <Link
                          to={`/ingresos/${p.id}`}
                          className={`ing-row-action${p.status === 'received' ? ' is-review' : ''}`}
                        >
                          {action}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <InfiniteListFooter
            sentinelRef={sentinelRef}
            loadingMore={loadingMore}
            hasMore={hasMore}
            itemCount={purchases.length}
          />
        </>
      )}
      </div>
        </div>

        <aside className="ing-list-figure" aria-hidden="true">
          <img
            className="ing-list-figure-img"
            src="/brand/vendedora-pistola.png"
            alt=""
            width={1024}
            height={1536}
            decoding="async"
            loading="lazy"
          />
        </aside>
      </div>

      {drawerOpen && (
        <div
          className="pos-modal open"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDrawer();
          }}
        >
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
                <label htmlFor="ing-f-from">Fecha desde</label>
                <input
                  id="ing-f-from"
                  type="date"
                  value={draftDateFrom}
                  onChange={(e) => setDraftDateFrom(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="ing-f-to">Fecha hasta</label>
                <input
                  id="ing-f-to"
                  type="date"
                  value={draftDateTo}
                  onChange={(e) => setDraftDateTo(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="ing-f-q">Producto</label>
                <input
                  id="ing-f-q"
                  value={draftQ}
                  onChange={(e) => setDraftQ(e.target.value)}
                  placeholder="Nombre o descripción"
                  autoComplete="off"
                />
              </div>
              <div className="field">
                <label htmlFor="ing-f-status">Estado</label>
                <select
                  id="ing-f-status"
                  value={draftStatus}
                  onChange={(e) => setDraftStatus(e.target.value as StatusFilter)}
                >
                  <option value="pending_and_partial">Pendiente + Parcial</option>
                  <option value="pending_reception">Solo pendiente</option>
                  <option value="partially_received">Parcial</option>
                  <option value="received">Recibido</option>
                  <option value="all">Todos</option>
                </select>
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
        </div>
      )}
    </div>
  );
}
