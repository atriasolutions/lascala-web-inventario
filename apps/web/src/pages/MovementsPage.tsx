import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { InfiniteListFooter } from '../components/InfiniteListFooter';
import { IconChevronDown } from '../components/icons';
import { ModalOverlayClose } from '../components/ModalOverlayClose';
import { SortableTh } from '../components/SortableTh';
import { useInfiniteList } from '../hooks/useInfiniteList';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { loadListFilters, saveListFilters } from '../lib/listFiltersPersist';
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
  userId: string;
  userName: string;
  productId: string;
  productQ: string;
  productLabel: string;
  /** Búsqueda de documento / toma (p. ej. INV… desde Reportes). */
  q: string;
};

type ListFilters = AppliedFilters & { branchId: string };

const DEFAULT_FILTERS: AppliedFilters = {
  type: 'all',
  dateFrom: '',
  dateTo: '',
  userId: '',
  userName: '',
  productId: '',
  productQ: '',
  productLabel: '',
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
  { key: 'delta', label: 'Cambio' },
  { key: 'after', label: 'Stock' },
  { key: 'user', label: 'Usuario' },
];

function buildQuery(f: AppliedFilters, offset: number, limit: number) {
  const params = new URLSearchParams();
  if (f.type !== 'all') params.set('type', f.type);
  if (f.dateFrom) params.set('dateFrom', f.dateFrom);
  if (f.dateTo) params.set('dateTo', f.dateTo);
  if (f.userId) params.set('userId', f.userId);
  if (f.productId) params.set('productId', f.productId);
  else if (f.productQ.trim()) params.set('productQ', f.productQ.trim());
  if (f.q.trim()) params.set('q', f.q.trim());
  withPagination(params, offset, limit);
  return `/api/inventory/movements?${params.toString()}`;
}

function legacySearchSplit(q: string): Pick<AppliedFilters, 'q' | 'productQ' | 'productLabel'> {
  const t = q.trim();
  if (!t) return { q: '', productQ: '', productLabel: '' };
  if (/^(INV|V|VC)-/i.test(t)) return { q: t, productQ: '', productLabel: '' };
  return { q: '', productQ: t, productLabel: t };
}

type ProductHit = { id: string; name: string; internal_code: string };

function ProductFilterField({
  id,
  productId,
  text,
  onChange,
}: {
  id: string;
  productId: string;
  text: string;
  onChange: (next: { productId: string; text: string }) => void;
}) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [menuBox, setMenuBox] = useState<{ top: number; left: number; width: number } | null>(null);

  const updateMenuBox = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setMenuBox({
      top: r.bottom + 6,
      left: r.left,
      width: r.width,
    });
  }, []);

  useEffect(() => {
    const q = text.trim();
    if (!open || q.length < 1) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      setBusy(true);
      void api<{ products: ProductHit[] }>(`/api/products?q=${encodeURIComponent(q)}`)
        .then((data) => {
          if (!cancelled) setHits((data.products || []).slice(0, 8));
        })
        .catch(() => {
          if (!cancelled) setHits([]);
        })
        .finally(() => {
          if (!cancelled) setBusy(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [text, open]);

  useLayoutEffect(() => {
    if (!open || !text.trim()) {
      setMenuBox(null);
      return;
    }
    updateMenuBox();
    window.addEventListener('resize', updateMenuBox);
    window.addEventListener('scroll', updateMenuBox, true);
    return () => {
      window.removeEventListener('resize', updateMenuBox);
      window.removeEventListener('scroll', updateMenuBox, true);
    };
  }, [open, text, updateMenuBox]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function pick(p: ProductHit) {
    onChange({ productId: p.id, text: `${p.internal_code} · ${p.name}` });
    setOpen(false);
  }

  return (
    <div className="lookup" ref={wrapRef}>
      <div className="lookup-control">
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder="Código LS… o nombre"
          value={text}
          onChange={(e) => {
            onChange({ productId: '', text: e.target.value });
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        {text ? (
          <button
            type="button"
            className="lookup-clear"
            aria-label="Limpiar producto"
            onClick={() => {
              onChange({ productId: '', text: '' });
              setHits([]);
            }}
          >
            ×
          </button>
        ) : null}
      </div>
      {open && text.trim() && menuBox
        ? createPortal(
            <ul
              id={listId}
              ref={menuRef}
              className="lookup-menu is-overlay"
              role="listbox"
              style={{ top: menuBox.top, left: menuBox.left, width: menuBox.width }}
            >
              {busy && !hits.length ? <li className="lookup-empty muted">Buscando…</li> : null}
              {!busy && !hits.length ? (
                <li className="lookup-empty muted">Sin coincidencias. Puedes aplicar el texto igual.</li>
              ) : null}
              {hits.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`lookup-option${p.id === productId ? ' is-active' : ''}`}
                    onClick={() => pick(p)}
                  >
                    <strong>{p.name}</strong>
                    <span className="muted"> {p.internal_code}</span>
                  </button>
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
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
  const { branchId } = useAuth();
  const [searchParams] = useSearchParams();
  const urlQ = searchParams.get('q')?.trim() || '';
  const urlType = searchParams.get('type')?.trim() || '';
  const urlProductId = searchParams.get('productId')?.trim() || '';
  const urlProductLabel = searchParams.get('productLabel')?.trim() || '';
  const [filters, setFilters] = useState<AppliedFilters>(() =>
    loadListFilters('movimientos', branchId, DEFAULT_FILTERS),
  );

  const [sortKey, setSortKey] = useState<MovementSortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draftDateFrom, setDraftDateFrom] = useState('');
  const [draftDateTo, setDraftDateTo] = useState('');
  const [draftUserId, setDraftUserId] = useState('');
  const [draftProductId, setDraftProductId] = useState('');
  const [draftProductText, setDraftProductText] = useState('');
  const [branchUsers, setBranchUsers] = useState<{ id: string; full_name: string }[]>([]);
  const filtersTitleId = useId();
  const modalRef = useRef<HTMLDivElement>(null);

  const listFilters: ListFilters = useMemo(
    () => ({ ...filters, branchId: branchId || '' }),
    [filters, branchId],
  );

  useEffect(() => {
    const persisted = loadListFilters('movimientos', branchId, DEFAULT_FILTERS);
    const fromLegacy = !persisted.productQ && !persisted.userId && persisted.q && !urlQ
      ? legacySearchSplit(persisted.q)
      : null;
    setFilters({
      ...DEFAULT_FILTERS,
      ...persisted,
      userId: persisted.userId || '',
      userName: persisted.userName || '',
      productId: urlProductId || persisted.productId || '',
      productQ: fromLegacy?.productQ || persisted.productQ || '',
      productLabel:
        urlProductLabel || fromLegacy?.productLabel || persisted.productLabel || '',
      q: urlQ || fromLegacy?.q || persisted.q || '',
      ...(urlType ? { type: urlType } : {}),
    });
  }, [branchId, urlQ, urlType, urlProductId, urlProductLabel]);

  useEffect(() => {
    saveListFilters('movimientos', branchId, filters);
  }, [branchId, filters]);

  const fetchPage = useCallback(async (f: ListFilters, offset: number, limit: number) => {
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
    filters: listFilters,
    fetchPage,
  });

  const [showMoreHint, setShowMoreHint] = useState(false);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    const updateHint = () => {
      const el = scrollRef.current;
      if (!el || !hasMore) {
        setShowMoreHint(false);
        return;
      }
      const canScroll = el.scrollHeight > el.clientHeight + 12;
      const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 56;
      setShowMoreHint(canScroll && !nearBottom);
    };

    updateHint();
    node.addEventListener('scroll', updateHint, { passive: true });
    const ro = new ResizeObserver(updateHint);
    ro.observe(node);
    return () => {
      node.removeEventListener('scroll', updateHint);
      ro.disconnect();
    };
  }, [hasMore, movements.length, loading, loadingMore, scrollRef]);

  const sorted = useMemo(
    () => sortMovements(movements, sortKey, sortDir),
    [movements, sortKey, sortDir],
  );

  const hasExtraFilters = Boolean(
    filters.dateFrom ||
      filters.dateTo ||
      filters.userId ||
      filters.productId ||
      filters.productQ.trim() ||
      filters.q.trim(),
  );

  const summaryChips = useMemo(() => {
    const chips: { key: string; label: string }[] = [];
    if (filters.dateFrom) chips.push({ key: 'from', label: `Desde ${fmtDay(filters.dateFrom)}` });
    if (filters.dateTo) chips.push({ key: 'to', label: `Hasta ${fmtDay(filters.dateTo)}` });
    if (filters.userId) {
      chips.push({ key: 'user', label: `Usuario: ${filters.userName || 'elegido'}` });
    }
    if (filters.productId || filters.productQ.trim()) {
      chips.push({
        key: 'product',
        label: `Producto: ${filters.productLabel || filters.productQ.trim()}`,
      });
    }
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
    setDraftUserId(filters.userId);
    setDraftProductId(filters.productId);
    setDraftProductText(filters.productLabel || filters.productQ);
    setDrawerOpen(true);
    void api<{ users: { id: string; full_name: string }[] }>('/api/inventory/movements/users')
      .then((data) => setBranchUsers(data.users || []))
      .catch(() => setBranchUsers([]));
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  function applyDrawer() {
    const user = branchUsers.find((u) => u.id === draftUserId);
    const productText = draftProductText.trim();
    setFilters((prev) => ({
      ...prev,
      dateFrom: draftDateFrom,
      dateTo: draftDateTo,
      userId: draftUserId,
      userName: user?.full_name || (draftUserId ? prev.userName : ''),
      productId: draftProductId,
      productQ: draftProductId ? '' : productText,
      productLabel: productText,
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

          <div className="mov-scroll-host">
            <div className="ing-list-scroll" ref={scrollRef}>
            {loading && (
              <div className="ing-skel" aria-busy="true" aria-label="Cargando movimientos">
                <div className="ing-skel-row" />
                <div className="ing-skel-row" />
                <div className="ing-skel-row" />
              </div>
            )}

            {!loading && !movements.length && (
              <div className="sales-empty">
                <h3>Sin movimientos</h3>
                <p className="muted">Ventas, ingresos y ajustes dejan la trazabilidad acá.</p>
                <Link to="/inventario" className="btn secondary" style={{ marginTop: '0.75rem' }}>
                  Ir a Stock
                </Link>
              </div>
            )}

            {!loading && movements.length > 0 && (
              <>
                <p className="mov-status muted">
                  {sorted.length} movimiento{sorted.length === 1 ? '' : 's'}
                </p>

                <div className="list-cards mobile-only mov-cards">
                  {sorted.map((m) => (
                    <article key={m.id} className="list-card mov-card">
                      <div className="mov-card-head">
                        <span className={typeBadgeClass(m.movement_type)}>{m.type_label}</span>
                        <span className="mov-card-when muted">{fmtDate(m.created_at)}</span>
                      </div>
                      <strong className="mov-card-product">{m.product_name}</strong>
                      <div className="meta">
                        {m.internal_code}
                        {m.created_by_name ? (
                          <span className="muted"> · {m.created_by_name}</span>
                        ) : null}
                      </div>
                      <p className="mov-reason" title={m.reason_label}>
                        {m.reason_label}
                      </p>
                      <div className="mov-card-foot">
                        <strong className={deltaClass(m.quantity_delta)}>
                          {m.quantity_delta > 0 ? `+${m.quantity_delta}` : m.quantity_delta}
                        </strong>
                        <span className="mov-card-stock muted">queda {m.quantity_after}</span>
                        {m.web_path ? (
                          <Link className="mov-origin-link" to={m.web_path}>
                            {m.link_label || 'Ver origen'} →
                          </Link>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>

                <div className="table-wrap desktop-only mov-table-wrap">
                  <table className="table mov-table">
                    <colgroup>
                      <col className="mov-col-date" />
                      <col className="mov-col-type" />
                      <col className="mov-col-product" />
                      <col className="mov-col-reason" />
                      <col className="mov-col-num" />
                      <col className="mov-col-num" />
                      <col className="mov-col-user" />
                    </colgroup>
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
                          label="Cambio"
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
                          label="Usuario"
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
                              <div className="mov-date-stack">
                                <span className="mov-date-day">{when.day}</span>
                                <span className="mov-date-time muted">{when.time}</span>
                              </div>
                            </td>
                            <td className="mov-col-type">
                              <span className={typeBadgeClass(m.movement_type)}>{m.type_label}</span>
                            </td>
                            <td className="mov-col-product">
                              <div className="mov-product-stack">
                                <span className="mov-product-name" title={m.product_name}>
                                  {m.product_name}
                                </span>
                                <span className="mov-product-code muted">{m.internal_code}</span>
                              </div>
                            </td>
                            <td className="mov-col-reason">
                              <div className="mov-reason-stack">
                                <span className="mov-reason-text" title={m.reason_label}>
                                  {m.reason_label}
                                </span>
                                {m.web_path ? (
                                  <Link className="mov-origin-link" to={m.web_path}>
                                    {shortLinkLabel(m.link_label)} →
                                  </Link>
                                ) : null}
                              </div>
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
            {showMoreHint ? (
              <div className="mov-scroll-hint" aria-hidden="true">
                <span className="mov-scroll-hint-fade" />
                <span className="mov-scroll-hint-chevron">
                  <IconChevronDown size={20} />
                </span>
              </div>
            ) : null}
          </div>
        </div>
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
                <label htmlFor="mov-f-user">Usuario</label>
                <select
                  id="mov-f-user"
                  value={draftUserId}
                  onChange={(e) => setDraftUserId(e.target.value)}
                >
                  <option value="">Todas</option>
                  {draftUserId && !branchUsers.some((u) => u.id === draftUserId) && filters.userName ? (
                    <option value={draftUserId}>{filters.userName}</option>
                  ) : null}
                  {branchUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="mov-f-product">Producto</label>
                <ProductFilterField
                  id="mov-f-product"
                  productId={draftProductId}
                  text={draftProductText}
                  onChange={(next) => {
                    setDraftProductId(next.productId);
                    setDraftProductText(next.text);
                  }}
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
        </div>
      )}
    </div>
  );
}
