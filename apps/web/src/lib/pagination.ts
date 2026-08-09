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
