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
import { BoutiqueLoader } from '../components/BoutiqueLoader';
import { InfiniteListFooter } from '../components/InfiniteListFooter';
import { ModalOverlayClose } from '../components/ModalOverlayClose';
import { SortableTh } from '../components/SortableTh';
import { useInfiniteList } from '../hooks/useInfiniteList';
import { api, mediaUrl, money } from '../lib/api';
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
import {
  PERIOD_CHIPS,
  chileIsoDate,
  chileYearMonth,
  defaultPeriodState,
  resolvePeriod,
  yearOptions,
  type PeriodPreset,
  type ReportsPeriodState,
} from './reportes/reportsPeriod';
import { parseChileMoney } from '../lib/chileMoney';
import { ChileMoneyInput } from '../components/ChileMoneyInput';
import { AttachImageField } from '../components/AttachImageField';
import { packComprobante, unpackComprobante } from '../lib/comprobanteEmbed';

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
  description: string;
  user: string;
  /** 'all' = sin filtro de fecha; resto = presets de Reportes. */
  periodPreset: PeriodPreset | 'all';
  periodDay: string;
  periodMonth: string;
  periodYear: string;
};

type ListFilters = Filters & { branchId: string };

const DEFAULT_FILTERS: Filters = {
  category: 'all',
  dateFrom: '',
  dateTo: '',
  description: '',
  user: '',
  periodPreset: 'all',
  periodDay: chileIsoDate(),
  periodMonth: chileYearMonth().month,
  periodYear: chileYearMonth().year,
};

function applyPeriodPreset(
  prev: Filters,
  preset: PeriodPreset | 'all',
  patch?: Partial<Pick<Filters, 'periodDay' | 'periodMonth' | 'periodYear' | 'dateFrom' | 'dateTo'>>,
): Filters {
  if (preset === 'all') {
    return {
      ...prev,
      periodPreset: 'all',
      dateFrom: '',
      dateTo: '',
    };
  }
  const defaults = defaultPeriodState();
  const state: ReportsPeriodState = {
    ...defaults,
    preset,
    day: patch?.periodDay ?? prev.periodDay ?? defaults.day,
    month: patch?.periodMonth ?? prev.periodMonth ?? defaults.month,
    year: patch?.periodYear ?? prev.periodYear ?? defaults.year,
    from: patch?.dateFrom ?? prev.dateFrom ?? defaults.from,
    to: patch?.dateTo ?? prev.dateTo ?? defaults.to,
  };
  const { from, to } = resolvePeriod(state);
  return {
    ...prev,
    periodPreset: preset,
    periodDay: state.day,
    periodMonth: state.month,
    periodYear: state.year,
    dateFrom: from,
    dateTo: to,
  };
}

function normalizeExpenseFilters(raw: Filters & { q?: string }): Filters {
  const legacy = String(raw.q || '').trim();
  const merged: Filters = {
    ...DEFAULT_FILTERS,
    ...raw,
    description: raw.description || (!raw.user ? legacy : '') || '',
    user: raw.user || '',
  };
  if (!merged.periodPreset) {
    if (merged.dateFrom || merged.dateTo) {
      return applyPeriodPreset(
        { ...merged, periodPreset: 'range' },
        'range',
        { dateFrom: merged.dateFrom, dateTo: merged.dateTo },
      );
    }
    return { ...merged, periodPreset: 'all' };
  }
  if (merged.periodPreset !== 'all' && (!merged.dateFrom || !merged.dateTo)) {
    return applyPeriodPreset(merged, merged.periodPreset);
  }
  return merged;
}

const SORT_OPTIONS: { key: ExpenseSortKey; label: string }[] = [
  { key: 'date', label: 'Fecha' },
  { key: 'category', label: 'Categoría' },
  { key: 'description', label: 'Descripción' },
  { key: 'amount', label: 'Monto' },
  { key: 'user', label: 'Usuario' },
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
  if (f.description.trim()) params.set('description', f.description.trim());
  if (f.user.trim()) params.set('user', f.user.trim());
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
  const canCreate = role === 'owner';

  const [filters, setFilters] = useState<Filters>(() =>
    normalizeExpenseFilters(loadListFilters('gastos', branchId, DEFAULT_FILTERS)),
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
  const [draftDescription, setDraftDescription] = useState('');
  const [draftUser, setDraftUser] = useState('');
  const [draftCategory, setDraftCategory] = useState<CategoryFilter>('all');
  const filtersTitleId = useId();
  const modalRef = useRef<HTMLDivElement>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('Arriendo');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [incurredOn, setIncurredOn] = useState(todayISO);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelFormConfirm, setCancelFormConfirm] = useState(false);
  const formTitleId = useId();
  const formRef = useRef<HTMLDivElement>(null);

  const listFilters: ListFilters = useMemo(
    () => ({ ...filters, branchId: branchId || '' }),
    [filters, branchId],
  );

  useEffect(() => {
    setFilters(normalizeExpenseFilters(loadListFilters('gastos', branchId, DEFAULT_FILTERS)));
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

  const years = useMemo(() => yearOptions(), []);

  const hasExtraFilters = Boolean(
    filters.dateFrom ||
      filters.dateTo ||
      filters.description.trim() ||
      filters.user.trim() ||
      filters.category !== 'all',
  );

  const summaryChips = useMemo(() => {
    const chips: { key: string; label: string }[] = [];
    if (filters.category !== 'all') chips.push({ key: 'cat', label: filters.category });
    if (filters.periodPreset !== 'all' && filters.dateFrom && filters.dateTo) {
      const label =
        filters.dateFrom === filters.dateTo
          ? fmtDay(filters.dateFrom)
          : `${fmtDay(filters.dateFrom)} – ${fmtDay(filters.dateTo)}`;
      chips.push({ key: 'period', label });
    } else {
      if (filters.dateFrom) chips.push({ key: 'from', label: `Desde ${fmtDay(filters.dateFrom)}` });
      if (filters.dateTo) chips.push({ key: 'to', label: `Hasta ${fmtDay(filters.dateTo)}` });
    }
    if (filters.description.trim()) {
      chips.push({ key: 'description', label: filters.description.trim() });
    }
    if (filters.user.trim()) chips.push({ key: 'user', label: filters.user.trim() });
    return chips;
  }, [filters]);

  function openDrawer() {
    setDraftDateFrom(filters.dateFrom);
    setDraftDateTo(filters.dateTo);
    setDraftDescription(filters.description);
    setDraftUser(filters.user);
    setDraftCategory(filters.category);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  function applyDrawer() {
    setFilters((prev) =>
      applyPeriodPreset(
        {
          ...prev,
          category: draftCategory,
          description: draftDescription,
          user: draftUser,
        },
        'range',
        { dateFrom: draftDateFrom, dateTo: draftDateTo },
      ),
    );
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
    setAttachmentUrl('');
    setIncurredOn(todayISO());
    setFormOpen(true);
  }

  function closeForm(force = false) {
    if (saving) return;
    const dirty = Boolean(description.trim() || amount.trim() || attachmentUrl.trim());
    if (!force && dirty) {
      setCancelFormConfirm(true);
      return;
    }
    setCancelFormConfirm(false);
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
    const n = parseChileMoney(amount);
    if (n == null || n < 0) {
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
      const n = parseChileMoney(amount);
      if (n == null) {
        toast.error('Ingresa un monto válido');
        return;
      }
      await api('/api/ops/expenses', {
        method: 'POST',
        body: {
          category,
          description: packComprobante(description, attachmentUrl) || description.trim(),
          amount: n,
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
              <button type="button" className="btn gasto-register-btn" data-help="cta.gastos.nuevo" onClick={openForm}>
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
              className={`ing-chip${filters.periodPreset === 'all' ? ' is-active' : ''}`}
              aria-pressed={filters.periodPreset === 'all'}
              onClick={() => setFilters((prev) => applyPeriodPreset(prev, 'all'))}
            >
              Todo
            </button>
            {PERIOD_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={`ing-chip${filters.periodPreset === chip.id ? ' is-active' : ''}`}
                aria-pressed={filters.periodPreset === chip.id}
                onClick={() => setFilters((prev) => applyPeriodPreset(prev, chip.id))}
              >
                {chip.label}
              </button>
            ))}
            {filters.periodPreset === 'day' ? (
              <label className="field gasto-period-field">
                <span className="sr-only">Día</span>
                <input
                  type="date"
                  value={filters.periodDay}
                  onChange={(e) =>
                    setFilters((prev) =>
                      applyPeriodPreset(prev, 'day', { periodDay: e.target.value }),
                    )
                  }
                />
              </label>
            ) : null}
            {filters.periodPreset === 'month' ? (
              <label className="field gasto-period-field">
                <span className="sr-only">Mes</span>
                <input
                  type="month"
                  value={filters.periodMonth}
                  onChange={(e) =>
                    setFilters((prev) =>
                      applyPeriodPreset(prev, 'month', { periodMonth: e.target.value }),
                    )
                  }
                />
              </label>
            ) : null}
            {filters.periodPreset === 'year' ? (
              <label className="field gasto-period-field">
                <span className="sr-only">Año</span>
                <select
                  value={filters.periodYear}
                  onChange={(e) =>
                    setFilters((prev) =>
                      applyPeriodPreset(prev, 'year', { periodYear: e.target.value }),
                    )
                  }
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {filters.periodPreset === 'range' ? (
              <>
                <label className="field gasto-period-field">
                  <span className="sr-only">Desde</span>
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) =>
                      setFilters((prev) =>
                        applyPeriodPreset(prev, 'range', {
                          dateFrom: e.target.value,
                          dateTo: prev.dateTo || e.target.value,
                        }),
                      )
                    }
                  />
                </label>
                <label className="field gasto-period-field">
                  <span className="sr-only">Hasta</span>
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) =>
                      setFilters((prev) =>
                        applyPeriodPreset(prev, 'range', {
                          dateFrom: prev.dateFrom || e.target.value,
                          dateTo: e.target.value,
                        }),
                      )
                    }
                  />
                </label>
              </>
            ) : null}
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
            {loading && <BoutiqueLoader label="Cargando gastos…" variant="block" />}

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
                  {sorted.map((x) => {
                    const { text: desc, url: foto } = unpackComprobante(x.description);
                    return (
                    <article key={x.id} className="list-card gasto-card">
                      <div className="gasto-card-head">
                        <span className="badge brand">{x.category}</span>
                        <span className="muted">{fmtDay(x.incurred_on)}</span>
                      </div>
                      <strong className="gasto-card-desc">{desc}</strong>
                      {foto ? (
                        <a
                          className="meta"
                          href={mediaUrl(foto) || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Ver comprobante
                        </a>
                      ) : null}
                      {x.created_by_name ? (
                        <div className="meta muted">{x.created_by_name}</div>
                      ) : null}
                      <div className="gasto-card-foot">
                        <strong className="gasto-card-amount">{money(x.amount)}</strong>
                        <span className="muted">Monto</span>
                      </div>
                    </article>
                    );
                  })}
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
                          label="Usuario"
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
                          <td title={unpackComprobante(x.description).text}>
                            <span className="gasto-desc-text">
                              {unpackComprobante(x.description).text}
                            </span>
                            {unpackComprobante(x.description).url ? (
                              <a
                                className="meta"
                                href={mediaUrl(unpackComprobante(x.description).url) || '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {' '}
                                Comprobante
                              </a>
                            ) : null}
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
                  <label htmlFor="gasto-f-description">Descripción</label>
                  <input
                    id="gasto-f-description"
                    value={draftDescription}
                    onChange={(e) => setDraftDescription(e.target.value)}
                    placeholder="Texto del gasto"
                    autoComplete="off"
                  />
                </div>
                <div className="field">
                  <label htmlFor="gasto-f-user">Usuario</label>
                  <input
                    id="gasto-f-user"
                    value={draftUser}
                    onChange={(e) => setDraftUser(e.target.value)}
                    placeholder="Nombre"
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
          <ModalOverlayClose onClose={closeForm}>
          <div
            className="pos-modal-panel gasto-form-sheet"
            ref={formRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={formTitleId}
          >
            <div className="pos-modal-head">
              <h3 id={formTitleId}>Nuevo gasto</h3>
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
                  <ChileMoneyInput
                    id="gasto-amount"
                    required
                    value={amount}
                    onChange={setAmount}
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

              <AttachImageField
                value={attachmentUrl}
                onChange={setAttachmentUrl}
                disabled={saving}
              />

              <div className="btn-row gasto-form-actions">
                <button type="button" className="btn secondary" onClick={closeForm} disabled={saving}>
                  Cancelar
                </button>
                <button type="submit" className="btn" disabled={saving}>
                  {saving ? 'Guardando…' : 'Registrar'}
                </button>
              </div>
            </form>
          </div></ModalOverlayClose>
        </div>
      )}

      <ConfirmDialog
        open={cancelFormConfirm}
        title="¿Cancelar?"
        message="¿Estás seguro de que deseas cancelar? Los datos ingresados se perderán."
        confirmLabel="Sí, cancelar"
        cancelLabel="Seguir editando"
        danger
        onCancel={() => setCancelFormConfirm(false)}
        onConfirm={() => closeForm(true)}
      />

      <ConfirmDialog
        open={confirmOpen}
        title="Confirmar gasto"
        message={`Se registrará ${money(parseChileMoney(amount) ?? 0)} en «${category}»: ${description.trim() || '—'}.`}
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
