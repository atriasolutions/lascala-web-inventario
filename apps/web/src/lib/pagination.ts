export const PAGE_SIZE = 40;

export type PageMeta = {
  hasMore: boolean;
  limit: number;
  offset: number;
  nextOffset?: number;
};

export function withPagination(
  params: URLSearchParams,
  offset: number,
  limit = PAGE_SIZE,
) {
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  return params;
}

/** Sort server-side: al cambiar, incluir en filters de useInfiniteList para resetear página. */
export function withListSort(
  params: URLSearchParams,
  sortBy: string,
  sortDir: 'asc' | 'desc',
) {
  if (sortBy) params.set('sortBy', sortBy);
  if (sortDir) params.set('sortDir', sortDir);
  return params;
}
