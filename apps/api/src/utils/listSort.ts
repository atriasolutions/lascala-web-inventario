/**
 * Sort de listados paginados (infinite scroll).
 * Query: ?sortBy=&sortDir=asc|desc — whitelist por vista; default si inválido.
 */

export type SortDir = 'asc' | 'desc';

export function parseSortDir(raw: unknown, fallback: SortDir = 'desc'): SortDir {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'asc' || v === 'desc') return v;
  return fallback;
}

export function parseSortBy<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  const v = String(raw || '').trim();
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

export function sqlSortDir(dir: SortDir): 'ASC' | 'DESC' {
  return dir === 'asc' ? 'ASC' : 'DESC';
}

/** ORDER BY whitelist — solo fragmentos fijos, nunca input crudo. */
export function orderByClause(expr: string, dir: SortDir, tieBreak?: string): string {
  const d = sqlSortDir(dir);
  const primary = `${expr} ${d}`;
  return tieBreak ? `${primary}, ${tieBreak}` : primary;
}
