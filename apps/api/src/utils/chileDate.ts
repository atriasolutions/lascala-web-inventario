import { query } from '../db/pool.js';
import { HttpError } from './errors.js';

/** Fecha civil Boutique L'Scala (Calama). No usar CURRENT_DATE/now() crudos. */
export const CHILE_TZ = 'America/Santiago';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseCivilDate(raw: unknown, field: string): string | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (!ISO_DATE.test(s)) throw new HttpError(400, `${field} debe ser YYYY-MM-DD`);
  return s;
}

export async function chileToday(): Promise<string> {
  const res = await query<{ d: string }>(
    `SELECT (timezone($1, now()))::date::text AS d`,
    [CHILE_TZ],
  );
  return res.rows[0]?.d || new Date().toISOString().slice(0, 10);
}

export function monthStart(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

export function addMonths(isoDate: string, delta: number): string {
  const [y, m] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  return `${yy}-${mm}-01`;
}

/** Rango de serie mensual: meses civiles Chile **dentro** de from–to (tope 24). */
export function chartMonthRange(from: string, to: string): { chartFrom: string; chartTo: string } {
  const toM = monthStart(to);
  let fromM = monthStart(from);
  const maxBack = addMonths(toM, -23);
  if (fromM < maxBack) fromM = maxBack;
  return { chartFrom: fromM, chartTo: toM };
}

export type SeriesGrain = 'day' | 'week' | 'month';

export type SeriesBucket = {
  period: string;
  label: string;
  start: string;
  end: string;
};

const MESES_CORTO = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
] as const;

function ymd(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

function isoFromUtc(dt: Date): string {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(isoDate: string, delta: number): string {
  const { y, m, d } = ymd(isoDate);
  return isoFromUtc(new Date(Date.UTC(y, m - 1, d + delta)));
}

export function civilDaysInclusive(from: string, to: string): number {
  const a = ymd(from);
  const b = ymd(to);
  const ms =
    Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d);
  return Math.round(ms / 86_400_000) + 1;
}

/** Grano del gráfico: ≤45d día, ≤120d semana lun–dom, si no mes. */
export function seriesGrain(from: string, to: string): SeriesGrain {
  const days = civilDaysInclusive(from, to);
  if (days <= 45) return 'day';
  if (days <= 120) return 'week';
  return 'month';
}

function mondayOf(iso: string): string {
  const { y, m, d } = ymd(iso);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  dt.setUTCDate(dt.getUTCDate() + delta);
  return isoFromUtc(dt);
}

export function lastDayOfMonth(isoDate: string): string {
  const { y, m } = ymd(isoDate);
  return isoFromUtc(new Date(Date.UTC(y, m, 0)));
}

function minIso(a: string, b: string) {
  return a < b ? a : b;
}
function maxIso(a: string, b: string) {
  return a > b ? a : b;
}

function dayLabel(iso: string): string {
  const { d, m } = ymd(iso);
  return `${d} ${MESES_CORTO[m - 1]}`;
}

function weekLabel(start: string, end: string): string {
  const a = ymd(start);
  const b = ymd(end);
  if (a.m === b.m) return `${a.d}–${b.d} ${MESES_CORTO[b.m - 1]}`;
  return `${a.d} ${MESES_CORTO[a.m - 1]}–${b.d} ${MESES_CORTO[b.m - 1]}`;
}

function monthLabel(monthStartIso: string): string {
  const { y, m } = ymd(monthStartIso);
  return `${MESES_CORTO[m - 1]} ${y}`;
}

/**
 * Buckets del gráfico (días en 0 incluidos).
 * week = lunes–domingo ISO; label recortado al rango from/to.
 */
export function buildChartBuckets(from: string, to: string): {
  grain: SeriesGrain;
  buckets: SeriesBucket[];
} {
  const grain = seriesGrain(from, to);
  const buckets: SeriesBucket[] = [];

  if (grain === 'day') {
    let d = from;
    while (d <= to) {
      buckets.push({ period: d, label: dayLabel(d), start: d, end: d });
      d = addDays(d, 1);
    }
    return { grain, buckets };
  }

  if (grain === 'week') {
    let w = mondayOf(from);
    const last = mondayOf(to);
    while (w <= last) {
      const weekEnd = addDays(w, 6);
      const start = maxIso(w, from);
      const end = minIso(weekEnd, to);
      buckets.push({ period: w, label: weekLabel(start, end), start, end });
      w = addDays(w, 7);
    }
    return { grain, buckets };
  }

  let m = monthStart(from);
  const lastM = monthStart(to);
  while (m <= lastM) {
    const start = maxIso(m, from);
    const end = minIso(lastDayOfMonth(m), to);
    buckets.push({ period: m.slice(0, 7), label: monthLabel(m), start, end });
    m = addMonths(m, 1);
  }
  return { grain, buckets };
}

export async function resolveReportPeriod(queryParams: {
  from?: unknown;
  to?: unknown;
}): Promise<{ from: string; to: string }> {
  const today = await chileToday();
  const from = parseCivilDate(queryParams.from, 'from');
  const to = parseCivilDate(queryParams.to, 'to');
  const resolvedFrom = from ?? `${today.slice(0, 7)}-01`;
  const resolvedTo = to ?? today;
  if (resolvedFrom > resolvedTo) {
    throw new HttpError(400, 'from no puede ser posterior a to');
  }
  return { from: resolvedFrom, to: resolvedTo };
}
