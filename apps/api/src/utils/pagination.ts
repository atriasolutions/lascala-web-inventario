/** Paginación offset/limit para listados (infinite scroll). */
export const DEFAULT_PAGE_SIZE = 40;
export const MAX_PAGE_SIZE = 100;

export function parsePagination(query: { limit?: unknown; offset?: unknown }) {
  const rawLimit = Number(query.limit);
  const rawOffset = Number(query.offset);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(rawLimit)))
    : DEFAULT_PAGE_SIZE;
  const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : 0;
  return { limit, offset };
}

/** Pedir limit+1 filas para saber si hay más sin COUNT. */
export function fetchLimit(limit: number) {
  return limit + 1;
}

export function slicePage<T>(rows: T[], limit: number, offset: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return {
    items,
    hasMore,
    limit,
    offset,
    nextOffset: offset + items.length,
  };
}
