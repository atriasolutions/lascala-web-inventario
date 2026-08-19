import {
  type FormEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { InfiniteListFooter } from '../components/InfiniteListFooter';
import { SortableTh } from '../components/SortableTh';
import { useInfiniteList } from '../hooks/useInfiniteList';
import { api, money } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  nextExpenseSort,
  sortExpenses,
  type ExpenseSortKey,
  type SortDir,
} from '../lib/expensesListSort';
import { loadListFilters, saveListFilters } from '../lib/listFiltersPersist';
import { withPagination } from '../lib/pagination';
import { toast } from '../lib/toast';

/** Categorías del diagnóstico ATR-DIAG-001 §8.6 */
const CATEGORIES = [
  'Remuneraciones',
  'Arriendo',
  'Viajes',
  'Alimentación',
  'Servicios básicos',
  'Otros',
] as const;

type CategoryFilter = 'all' | (typeof CATEGORIES)[number];

type Expense = {
  id: string;
  category: string;
  description: string;
  amount: string | number;
  incurred_on: string;
  created_by_name: string | null;
  created_at: string;
};

type Filters = {
  category: CategoryFilter;
  dateFrom: string;
  dateTo: string;
  q: string;
};

type ListFilters = Filters & { branchId: string };

const DEFAULT_FILTERS: Filters = {
  category: 'all',
  dateFrom: '',
  dateTo: '',
  q: '',
};

const SORT_OPTIONS: { key: ExpenseSortKey; label: string }[] = [
  { key: 'date', label: 'Fecha' },
  { key: 'category', label: 'Categoría' },
  { key: 'description', label: 'Descripción' },
  { key: 'amount', label: 'Monto' },
  { key: 'user', label: 'Usuaria' },
];

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildQuery(f: Filters, offset: number, limit: number) {
  const params = new URLSearchParams();
  if (f.category !== 'all') params.set('category', f.category);
  if (f.dateFrom) params.set('dateFrom', f.dateFrom);
  if (f.dateTo) params.set('dateTo', f.dateTo);
  if (f.q.trim()) params.set('q', f.q.trim());
  withPagination(params, offset, limit);
  return `/api/ops/expenses?${params.toString()}`;
}

function fmtDay(d: string) {
  return new Date(d.length <= 10 ? `${d}T12:00:00` : d).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function categoryShort(cat: string) {
  if (cat === 'Servicios básicos') return 'Servicios';
  if (cat === 'Remuneraciones') return 'Remunerac.';
  return cat;
}

export function ExpensesPage() {
  const { branches, branchId } = useAuth();
  const activeBranch = branches.find((b) => b.id === branchId);
  const role = activeBranch?.role;
  const branchName = activeBranch?.name || 'sucursal activa';
  const canCreate = role === 'owner' || role === 'branch_manager';

  const [filters, setFilters] = useState<Filters>(() =>
    loadListFilters('gastos', branchId, DEFAULT_FILTERS),
  );
  const [sortKey, setSortKey] = useState<ExpenseSortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [summary, setSummary] = useState({
    count: 0,
    totalAmount: 0,
    monthTotal: 0,
    monthCount: 0,
  });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draftDateFrom, setDraftDateFrom] = useState('');
  const [draftDateTo, setDraftDateTo] = useState('');
  const [draftQ, setDraftQ] = useState('');
  const [draftCategory, setDraftCategory] = useState<CategoryFilter>('all');
  const filtersTitleId = useId();
  const modalRef = useRef<HTMLDivElement>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('Arriendo');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [incurredOn, setIncurredOn] = useState(todayISO);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formTitleId = useId();
  const formRef = useRef<HTMLDivElement>(null);

  const listFilters: ListFilters = useMemo(
    () => ({ ...filters, branchId: branchId || '' }),
    [filters, branchId],
  );

  useEffect(() => {
    setFilters(loadListFilters('gastos', branchId, DEFAULT_FILTERS));
  }, [branchId]);

  useEffect(() => {
    saveListFilters('gastos', branchId, filters);
  }, [branchId, filters]);

  const fetchPage = useCallback(async (f: ListFilters, offset: number, limit: number) => {
    const data = await api<{
      expenses: Expense[];
      hasMore: boolean;
      nextOffset?: number;
      summary?: {
        count: number;
        totalAmount: number;
        monthTotal: number;
        monthCount: number;
      };
    }>(buildQuery(f, offset, limit));
    if (offset === 0 && data.summary) setSummary(data.summary);
    return {
      items: data.expenses,
      hasMore: data.hasMore,
      nextOffset: data.nextOffset,
    };
  }, []);

  const {
    items: expenses,
    hasMore,
    loading,
    loadingMore,
    error,
    scrollRef,
    sentinelRef,
    reload,
  } = useInfiniteList({ filters: listFilters, fetchPage });

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const sorted = useMemo(
    () => sortExpenses(expenses, sortKey, sortDir),
    [expenses, sortKey, sortDir],
  );

  const hasExtraFilters = Boolean(
    filters.dateFrom || filters.dateTo || filters.q.trim() || filters.category !== 'all',
  );

  const summaryChips = useMemo(() => {
    const chips: { key: string; label: string }[] = [];
    if (filters.category !== 'all') chips.push({ key: 'cat', label: filters.category });
    if (filters.dateFrom) chips.push({ key: 'from', label: `Desde ${fmtDay(filters.dateFrom)}` });
    if (filters.dateTo) chips.push({ key: 'to', label: `Hasta ${fmtDay(filters.dateTo)}` });
    if (filters.q.trim()) chips.push({ key: 'q', label: filters.q.trim() });
    return chips;
  }, [filters]);

  function openDrawer() {
    setDraftDateFrom(filters.dateFrom);
    setDraftDateTo(filters.dateTo);
    setDraftQ(filters.q);
    setDraftCategory(filters.category);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  function applyDrawer() {
    setFilters({
      category: draftCategory,
      dateFrom: draftDateFrom,
      dateTo: draftDateTo,
      q: draftQ,
    });
    setDrawerOpen(false);
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  function setCategoryChip(cat: CategoryFilter) {
    setFilters((prev) => ({ ...prev, category: cat }));
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

  function openForm() {
    if (!canCreate) {
      toast.warn('Solo administración puede registrar gastos');
      return;
    }
    setCategory('Arriendo');
    setDescription('');
    setAmount('');
    setIncurredOn(todayISO());
    setFormOpen(true);
  }

  function closeForm() {
    if (saving) return;
    setFormOpen(false);
  }

  useEffect(() => {
    if (!formOpen) return;
    const t = window.setTimeout(() => {
      formRef.current?.querySelector<HTMLElement>('select, input, button')?.focus();
    }, 40);
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeForm();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
    };
  }, [formOpen]);

  function onSubmitForm(e: FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 0) {
      toast.error('Ingresa un monto válido');
      return;
    }
    if (!description.trim()) {
      toast.error('Ingresa una descripción');
      return;
    }
    setConfirmOpen(true);
  }

  async function doRegister() {
    setSaving(true);
    try {
      await api('/api/ops/expenses', {
        method: 'POST',
        body: {
          category,
          description: description.trim(),
          amount: Number(amount),
          incurredOn: incurredOn || undefined,
        },
      });
      toast.success('Gasto registrado');
      setConfirmOpen(false);
      setFormOpen(false);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo registrar el gasto');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ing-list gasto-list">
      <div className="ing-list-workspace">
        <div className="ing-list-main">
          <div className="section-title">
            <div className="page-intro" style={{ marginBottom: 0 }}>
              <p>Gastos operativos de la sucursal activa (arriendo, sueldos, servicios…)</p>
            </div>
            {canCreate ? (
              <button type="button" className="btn gasto-register-btn" onClick={openForm}>
                Nuevo gasto
              </button>
            ) : null}
          </div>

          <div className="inv-stats gasto-stats" aria-label="Resumen de gastos">
            <div className="inv-stat">
              <span className="inv-stat-label">Listados</span>
              <strong className="inv-stat-value">{summary.count}</strong>
              <span className="inv-stat-meta">Con filtros</span>
            </div>
            <div className="inv-stat">
              <span className="inv-stat-label">Total filtrado</span>
              <strong className="inv-stat-value gasto-kpi-amount">{money(summary.totalAmount)}</strong>
              <span className="inv-stat-meta">Monto</span>
            </div>
            <div className="inv-stat">
              <span className="inv-stat-label">Este mes</span>
              <strong className="inv-stat-value">{money(summary.monthTotal)}</strong>
              <span className="inv-stat-meta">
                {summary.monthCount} registro{summary.monthCount === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          <div className="ing-filters gasto-filters" role="toolbar" aria-label="Filtros de gastos">
            <button
              type="button"
              className={`ing-chip${filters.category === 'all' ? ' is-active' : ''}`}
              aria-pressed={filters.category === 'all'}
              onClick={() => setCategoryChip('all')}
            >
              Todas
            </button>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`ing-chip gasto-cat-chip${filters.category === cat ? ' is-active' : ''}`}
                aria-pressed={filters.category === cat}
                onClick={() => setCategoryChip(cat)}
                title={cat}
              >
                <span className="gasto-cat-full">{cat}</span>
                <span className="gasto-cat-short">{categoryShort(cat)}</span>
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
            <div className="field gasto-sort-select mobile-only">
              <label className="sr-only" htmlFor="gasto-sort">
                Ordenar
              </label>
              <select
                id="gasto-sort"
                aria-label="Ordenar por"
                value={`${sortKey}:${sortDir}`}
                onChange={(e) => {
                  const [key, dir] = e.target.value.split(':') as [ExpenseSortKey, SortDir];
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
              <div className="ing-skel" aria-busy="true" aria-label="Cargando gastos">
                <div className="ing-skel-row" />
                <div className="ing-skel-row" />
                <div className="ing-skel-row" />
              </div>
            )}

            {!loading && !expenses.length && (
              <div className="sales-empty">
                {hasExtraFilters ? (
                  <>
                    <h3>Ningún gasto coincide</h3>
                    <p className="muted">Prueba otras fechas, categoría o búsqueda.</p>
                    <button
                      type="button"
                      className="btn secondary"
                      style={{ marginTop: '0.75rem' }}
                      onClick={clearFilters}
                    >
                      Limpiar filtros
                    </button>
                  </>
                ) : (
                  <>
                    <h3>Sin gastos registrados</h3>
                    <p className="muted">
                      {canCreate
                        ? 'Usa «Nuevo gasto» arriba (arriendo, remuneraciones, servicios…).'
                        : 'Aún no hay gastos en esta sucursal. Pide a administración que registre el gasto.'}
                    </p>
                  </>
                )}
              </div>
            )}

            {!loading && sorted.length > 0 && (
              <>
                <p className="gasto-status muted">
                  {sorted.length} gasto{sorted.length === 1 ? '' : 's'}
                </p>

                <div className="list-cards mobile-only gasto-cards">
                  {sorted.map((x) => (
                    <article key={x.id} className="list-card gasto-card">
                      <div className="gasto-card-head">
                        <span className="badge brand">{x.category}</span>
                        <span className="muted">{fmtDay(x.incurred_on)}</span>
                      </div>
                      <strong className="gasto-card-desc">{x.description}</strong>
                      {x.created_by_name ? (
                        <div className="meta muted">{x.created_by_name}</div>
                      ) : null}
                      <div className="gasto-card-foot">
                        <strong className="gasto-card-amount">{money(x.amount)}</strong>
                        <span className="muted">Monto</span>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="table-wrap desktop-only gasto-table-wrap">
                  <table className="table gasto-table">
                    <thead>
                      <tr>
                        <SortableTh
                          label="Fecha"
                          column="date"
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={(col) => {
                            const next = nextExpenseSort(sortKey, sortDir, col);
                            setSortKey(next.key);
                            setSortDir(next.dir);
                          }}
                        />
                        <SortableTh
                          label="Categoría"
                          column="category"
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={(col) => {
                            const next = nextExpenseSort(sortKey, sortDir, col);
                            setSortKey(next.key);
                            setSortDir(next.dir);
                          }}
                        />
                        <SortableTh
                          label="Descripción"
                          column="description"
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={(col) => {
                            const next = nextExpenseSort(sortKey, sortDir, col);
                            setSortKey(next.key);
                            setSortDir(next.dir);
                          }}
                        />
                        <SortableTh
                          label="Monto"
                          column="amount"
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={(col) => {
                            const next = nextExpenseSort(sortKey, sortDir, col);
                            setSortKey(next.key);
                            setSortDir(next.dir);
                          }}
                          className="gasto-col-num"
                        />
                        <SortableTh
                          label="Usuaria"
                          column="user"
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={(col) => {
                            const next = nextExpenseSort(sortKey, sortDir, col);
                            setSortKey(next.key);
                            setSortDir(next.dir);
                          }}
                        />
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((x) => (
                        <tr key={x.id}>
                          <td>{fmtDay(x.incurred_on)}</td>
                          <td>
                            <span className="badge brand">{x.category}</span>
                          </td>
                          <td title={x.description}>
                            <span className="gasto-desc-text">{x.description}</span>
                          </td>
                          <td className="gasto-col-num gasto-card-amount">{money(x.amount)}</td>
                          <td>{x.created_by_name || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <InfiniteListFooter
                  sentinelRef={sentinelRef}
                  loadingMore={loadingMore}
                  hasMore={hasMore}
                  itemCount={expenses.length}
                />
              </>
            )}
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
                  <label htmlFor="gasto-f-cat">Categoría</label>
                  <select
                    id="gasto-f-cat"
                    value={draftCategory}
                    onChange={(e) => setDraftCategory(e.target.value as CategoryFilter)}
                  >
                    <option value="all">Todas</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="gasto-f-from">Fecha desde</label>
                  <input
                    id="gasto-f-from"
                    type="date"
                    value={draftDateFrom}
                    onChange={(e) => setDraftDateFrom(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="gasto-f-to">Fecha hasta</label>
                  <input
                    id="gasto-f-to"
                    type="date"
                    value={draftDateTo}
                    onChange={(e) => setDraftDateTo(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="gasto-f-q">Buscar</label>
                  <input
                    id="gasto-f-q"
                    value={draftQ}
                    onChange={(e) => setDraftQ(e.target.value)}
                    placeholder="Descripción, categoría, usuaria…"
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

      {formOpen && (
        <div
          className="pos-modal open"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeForm();
          }}
        >
          <div
            className="pos-modal-panel gasto-form-sheet"
            ref={formRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={formTitleId}
          >
            <div className="pos-modal-head">
              <h3 id={formTitleId}>Nuevo gasto</h3>
              <button className="btn ghost" type="button" onClick={closeForm} aria-label="Cerrar">
                Cerrar
              </button>
            </div>
            <form className="gasto-form-body" onSubmit={onSubmitForm}>
              <span className="ing-chip is-active ing-chip-static form-branch-chip" role="status">
                Sucursal: {branchName}
              </span>
              <p className="muted gasto-form-hint">
                El gasto impacta en esta sucursal. Usa “Monto” para el valor (no es Precio costo de
                mercadería).
              </p>

              <div className="field">
                <label htmlFor="gasto-cat">Categoría</label>
                <select
                  id="gasto-cat"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
                  required
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="gasto-desc">Descripción</label>
                <input
                  id="gasto-desc"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ej. Arriendo local marzo"
                  autoComplete="off"
                />
              </div>

              <div className="gasto-form-row">
                <div className="field">
                  <label htmlFor="gasto-amount">Monto</label>
                  <input
                    id="gasto-amount"
                    required
                    type="number"
                    min={0}
                    step="1"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="field">
                  <label htmlFor="gasto-date">Fecha</label>
                  <input
                    id="gasto-date"
                    type="date"
                    value={incurredOn}
                    onChange={(e) => setIncurredOn(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="btn-row gasto-form-actions">
                <button type="button" className="btn secondary" onClick={closeForm} disabled={saving}>
                  Cancelar
                </button>
                <button type="submit" className="btn" disabled={saving}>
                  {saving ? 'Guardando…' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Confirmar gasto"
        message={`Se registrará ${money(Number(amount) || 0)} en «${category}»: ${description.trim() || '—'}.`}
        confirmLabel="Registrar"
        cancelLabel="Volver"
        onCancel={() => {
          if (!saving) setConfirmOpen(false);
        }}
        onConfirm={() => {
          if (!saving) void doRegister();
        }}
      />
    </div>
  );
}
