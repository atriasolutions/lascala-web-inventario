import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ApiError, userFacingError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { loadListFilters, saveListFilters } from '../../lib/listFiltersPersist';
import { toast } from '../../lib/toast';
import { ReportsFiltersProvider } from './reportsContext';
import {
  PERIOD_CHIPS,
  REPORTS_TABS,
  defaultPeriodState,
  resolvePeriod,
  vistaLabel,
  yearOptions,
  type PeriodPreset,
  type ReportsPeriodState,
  type ReportsVista,
} from './reportsPeriod';

const LEDES: Record<ReportsVista, string> = {
  ventas: 'Evolución y detalle de tickets. El resumen del día está en Inicio.',
  stock: 'Valor de sala y riesgo de stock en la sucursal activa.',
  ingresos: 'Reinversión a Precio costo y documentos del período.',
  gastos: 'Gastos de operación por categoría. El registro está en Gastos.',
  mermas: 'Bajas y vouchers del período. El registro está en Mermas.',
  inventarios: 'Faltante, sobrante y neto de cada toma aplicada (INV-…). Valorado a precio de venta.',
};

function vistaFromPath(pathname: string): ReportsVista {
  const hit = REPORTS_TABS.find((t) => pathname.includes(`/reportes/${t.to}`));
  return hit?.to || 'ventas';
}

function formatPeriodDay(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Layout Reportes: tabs + filtros sticky. Los datos los completa cada vista. */
export function ReportsLayout() {
  const { branches, branchId } = useAuth();
  const { pathname, search } = useLocation();
  const vista = vistaFromPath(pathname);
  const branchName = branches.find((b) => b.id === branchId)?.name || 'la sucursal activa';

  const [period, setPeriod] = useState<ReportsPeriodState>(() => ({
    ...defaultPeriodState(),
    ...loadListFilters('reports', branchId, defaultPeriodState()),
  }));
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setPeriod({
      ...defaultPeriodState(),
      ...loadListFilters('reports', branchId, defaultPeriodState()),
    });
  }, [branchId]);

  useEffect(() => {
    saveListFilters('reports', branchId, period);
  }, [branchId, period]);

  const { from, to } = useMemo(() => resolvePeriod(period), [period]);
  const years = useMemo(() => yearOptions(), []);

  function patchPeriod(partial: Partial<ReportsPeriodState>) {
    setPeriod((prev) => {
      const next = { ...prev, ...partial };
      const range = resolvePeriod(next);
      return { ...next, from: range.from, to: range.to };
    });
  }

  function setPreset(preset: PeriodPreset) {
    patchPeriod({ preset });
  }

  async function downloadExcel() {
    setExporting(true);
    try {
      const token = localStorage.getItem('lscala_token');
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      if (branchId) headers['X-Branch-Id'] = branchId;
      const posId = localStorage.getItem('lscala_pos');
      if (posId) headers['X-Pos-Id'] = posId;

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
      const qs = new URLSearchParams({ from, to });
      const take = new URLSearchParams(search).get('take');
      if (take) qs.set('stocktakeId', take);
      const res = await fetch(`${apiUrl}/api/reports/${vista}/export?${qs}`, { headers });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new ApiError(res.status, body.error || 'No se pudo descargar el Excel');
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const named = /filename="([^"]+)"/.exec(cd)?.[1];
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = named || `LScala-${vistaLabel(vista)}-${from}_${to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Excel descargado');
    } catch (err) {
      toast.error(userFacingError(err, 'No se pudo descargar el Excel'));
    } finally {
      setExporting(false);
    }
  }

  const filtersValue = useMemo(
    () => ({ vista, branchId, branchName, period, from, to }),
    [vista, branchId, branchName, period, from, to],
  );

  return (
    <div className="reports-page">
      <p className="admin-lede">{LEDES[vista]}</p>

      <nav className="admin-tabs" aria-label="Secciones de Reportes">
        {REPORTS_TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={`/reportes/${tab.to}`}
            className={({ isActive }) => (isActive ? 'is-active' : undefined)}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <div className="reports-filters" role="region" aria-label="Filtros del reporte">
        <div className="reports-filters-chips" role="group" aria-label="Período">
          {PERIOD_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={`ing-chip${period.preset === chip.id ? ' is-active' : ''}`}
              onClick={() => setPreset(chip.id)}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <p className="muted reports-filters-range" aria-live="polite">
          {from === to
            ? formatPeriodDay(from)
            : `${formatPeriodDay(from)} – ${formatPeriodDay(to)}`}
        </p>

        {period.preset === 'day' ? (
          <label className="reports-filter-field">
            <span className="sr-only">Día</span>
            <input
              type="date"
              value={period.day}
              onChange={(e) => patchPeriod({ preset: 'day', day: e.target.value })}
            />
          </label>
        ) : null}

        {period.preset === 'month' ? (
          <label className="reports-filter-field">
            <span className="sr-only">Mes</span>
            <input
              type="month"
              value={period.month}
              onChange={(e) => patchPeriod({ preset: 'month', month: e.target.value })}
            />
          </label>
        ) : null}

        {period.preset === 'year' ? (
          <label className="reports-filter-field">
            <span className="sr-only">Año</span>
            <select
              value={period.year}
              onChange={(e) => patchPeriod({ preset: 'year', year: e.target.value })}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {period.preset === 'range' ? (
          <div className="reports-filter-range">
            <label className="reports-filter-field">
              <span>Desde</span>
              <input
                type="date"
                value={period.from}
                onChange={(e) => patchPeriod({ preset: 'range', from: e.target.value })}
              />
            </label>
            <label className="reports-filter-field">
              <span>Hasta</span>
              <input
                type="date"
                value={period.to}
                onChange={(e) => patchPeriod({ preset: 'range', to: e.target.value })}
              />
            </label>
          </div>
        ) : null}

        <div className="reports-filters-end">
          <p className="muted reports-filters-scope">Datos de {branchName}</p>
          <button
            type="button"
            className="btn reports-export-btn"
            data-help="cta.reportes.excel"
            onClick={() => void downloadExcel()}
            disabled={exporting}
          >
            {exporting ? 'Preparando…' : 'Descargar Excel'}
          </button>
        </div>
      </div>

      <ReportsFiltersProvider value={filtersValue}>
        <Outlet key={branchId || 'sucursal'} />
      </ReportsFiltersProvider>
    </div>
  );
}
