/** Fechas civiles America/Santiago para filtros de Reportes. */

export type ReportsVista = 'ventas' | 'stock' | 'ingresos' | 'gastos' | 'mermas';

export type PeriodPreset = 'this_month' | 'this_year' | 'month' | 'year' | 'range';

export type ReportsPeriodState = {
  preset: PeriodPreset;
  /** YYYY-MM cuando preset = month */
  month: string;
  /** YYYY cuando preset = year */
  year: string;
  from: string;
  to: string;
};

const TZ = 'America/Santiago';

export function chileIsoDate(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function chileYearMonth(d = new Date()): { year: string; month: string } {
  const iso = chileIsoDate(d);
  return { year: iso.slice(0, 4), month: iso.slice(0, 7) };
}

function lastDayOfMonth(year: number, month1to12: number): string {
  const last = new Date(Date.UTC(year, month1to12, 0));
  const y = last.getUTCFullYear();
  const m = String(last.getUTCMonth() + 1).padStart(2, '0');
  const day = String(last.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function defaultPeriodState(): ReportsPeriodState {
  const { year, month } = chileYearMonth();
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return {
    preset: 'this_month',
    month,
    year,
    from: `${month}-01`,
    to: lastDayOfMonth(y, m),
  };
}

export function resolvePeriod(state: ReportsPeriodState): { from: string; to: string } {
  const today = chileIsoDate();
  const { year: cy, month: cm } = chileYearMonth();

  switch (state.preset) {
    case 'this_month': {
      const y = Number(cm.slice(0, 4));
      const m = Number(cm.slice(5, 7));
      return { from: `${cm}-01`, to: lastDayOfMonth(y, m) };
    }
    case 'this_year':
      return { from: `${cy}-01-01`, to: today };
    case 'month': {
      const ym = state.month || cm;
      const y = Number(ym.slice(0, 4));
      const m = Number(ym.slice(5, 7));
      const from = `${ym}-01`;
      const last = lastDayOfMonth(y, m);
      return { from, to: last };
    }
    case 'year': {
      const y = state.year || cy;
      return { from: `${y}-01-01`, to: y === cy ? today : `${y}-12-31` };
    }
    case 'range':
      return {
        from: state.from || `${cm}-01`,
        to: state.to || today,
      };
    default:
      return { from: `${cm}-01`, to: today };
  }
}

export const PERIOD_CHIPS: { id: PeriodPreset; label: string }[] = [
  { id: 'this_month', label: 'Este mes' },
  { id: 'this_year', label: 'Este año' },
  { id: 'month', label: 'Mes' },
  { id: 'year', label: 'Año' },
  { id: 'range', label: 'Rango' },
];

export const REPORTS_TABS: { to: ReportsVista; label: string }[] = [
  { to: 'ventas', label: 'Ventas' },
  { to: 'stock', label: 'Stock' },
  { to: 'ingresos', label: 'Ingresos' },
  { to: 'gastos', label: 'Gastos' },
  { to: 'mermas', label: 'Mermas' },
];

export function vistaLabel(vista: ReportsVista): string {
  return REPORTS_TABS.find((t) => t.to === vista)?.label || vista;
}

export function yearOptions(count = 6): string[] {
  const { year } = chileYearMonth();
  const y = Number(year);
  return Array.from({ length: count }, (_, i) => String(y - i));
}
