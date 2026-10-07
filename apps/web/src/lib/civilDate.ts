const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Fecha calendario ('YYYY-MM-DD') → Date local (sin corrimiento de zona horaria).
 * Timestamps con hora (created_at, sold_at…) se parsean normal y sí se convierten a hora local.
 */
export function parseDateOrInstant(value: string): Date {
  const m = DATE_ONLY.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(value);
}

export function formatDay(value: string, opts?: Intl.DateTimeFormatOptions): string {
  const d = parseDateOrInstant(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(
    'es-CL',
    opts ?? { day: '2-digit', month: 'short', year: 'numeric' },
  );
}
