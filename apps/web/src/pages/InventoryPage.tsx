import {
  type FormEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { InfiniteListFooter } from '../components/InfiniteListFooter';
import { ProductPhotoPlaceholder } from '../components/ProductPhotoPlaceholder';
import { SortableTh } from '../components/SortableTh';
import { useInfiniteList } from '../hooks/useInfiniteList';
import { api, mediaUrl, money } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  nextInventorySort,
  sortBalances,
  type InventorySortKey,
  type SortDir,
} from '../lib/inventoryListSort';
import { withPagination } from '../lib/pagination';
import { toast } from '../lib/toast';

type Balance = {
  id: string;
  product_id: string;
  name: string;
  internal_code: string;
  barcode: string | null;
  brand: string | null;
  size_label: string | null;
  quantity: number | string;
  low_stock_threshold: number | string;
  sale_price: string;
  photo_url: string | null;
  has_photo?: boolean;
  tracks_stock?: boolean;
  category_id?: string | null;
  category_name?: string | null;
};

type Category = { id: string; name: string };
type AdjustMode = 'absolute' | 'delta';
type PhotoFilter = '' | '1' | '0';
type TracksFilter = '' | '1' | '0';
type StockPresence = '' | 'in' | 'zero';

type Filters = {
  categoryId: string;
  onlyLow: boolean;
  photo: PhotoFilter;
  tracksStock: TracksFilter;
  stockPresence: StockPresence;
};

type ListFilters = Filters & { q: string };

type InvSummary = {
  count: number;
  totalUnits: number;
  totalValue: number;
  lowCount: number;
};

const DEFAULT_FILTERS: Filters = {
  categoryId: '',
  onlyLow: false,
  photo: '',
  tracksStock: '',
  stockPresence: '',
};

const SORT_OPTIONS: { key: InventorySortKey; label: string }[] = [
  { key: 'name', label: 'Nombre' },
  { key: 'code', label: 'Código' },
  { key: 'stock', label: 'Stock' },
  { key: 'sale', label: 'P. venta' },
  { key: 'value', label: 'Valor en sala' },
];

function qtyOf(b: Balance) {
  return Number(b.quantity) || 0;
}

function thresholdOf(b: Balance) {
  const t = Number(b.low_stock_threshold);
  return Number.isFinite(t) ? t : 1;
}

function isLow(b: Balance) {
  return qtyOf(b) <= thresholdOf(b);
}

function buildBalancesQuery(f: ListFilters, offset: number, limit: number) {
  const params = new URLSearchParams();
  if (f.q.trim()) params.set('q', f.q.trim());
  if (f.categoryId) params.set('categoryId', f.categoryId);
  if (f.onlyLow) params.set('onlyLow', '1');
  if (f.photo) params.set('photo', f.photo);
  if (f.tracksStock) params.set('tracksStock', f.tracksStock);
  if (f.stockPresence) params.set('stockPresence', f.stockPresence);
  withPagination(params, offset, limit);
  return `/api/inventory/balances?${params.toString()}`;
}

export function InventoryPage() {
  const { branches, branchId } = useAuth();
  const [searchParams] = useSearchParams();
  const branchName = branches.find((b) => b.id === branchId)?.name || 'sucursal activa';

  const [categories, setCategories] = useState<Category[]>([]);
  const [q, setQ] = useState(() => searchParams.get('q') || '');
  const [qDebounced, setQDebounced] = useState(q);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sortKey, setSortKey] = useState<InventorySortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [summary, setSummary] = useState<InvSummary>({
    count: 0,
    totalUnits: 0,
    totalValue: 0,
    lowCount: 0,
  });

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState<Filters>(DEFAULT_FILTERS);
  const filtersTitleId = useId();

  const [adjusting, setAdjusting] = useState<Balance | null>(null);
  const [adjustMode, setAdjustMode] = useState<AdjustMode>('absolute');
  const [newQty, setNewQty] = useState('');
  const [deltaQty, setDeltaQty] = useState('');
  const [reason, setReason] = useState('');
  const [adjustBusy, setAdjustBusy] = useState(false);
  const [adjustError, setAdjustError] = useState('');

  const modalTitleId = useId();
  const qtyRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setQDebounced(q), 320);
    return () => window.clearTimeout(t);
  }, [q]);

  const listFilters = useMemo(
    () => ({ ...filters, q: qDebounced, branchId: branchId || '' }),
    [filters, qDebounced, branchId],
  );

  const fetchPage = useCallback(async (f: ListFilters & { branchId: string }, offset: number, limit: number) => {
    const data = await api<{
      balances: Balance[];
      hasMore: boolean;
      nextOffset?: number;
      summary?: InvSummary;
    }>(buildBalancesQuery(f, offset, limit));
    if (offset === 0 && data.summary) {
      setSummary(data.summary);
    }
    return {
      items: data.balances,
      hasMore: data.hasMore,
      nextOffset: data.nextOffset,
    };
  }, []);

  const {
    items: balances,
    hasMore,
    loading,
    loadingMore,
    error,
    scrollRef,
    sentinelRef,
    reload,
  } = useInfiniteList({
    filters: listFilters,
    fetchPage,
    enabled: Boolean(branchId),
  });

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  useEffect(() => {
    void api<{ categories: Category[] }>('/api/catalog/categories')
      .then((c) => setCategories(c.categories))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!filtersOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFiltersOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [filtersOpen]);

  const sorted = useMemo(
    () => sortBalances(balances, sortKey, sortDir),
    [balances, sortKey, sortDir],
  );

  const totalUnits = summary.totalUnits;
  const totalValue = summary.totalValue;
  const lowCount = summary.lowCount;

  const sheetFilterCount = useMemo(() => {
    let n = 0;
    if (filters.categoryId) n += 1;
    if (filters.onlyLow) n += 1;
    if (filters.photo) n += 1;
    if (filters.tracksStock) n += 1;
    if (filters.stockPresence) n += 1;
    return n;
  }, [filters]);

  const filtersActive = sheetFilterCount > 0 || Boolean(q.trim());

  const filterSummary = useMemo(() => {
    const chips: { key: string; label: string }[] = [];
    if (filters.categoryId) {
      const name = categories.find((c) => c.id === filters.categoryId)?.name || 'Categoría';
      chips.push({ key: 'cat', label: name });
    }
    if (filters.onlyLow) chips.push({ key: 'low', label: 'Stock bajo' });
    if (filters.photo === '0') chips.push({ key: 'nophoto', label: 'Sin foto' });
    if (filters.photo === '1') chips.push({ key: 'photo', label: 'Con foto' });
    if (filters.tracksStock === '1') chips.push({ key: 'tracks', label: 'Con control stock' });
    if (filters.tracksStock === '0') chips.push({ key: 'notracks', label: 'Sin control stock' });
    if (filters.stockPresence === 'in') chips.push({ key: 'in', label: 'Con stock' });
    if (filters.stockPresence === 'zero') chips.push({ key: 'zero', label: 'Stock en cero' });
    return chips;
  }, [filters, categories]);

  function toggleSort(column: InventorySortKey) {
    const next = nextInventorySort(sortKey, sortDir, column);
    setSortKey(next.key);
    setSortDir(next.dir);
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
    setQ('');
    setQDebounced('');
    setDraft(DEFAULT_FILTERS);
  }

  function openFiltersSheet() {
    setDraft(filters);
    setFiltersOpen(true);
  }

  function applyFiltersSheet() {
    setFilters(draft);
    setFiltersOpen(false);
  }

  function clearSheetDraftAndApply() {
    setDraft(DEFAULT_FILTERS);
    setFilters(DEFAULT_FILTERS);
    setFiltersOpen(false);
  }

  function patchFilters(partial: Partial<Filters>) {
    setFilters((prev) => ({ ...prev, ...partial }));
  }

  function openAdjust(b: Balance, trigger?: HTMLElement | null) {
    triggerRef.current = trigger ?? null;
    setAdjusting(b);
    setAdjustMode('absolute');
    setNewQty(String(qtyOf(b)));
    setDeltaQty('');
    setReason('');
    setAdjustError('');
    setAdjustBusy(false);
  }

  function closeAdjust() {
    setAdjusting(null);
    setAdjustError('');
    setAdjustBusy(false);
    const el = triggerRef.current;
    triggerRef.current = null;
    window.setTimeout(() => el?.focus(), 40);
  }

  useEffect(() => {
    if (!adjusting) return;
    const t = window.setTimeout(() => qtyRef.current?.focus(), 40);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !adjustBusy) closeAdjust();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focus al abrir
  }, [adjusting?.id, adjustBusy]);

  const previewAfter = useMemo(() => {
    if (!adjusting) return null;
    const current = qtyOf(adjusting);
    if (adjustMode === 'absolute') {
      const n = Number(newQty);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null;
      return n;
    }
    const d = Number(deltaQty);
    if (!Number.isFinite(d) || !Number.isInteger(d) || d === 0) return null;
    return current + d;
  }, [adjusting, adjustMode, newQty, deltaQty]);

  async function submitAdjust(e: FormEvent) {
    e.preventDefault();
    if (!adjusting) return;
    const notes = reason.trim();
    if (!notes) {
      setAdjustError('El motivo es obligatorio');
      return;
    }
    const body: Record<string, unknown> = {
      productId: adjusting.product_id,
      notes,
    };
    if (adjustMode === 'absolute') {
      const n = Number(newQty);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        setAdjustError('Ingresa una cantidad entera válida (≥ 0)');
        return;
      }
      if (n === qtyOf(adjusting)) {
        setAdjustError('La cantidad nueva es igual al stock actual');
        return;
      }
      body.newQuantity = n;
    } else {
      const d = Number(deltaQty);
      if (!Number.isFinite(d) || !Number.isInteger(d) || d === 0) {
        setAdjustError('Ingresa un ajuste entero distinto de cero (ej. -1 o +2)');
        return;
      }
      if (qtyOf(adjusting) + d < 0) {
        setAdjustError('El stock no puede quedar negativo');
        return;
      }
      body.delta = d;
    }

    setAdjustBusy(true);
    setAdjustError('');
    try {
      const res = await api<{
        adjustment: { quantityAfter: number; quantityDelta: number; productName: string };
      }>('/api/inventory/adjust', { method: 'POST', body });
      const delta = res.adjustment.quantityDelta;
      const sign = delta > 0 ? '+' : '';
      toast.success(
        `Stock ajustado · ${res.adjustment.productName}: ${sign}${delta} → ${res.adjustment.quantityAfter} un.`,
      );
      closeAdjust();
      reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo ajustar';
      setAdjustError(msg);
      toast.error(msg);
      setAdjustBusy(false);
    }
  }

  return (
    <div className="ing-list inv-list">
      <div className="ing-list-workspace">
        <div className="ing-list-main">
          <div className="section-title inv-topbar">
            <div className="page-intro" style={{ marginBottom: 0 }}>
              <p>
                Stock en <strong>{branchName}</strong>
                <span className="inv-intro-extra"> · valor a precio de venta</span>
              </p>
            </div>
            <Link className="btn secondary inv-mov-btn" to="/movimientos">
              Movimientos
            </Link>
          </div>

          <div className="inv-stats" aria-label="Resumen de inventario">
            <div className="inv-stat">
              <span className="inv-stat-label">Unidades</span>
              <strong className="inv-stat-value">{totalUnits}</strong>
              <span className="inv-stat-meta">{summary.count} referencias</span>
            </div>
            <div className="inv-stat">
              <span className="inv-stat-label">Valor</span>
              <strong className="inv-stat-value">{money(totalValue)}</strong>
              <span className="inv-stat-meta">A precio de venta</span>
            </div>
            <button
              type="button"
              className={`inv-stat inv-stat-alert${filters.onlyLow ? ' is-active' : ''}`}
              aria-pressed={filters.onlyLow}
              onClick={() => patchFilters({ onlyLow: !filters.onlyLow })}
              title="Filtrar stock bajo"
            >
              <span className="inv-stat-label">Stock bajo</span>
              <strong className="inv-stat-value">{lowCount}</strong>
              <span className="inv-stat-meta">
                {filters.onlyLow ? 'Filtro activo' : 'Toca para filtrar'}
              </span>
            </button>
          </div>

          <div className="inv-toolbar" role="toolbar" aria-label="Buscar inventario">
            <div className="field inv-search">
              <label className="sr-only" htmlFor="inv-search">
                Buscar
              </label>
              <input
                id="inv-search"
                type="search"
                placeholder="Nombre o código…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="inv-toolbar-actions">
              <button
                type="button"
                className={`btn secondary inv-filters-btn${sheetFilterCount > 0 ? ' has-count' : ''}`}
                onClick={openFiltersSheet}
                aria-expanded={filtersOpen}
                aria-controls="inv-filters-sheet"
              >
                Filtros
                {sheetFilterCount > 0 ? (
                  <span className="prod-filters-badge" aria-label={`${sheetFilterCount} filtros activos`}>
                    {sheetFilterCount}
                  </span>
                ) : null}
              </button>
              <div className="field inv-sort-select mobile-only">
                <label className="sr-only" htmlFor="inv-sort">
                  Ordenar
                </label>
                <select
                  id="inv-sort"
                  aria-label="Ordenar por"
                  value={`${sortKey}:${sortDir}`}
                  onChange={(e) => {
                    const [key, dir] = e.target.value.split(':') as [InventorySortKey, SortDir];
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
          </div>

          <div className="inv-filters inv-filters-desktop" role="toolbar" aria-label="Filtros rápidos">
            <div className="field inv-cat-select">
              <label className="sr-only" htmlFor="inv-filter-cat">
                Categoría
              </label>
              <select
                id="inv-filter-cat"
                aria-label="Categoría"
                value={filters.categoryId}
                onChange={(e) => patchFilters({ categoryId: e.target.value })}
              >
                <option value="">Todas las categorías</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className={`prod-chip${filters.onlyLow ? ' is-active' : ''}`}
              aria-pressed={filters.onlyLow}
              onClick={() => patchFilters({ onlyLow: !filters.onlyLow })}
            >
              Stock bajo
            </button>
            <button
              type="button"
              className={`prod-chip${filters.photo === '0' ? ' is-active' : ''}`}
              aria-pressed={filters.photo === '0'}
              onClick={() => patchFilters({ photo: filters.photo === '0' ? '' : '0' })}
            >
              Sin foto
            </button>
            <button
              type="button"
              className={`prod-chip${filters.photo === '1' ? ' is-active' : ''}`}
              aria-pressed={filters.photo === '1'}
              onClick={() => patchFilters({ photo: filters.photo === '1' ? '' : '1' })}
            >
              Con foto
            </button>
            <button
              type="button"
              className={`prod-chip${filters.stockPresence === 'in' ? ' is-active' : ''}`}
              aria-pressed={filters.stockPresence === 'in'}
              onClick={() =>
                patchFilters({
                  stockPresence: filters.stockPresence === 'in' ? '' : 'in',
                })
              }
            >
              Con stock
            </button>
            <button
              type="button"
              className={`prod-chip${filters.stockPresence === 'zero' ? ' is-active' : ''}`}
              aria-pressed={filters.stockPresence === 'zero'}
              onClick={() =>
                patchFilters({
                  stockPresence: filters.stockPresence === 'zero' ? '' : 'zero',
                })
              }
            >
              Stock en cero
            </button>
            <button
              type="button"
              className={`prod-chip${filters.tracksStock === '1' ? ' is-active' : ''}`}
              aria-pressed={filters.tracksStock === '1'}
              onClick={() =>
                patchFilters({ tracksStock: filters.tracksStock === '1' ? '' : '1' })
              }
            >
              Con control stock
            </button>
            <button
              type="button"
              className={`prod-chip${filters.tracksStock === '0' ? ' is-active' : ''}`}
              aria-pressed={filters.tracksStock === '0'}
              onClick={() =>
                patchFilters({ tracksStock: filters.tracksStock === '0' ? '' : '0' })
              }
            >
              Sin control stock
            </button>
          </div>

          {sheetFilterCount > 0 && (
            <div className="inv-filter-summary" aria-label="Filtros activos">
              {filterSummary.map((c) => (
                <span key={c.key} className="prod-chip is-active prod-chip-static">
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
              <div className="inv-skel" aria-busy="true" aria-label="Cargando inventario">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="inv-skel-row" aria-hidden />
                ))}
              </div>
            )}

            {!loading && !balances.length && !filtersActive && (
              <div className="inv-empty">
                <div className="inv-empty-visual" aria-hidden />
                <h3>Sin stock en esta sucursal</h3>
                <p>Cuando recibas mercadería en Ingresos, el stock aparece acá.</p>
                <Link to="/ingresos" className="btn secondary">
                  Ir a Ingresos
                </Link>
              </div>
            )}

            {!loading && !balances.length && filtersActive && (
              <div className="inv-empty inv-empty-filter">
                <h3>Ninguna prenda coincide</h3>
                <p>Prueba otra búsqueda o ajusta los filtros.</p>
                <button type="button" className="btn secondary" onClick={clearFilters}>
                  Limpiar filtros
                </button>
              </div>
            )}

            {!loading && sorted.length > 0 && (
              <>
                <p className="inv-status muted">
                  {summary.count} prenda{summary.count === 1 ? '' : 's'}
                  {filters.onlyLow ? ' · stock bajo' : ''}
                  {hasMore ? ` · mostrando ${balances.length}` : ''}
                </p>

                <div className="list-cards mobile-only inv-cards">
                  {sorted.map((b) => {
                    const low = isLow(b);
                    const qty = qtyOf(b);
                    const out = qty === 0;
                    const src = mediaUrl(b.photo_url);
                    const lineValue = qty * Number(b.sale_price || 0);
                    return (
                      <article key={b.id} className={`list-card inv-card${low ? ' is-low' : ''}`}>
                        <div className="inv-card-media" aria-hidden>
                          {src ? (
                            <img src={src} alt="" />
                          ) : (
                            <ProductPhotoPlaceholder className="inv-card-ph" />
                          )}
                        </div>
                        <div className="inv-card-body">
                          <div className="row">
                            <strong>{b.name}</strong>
                            <span className={`badge ${out ? 'danger' : low ? 'warning' : 'success'}`}>
                              {out ? 'Sin stock' : `${qty} un.`}
                            </span>
                          </div>
                          <div className="meta">
                            {b.internal_code}
                            {b.category_name ? ` · ${b.category_name}` : ''}
                            {b.brand ? ` · ${b.brand}` : ''}
                            {b.size_label ? ` · ${b.size_label}` : ''}
                          </div>
                          <div className="inv-card-foot">
                            <span>{money(b.sale_price)}</span>
                            <span className="muted">{money(lineValue)} en sala</span>
                          </div>
                          <div className="inv-card-actions">
                            <button
                              type="button"
                              className="btn secondary inv-adjust-btn"
                              onClick={(e) => openAdjust(b, e.currentTarget)}
                            >
                              Ajustar
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <div className="table-wrap desktop-only">
                  <table className="table inv-table">
                    <thead>
                      <tr>
                        <SortableTh
                          label="Prenda"
                          column="name"
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={toggleSort}
                        />
                        <SortableTh
                          label="Código"
                          column="code"
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={toggleSort}
                          className="inv-th-code"
                        />
                        <SortableTh
                          label="Stock"
                          column="stock"
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={toggleSort}
                        />
                        <SortableTh
                          label="P. venta"
                          column="sale"
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={toggleSort}
                        />
                        <SortableTh
                          label="Valor en sala"
                          column="value"
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={toggleSort}
                        />
                        <th className="inv-actions-col">
                          <span className="sr-only">Acciones</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((b) => {
                        const low = isLow(b);
                        const qty = qtyOf(b);
                        const out = qty === 0;
                        const src = mediaUrl(b.photo_url);
                        const lineValue = qty * Number(b.sale_price || 0);
                        return (
                          <tr key={b.id} className={low ? 'inv-row-low' : undefined}>
                            <td>
                              <div className="inv-row-product">
                                <div className="inv-row-thumb" aria-hidden>
                                  {src ? (
                                    <img src={src} alt="" />
                                  ) : (
                                    <ProductPhotoPlaceholder />
                                  )}
                                </div>
                                <div>
                                  <strong>{b.name}</strong>
                                  <div className="muted">
                                    {b.category_name || 'Sin categoría'}
                                    {b.brand ? ` · ${b.brand}` : ''}
                                    {b.size_label ? ` · ${b.size_label}` : ''}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="inv-code">{b.internal_code}</td>
                            <td>
                              <span
                                className={`badge ${out ? 'danger' : low ? 'warning' : 'success'}`}
                              >
                                {out ? '0 un.' : `${qty} un.`}
                              </span>
                            </td>
                            <td className="inv-num">{money(b.sale_price)}</td>
                            <td className="inv-num">{money(lineValue)}</td>
                            <td className="inv-actions-col">
                              <button
                                type="button"
                                className="btn secondary inv-adjust-btn"
                                onClick={(e) => openAdjust(b, e.currentTarget)}
                              >
                                Ajustar
                              </button>
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
                  itemCount={balances.length}
                />
              </>
            )}
          </div>
        </div>

        <aside className="ing-list-figure" aria-hidden="true">
          <img
            className="ing-list-figure-img"
            src="/brand/inventario-modelo.png"
            alt=""
          />
        </aside>
      </div>

      {filtersOpen && (
        <div
          className="pos-modal open"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setFiltersOpen(false);
          }}
        >
          <div
            id="inv-filters-sheet"
            className="pos-modal-panel prod-filters-sheet inv-filters-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={filtersTitleId}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pos-modal-head">
              <h3 id={filtersTitleId}>Filtros</h3>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setFiltersOpen(false)}
                aria-label="Cerrar"
              >
                Cerrar
              </button>
            </div>

            <div className="prod-filter-fields">
              <div className="field">
                <label htmlFor="inv-sheet-cat">Categoría</label>
                <select
                  id="inv-sheet-cat"
                  value={draft.categoryId}
                  onChange={(e) => setDraft((d) => ({ ...d, categoryId: e.target.value }))}
                >
                  <option value="">Todas las categorías</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="prod-filter-group">
                <p className="prod-filter-group-label">Disponibilidad</p>
                <div className="prod-toggle-row">
                  <button
                    type="button"
                    className={`prod-chip${draft.onlyLow ? ' is-active' : ''}`}
                    aria-pressed={draft.onlyLow}
                    onClick={() => setDraft((d) => ({ ...d, onlyLow: !d.onlyLow }))}
                  >
                    Stock bajo
                  </button>
                  <button
                    type="button"
                    className={`prod-chip${draft.stockPresence === 'in' ? ' is-active' : ''}`}
                    aria-pressed={draft.stockPresence === 'in'}
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        stockPresence: d.stockPresence === 'in' ? '' : 'in',
                      }))
                    }
                  >
                    Con stock
                  </button>
                  <button
                    type="button"
                    className={`prod-chip${draft.stockPresence === 'zero' ? ' is-active' : ''}`}
                    aria-pressed={draft.stockPresence === 'zero'}
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        stockPresence: d.stockPresence === 'zero' ? '' : 'zero',
                      }))
                    }
                  >
                    Stock en cero
                  </button>
                </div>
              </div>

              <div className="prod-filter-group">
                <p className="prod-filter-group-label">Foto</p>
                <div className="prod-yn-opts prod-yn-opts-wide" role="group" aria-label="Filtro foto">
                  <button
                    type="button"
                    className={`prod-yn-btn${draft.photo === '' ? ' is-active' : ''}`}
                    aria-pressed={draft.photo === ''}
                    onClick={() => setDraft((d) => ({ ...d, photo: '' }))}
                  >
                    Todas
                  </button>
                  <button
                    type="button"
                    className={`prod-yn-btn${draft.photo === '1' ? ' is-active' : ''}`}
                    aria-pressed={draft.photo === '1'}
                    onClick={() => setDraft((d) => ({ ...d, photo: '1' }))}
                  >
                    Con foto
                  </button>
                  <button
                    type="button"
                    className={`prod-yn-btn${draft.photo === '0' ? ' is-active' : ''}`}
                    aria-pressed={draft.photo === '0'}
                    onClick={() => setDraft((d) => ({ ...d, photo: '0' }))}
                  >
                    Sin foto
                  </button>
                </div>
              </div>

              <div className="prod-filter-group">
                <p className="prod-filter-group-label">Control de stock</p>
                <div
                  className="prod-yn-opts prod-yn-opts-wide"
                  role="group"
                  aria-label="Filtro control stock"
                >
                  <button
                    type="button"
                    className={`prod-yn-btn${draft.tracksStock === '' ? ' is-active' : ''}`}
                    aria-pressed={draft.tracksStock === ''}
                    onClick={() => setDraft((d) => ({ ...d, tracksStock: '' }))}
                  >
                    Todas
                  </button>
                  <button
                    type="button"
                    className={`prod-yn-btn${draft.tracksStock === '1' ? ' is-active' : ''}`}
                    aria-pressed={draft.tracksStock === '1'}
                    onClick={() => setDraft((d) => ({ ...d, tracksStock: '1' }))}
                  >
                    Con control
                  </button>
                  <button
                    type="button"
                    className={`prod-yn-btn${draft.tracksStock === '0' ? ' is-active' : ''}`}
                    aria-pressed={draft.tracksStock === '0'}
                    onClick={() => setDraft((d) => ({ ...d, tracksStock: '0' }))}
                  >
                    Sin control
                  </button>
                </div>
              </div>
            </div>

            <div className="btn-row prod-filters-sheet-actions">
              <button type="button" className="btn secondary" onClick={clearSheetDraftAndApply}>
                Limpiar
              </button>
              <button type="button" className="btn" onClick={applyFiltersSheet}>
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {adjusting && (
        <div
          className="pos-modal open no-print"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !adjustBusy) closeAdjust();
          }}
        >
          <form
            className="pos-modal-panel inv-adjust-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={modalTitleId}
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitAdjust}
          >
            <div className="pos-modal-head">
              <h3 id={modalTitleId}>Ajustar stock</h3>
              <button
                type="button"
                className="btn ghost"
                onClick={closeAdjust}
                disabled={adjustBusy}
                aria-label="Cerrar"
              >
                Cerrar
              </button>
            </div>

            <p className="inv-adjust-product">
              <strong>{adjusting.name}</strong>
              <span className="muted">
                {adjusting.internal_code}
                {adjusting.size_label ? ` · ${adjusting.size_label}` : ''}
              </span>
            </p>

            <p className="inv-adjust-current">
              Stock actual: <strong>{qtyOf(adjusting)} un.</strong>
            </p>

            <div className="ing-mode-toggle inv-adjust-mode" role="group" aria-label="Modo de ajuste">
              <button
                type="button"
                className={adjustMode === 'absolute' ? 'is-active' : ''}
                aria-pressed={adjustMode === 'absolute'}
                disabled={adjustBusy}
                onClick={() => setAdjustMode('absolute')}
              >
                Nueva cantidad
              </button>
              <button
                type="button"
                className={adjustMode === 'delta' ? 'is-active' : ''}
                aria-pressed={adjustMode === 'delta'}
                disabled={adjustBusy}
                onClick={() => setAdjustMode('delta')}
              >
                Diferencia (±)
              </button>
            </div>

            {adjustMode === 'absolute' ? (
              <div className="field">
                <label htmlFor="inv-adjust-qty">Nueva cantidad</label>
                <input
                  id="inv-adjust-qty"
                  ref={qtyRef}
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  required
                  value={newQty}
                  disabled={adjustBusy}
                  onChange={(e) => setNewQty(e.target.value)}
                />
              </div>
            ) : (
              <div className="field">
                <label htmlFor="inv-adjust-delta">Ajuste (ej. -1 o 2)</label>
                <input
                  id="inv-adjust-delta"
                  ref={qtyRef}
                  type="number"
                  step={1}
                  inputMode="numeric"
                  required
                  value={deltaQty}
                  disabled={adjustBusy}
                  onChange={(e) => setDeltaQty(e.target.value)}
                  placeholder="0"
                />
              </div>
            )}

            {previewAfter != null && previewAfter !== qtyOf(adjusting) && (
              <p className="ing-hint">
                Quedará en <strong>{previewAfter} un.</strong>
                {previewAfter < 0 ? ' (inválido)' : ''}
              </p>
            )}

            <div className="field">
              <label htmlFor="inv-adjust-reason">Motivo</label>
              <textarea
                id="inv-adjust-reason"
                rows={3}
                required
                value={reason}
                disabled={adjustBusy}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej. Conteo físico, corrección de ingreso…"
              />
            </div>

            {adjustError && <p className="error">{adjustError}</p>}

            <div className="btn-row inv-adjust-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={closeAdjust}
                disabled={adjustBusy}
              >
                Cancelar
              </button>
              <button type="submit" className="btn" disabled={adjustBusy}>
                {adjustBusy ? 'Guardando…' : 'Confirmar ajuste'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
