import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { InfiniteListFooter } from '../components/InfiniteListFooter';
import { SortableTh } from '../components/SortableTh';
import { useInfiniteList } from '../hooks/useInfiniteList';
import { api } from '../lib/api';
import {
  nextMovementSort,
  sortMovements,
  type MovementSortKey,
  type SortDir,
} from '../lib/movementsListSort';
import { withPagination } from '../lib/pagination';
import { toast } from '../lib/toast';

type Movement = {
  id: string;
  movement_type: string;
  type_label: string;
  origin_kind: string;
  reason_label: string;
  reference_type: string | null;
  reference_id: string | null;
  reference_code: string | null;
  web_path: string | null;
  link_label: string | null;
  product_name: string;
  internal_code: string;
  quantity_delta: number;
  quantity_after: number;
  created_by_name: string | null;
  created_at: string;
  notes: string | null;
};

type TypeFilter = 'all' | string;

type AppliedFilters = {
  type: TypeFilter;
  dateFrom: string;
  dateTo: string;
  q: string;
};

const DEFAULT_FILTERS: AppliedFilters = {
  type: 'all',
  dateFrom: '',
  dateTo: '',
  q: '',
};

const TYPE_CHIPS: { id: TypeFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'PURCHASE_IN', label: 'Recepción' },
  { id: 'SALE_OUT', label: 'Venta' },
  { id: 'ADJUSTMENT', label: 'Ajuste' },
  { id: 'MERMA_OUT', label: 'Merma' },
];

const SORT_OPTIONS: { key: MovementSortKey; label: string }[] = [
  { key: 'date', label: 'Fecha' },
  { key: 'type', label: 'Tipo' },
  { key: 'product', label: 'Producto' },
  { key: 'delta', label: 'Δ' },
  { key: 'after', label: 'Después' },
  { key: 'user', label: 'Usuaria' },
];

function buildQuery(f: AppliedFilters, offset: number, limit: number) {
  const params = new URLSearchParams();
  if (f.type !== 'all') params.set('type', f.type);
  if (f.dateFrom) params.set('dateFrom', f.dateFrom);
  if (f.dateTo) params.set('dateTo', f.dateTo);
  if (f.q.trim()) params.set('q', f.q.trim());
  withPagination(params, offset, limit);
  return `/api/inventory/movements?${params.toString()}`;
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

/** Fecha compacta para tabla desktop (día + hora). */
function fmtDateCompact(d: string) {
  const dt = new Date(d);
  const day = dt.toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
  });
  const time = dt.toLocaleTimeString('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return { day, time, full: fmtDate(d) };
}

function fmtDay(d: string) {
  return new Date(d.length <= 10 ? `${d}T12:00:00` : d).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function shortLinkLabel(label: string | null) {
  if (!label) return 'Ver';
  return label.replace(/^Ver\s+/i, '');
}

function typeBadgeClass(type: string) {
  switch (type) {
    case 'PURCHASE_IN':
    case 'RETURN_IN':
    case 'EXCHANGE_IN':
      return 'badge success';
    case 'SALE_OUT':
      return 'badge brand';
    case 'MERMA_OUT':
    case 'EXCHANGE_OUT':
      return 'badge danger';
    case 'ADJUSTMENT':
      return 'badge warning';
    default:
      return 'badge';
  }
}

function deltaClass(delta: number) {
  if (delta < 0) return 'mov-delta is-out';
  if (delta > 0) return 'mov-delta is-in';
  return 'mov-delta';
}

export function MovementsPage() {
  const [filters, setFilters] = useState<AppliedFilters>(DEFAULT_FILTERS);

  const [sortKey, setSortKey] = useState<MovementSortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draftDateFrom, setDraftDateFrom] = useState('');
  const [draftDateTo, setDraftDateTo] = useState('');
  const [draftQ, setDraftQ] = useState('');
  const filtersTitleId = useId();
  const modalRef = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(async (f: AppliedFilters, offset: number, limit: number) => {
    const data = await api<{
      movements: Movement[];
      hasMore: boolean;
      nextOffset?: number;
    }>(buildQuery(f, offset, limit));
    return {
      items: data.movements,
      hasMore: data.hasMore,
      nextOffset: data.nextOffset,
    };
  }, []);

  const {
    items: movements,
    hasMore,
    loading,
    loadingMore,
    error,
    scrollRef,
    sentinelRef,
  } = useInfiniteList({
    filters,
    fetchPage,
  });

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const sorted = useMemo(
    () => sortMovements(movements, sortKey, sortDir),
    [movements, sortKey, sortDir],
  );

  const hasExtraFilters = Boolean(filters.dateFrom || filters.dateTo || filters.q.trim());

  const summaryChips = useMemo(() => {
    const chips: { key: string; label: string }[] = [];
    if (filters.dateFrom) chips.push({ key: 'from', label: `Desde ${fmtDay(filters.dateFrom)}` });
    if (filters.dateTo) chips.push({ key: 'to', label: `Hasta ${fmtDay(filters.dateTo)}` });
    if (filters.q.trim()) chips.push({ key: 'q', label: filters.q.trim() });
    return chips;
  }, [filters]);

  const kpiIn = movements
    .filter((m) => m.quantity_delta > 0)
    .reduce((s, m) => s + m.quantity_delta, 0);
  const kpiOut = movements
    .filter((m) => m.quantity_delta < 0)
    .reduce((s, m) => s + Math.abs(m.quantity_delta), 0);

  function toggleSort(column: MovementSortKey) {
    const next = nextMovementSort(sortKey, sortDir, column);
    setSortKey(next.key);
    setSortDir(next.dir);
  }

  function setType(type: TypeFilter) {
    setFilters((prev) => ({ ...prev, type }));
  }

  function openDrawer() {
    setDraftDateFrom(filters.dateFrom);
    setDraftDateTo(filters.dateTo);
    setDraftQ(filters.q);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  function applyDrawer() {
    setFilters((prev) => ({
      ...prev,
      dateFrom: draftDateFrom,
      dateTo: draftDateTo,
      q: draftQ,
    }));
    setDrawerOpen(false);
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  useEffect(() => {
    if (!drawerOpen) return;
    const panel = modalRef.current;
    const t = window.setTimeout(() => {
      panel?.querySelector<HTMLElement>('input, button')?.focus();
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
    <div className="ing-list mov-list">
      <div className="ing-list-workspace">
        <div className="ing-list-main">
          <div className="section-title">
            <div className="page-intro" style={{ marginBottom: 0 }}>
              <p>Trazabilidad de entradas y salidas de la sucursal activa</p>
            </div>
            <Link className="btn secondary mov-inv-btn" to="/inventario">
              Ir a inventario
            </Link>
          </div>

          <div className="inv-stats mov-stats" aria-label="Resumen de movimientos">
            <div className="inv-stat">
              <span className="inv-stat-label">Movimientos</span>
              <strong className="inv-stat-value">{movements.length}</strong>
              <span className="inv-stat-meta">En el listado</span>
            </div>
            <div className="inv-stat">
              <span className="inv-stat-label">Entradas</span>
              <strong className="inv-stat-value mov-kpi-in">+{kpiIn}</strong>
              <span className="inv-stat-meta">Unidades</span>
            </div>
            <div className="inv-stat">
              <span className="inv-stat-label">Salidas</span>
              <strong className="inv-stat-value mov-kpi-out">−{kpiOut}</strong>
              <span className="inv-stat-meta">Unidades</span>
            </div>
          </div>

          <div className="ing-filters" role="toolbar" aria-label="Filtros de movimientos">
            {TYPE_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={`ing-chip${filters.type === chip.id ? ' is-active' : ''}`}
                aria-pressed={filters.type === chip.id}
                onClick={() => setType(chip.id)}
              >
                {chip.label}
              </button>
            ))}
            <button type="button" className="btn secondary ing-filters-btn" onClick={openDrawer}>
              Filtros
              {hasExtraFilters ? (
                <span className="prod-filters-badge" aria-label="Filtros activos">
                  {summaryChips.length}
                </span>
              ) : null}
            </button>
            <div className="field mov-sort-select mobile-only">
              <label className="sr-only" htmlFor="mov-sort">
                Ordenar
              </label>
              <select
                id="mov-sort"
                aria-label="Ordenar por"
                value={`${sortKey}:${sortDir}`}
                onChange={(e) => {
                  const [key, dir] = e.target.value.split(':') as [MovementSortKey, SortDir];
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
              <div className="ing-skel" aria-busy="true" aria-label="Cargando movimientos">
                <div className="ing-skel-row" />
                <div className="ing-skel-row" />
                <div className="ing-skel-row" />
              </div>
            )}

            {!loading && !movements.length && (
              <div className="mov-empty">
                <h3>Sin movimientos</h3>
                <p className="muted">
                  Cuando recibas mercadería, vendas o ajustes stock, la trazabilidad aparece acá.
                </p>
                <Link to="/inventario" className="btn secondary" style={{ marginTop: '0.75rem' }}>
                  Ir a inventario
                </Link>
              </div>
            )}

            {!loading && movements.length > 0 && (
              <>
                <p className="mov-status muted">
                  {sorted.length} movimiento{sorted.length === 1 ? '' : 's'}
                </p>

                <div className="list-cards mobile-only">
                  {sorted.map((m) => (
                    <article key={m.id} className="list-card mov-card">
                      <div className="row">
                        <div className="mov-card-head">
                          <span className={typeBadgeClass(m.movement_type)}>{m.type_label}</span>
                          <span className="mov-card-when muted">{fmtDate(m.created_at)}</span>
                        </div>
                        <strong className={deltaClass(m.quantity_delta)}>
                          {m.quantity_delta > 0 ? `+${m.quantity_delta}` : m.quantity_delta}
                        </strong>
                      </div>
                      <strong className="mov-card-product">{m.product_name}</strong>
                      <div className="meta">
                        {m.internal_code}
                        <span className="muted"> · queda {m.quantity_after}</span>
                        {m.created_by_name ? (
                          <span className="muted"> · {m.created_by_name}</span>
                        ) : null}
                      </div>
                      <p className="mov-reason" title={m.reason_label}>
                        {m.reason_label}
                      </p>
                      {m.web_path && (
                        <div className="mov-card-foot">
                          <Link className="mov-origin-link" to={m.web_path}>
                            {m.link_label || 'Ver origen'} →
                          </Link>
                        </div>
                      )}
                    </article>
                  ))}
                </div>

                <div className="table-wrap desktop-only mov-table-wrap">
                  <table className="table mov-table">
                    <thead>
                      <tr>
                        <SortableTh
                          label="Fecha"
                          column="date"
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={toggleSort}
                          className="mov-col-date"
                        />
                        <SortableTh
                          label="Tipo"
                          column="type"
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={toggleSort}
                          className="mov-col-type"
                        />
                        <SortableTh
                          label="Producto"
                          column="product"
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={toggleSort}
                          className="mov-col-product"
                        />
                        <th className="mov-col-reason">Motivo</th>
                        <SortableTh
                          label="Δ"
                          column="delta"
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={toggleSort}
                          className="mov-col-num"
                        />
                        <SortableTh
                          label="Stock"
                          column="after"
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={toggleSort}
                          className="mov-col-num"
                        />
                        <SortableTh
                          label="Usuaria"
                          column="user"
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={toggleSort}
                          className="mov-col-user"
                        />
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((m) => {
                        const when = fmtDateCompact(m.created_at);
                        return (
                          <tr key={m.id}>
                            <td className="mov-col-date" title={when.full}>
                              <span className="mov-date-day">{when.day}</span>
                              <span className="mov-date-time muted">{when.time}</span>
                            </td>
                            <td className="mov-col-type">
                              <span className={typeBadgeClass(m.movement_type)}>{m.type_label}</span>
                            </td>
                            <td className="mov-col-product">
                              <span className="mov-product-name" title={m.product_name}>
                                {m.product_name}
                              </span>
                              <span className="mov-product-code muted">{m.internal_code}</span>
                            </td>
                            <td className="mov-col-reason">
                              <span className="mov-reason-text" title={m.reason_label}>
                                {m.reason_label}
                              </span>
                              {m.web_path ? (
                                <Link className="mov-origin-link" to={m.web_path}>
                                  {shortLinkLabel(m.link_label)} →
                                </Link>
                              ) : null}
                            </td>
                            <td className={`${deltaClass(m.quantity_delta)} mov-col-num`}>
                              {m.quantity_delta > 0 ? `+${m.quantity_delta}` : m.quantity_delta}
                            </td>
                            <td className="mov-col-num mov-after">{m.quantity_after}</td>
                            <td className="mov-col-user" title={m.created_by_name || undefined}>
                              {m.created_by_name || '—'}
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
                  itemCount={movements.length}
                />
              </>
            )}
          </div>
        </div>

        <aside className="ing-list-figure mov-list-figure" aria-hidden="true">
          <img className="ing-list-figure-img" src="/brand/movimientos-modelo.png" alt="" />
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
          <div
            className="pos-modal-panel ing-filters-sheet"
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={filtersTitleId}
          >
            <div className="pos-modal-head">
              <h3 id={filtersTitleId}>Filtros</h3>
              <button className="btn ghost" type="button" onClick={closeDrawer} aria-label="Cerrar">
                Cerrar
              </button>
            </div>

            <div className="ing-filters-sheet-body">
            <div className="ing-filter-fields">
              <div className="field">
                <label htmlFor="mov-f-from">Fecha desde</label>
                <input
                  id="mov-f-from"
                  type="date"
                  value={draftDateFrom}
                  onChange={(e) => setDraftDateFrom(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="mov-f-to">Fecha hasta</label>
                <input
                  id="mov-f-to"
                  type="date"
                  value={draftDateTo}
                  onChange={(e) => setDraftDateTo(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="mov-f-q">Buscar</label>
                <input
                  id="mov-f-q"
                  value={draftQ}
                  onChange={(e) => setDraftQ(e.target.value)}
                  placeholder="Producto, código, usuaria, doc…"
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
          </div>
        </div>
      )}
    </div>
  );
}
