import { useCallback, useEffect, useRef, useState } from 'react';
import { PAGE_SIZE } from '../lib/pagination';
import { useInfiniteScroll } from './useInfiniteScroll';

type PageResult<T> = {
  items: T[];
  hasMore: boolean;
  nextOffset?: number;
};

type Opts<T, F> = {
  /** Clave/filtros: al cambiar se resetea y pide la primera página. */
  filters: F;
  fetchPage: (filters: F, offset: number, limit: number) => Promise<PageResult<T>>;
  pageSize?: number;
  enabled?: boolean;
};

/**
 * Lista con infinite scroll: primera página al cambiar filtros; append al llegar al sentinel.
 */
export function useInfiniteList<T, F>({
  filters,
  fetchPage,
  pageSize = PAGE_SIZE,
  enabled = true,
}: Opts<T, F>) {
  const [items, setItems] = useState<T[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [nextOffset, setNextOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const busyRef = useRef(false);
  const hasMoreRef = useRef(true);
  const nextOffsetRef = useRef(0);
  hasMoreRef.current = hasMore;
  nextOffsetRef.current = nextOffset;

  const loadFirst = useCallback(async () => {
    if (!enabled) return;
    busyRef.current = true;
    setLoading(true);
    setError('');
    try {
      const page = await fetchPage(filtersRef.current, 0, pageSize);
      setItems(page.items);
      setHasMore(page.hasMore);
      setNextOffset(page.nextOffset ?? page.items.length);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al cargar';
      setError(msg);
      setItems([]);
      setHasMore(false);
      setNextOffset(0);
      throw err;
    } finally {
      setLoading(false);
      busyRef.current = false;
    }
  }, [enabled, fetchPage, pageSize]);

  useEffect(() => {
    void loadFirst().catch(() => {
      /* error ya en state */
    });
  }, [filters, loadFirst]);

  const loadMore = useCallback(async () => {
    if (!enabled || !hasMoreRef.current || busyRef.current || loading) return;
    busyRef.current = true;
    setLoadingMore(true);
    try {
      const offset = nextOffsetRef.current;
      const page = await fetchPage(filtersRef.current, offset, pageSize);
      setItems((prev) => [...prev, ...page.items]);
      setHasMore(page.hasMore);
      setNextOffset(page.nextOffset ?? offset + page.items.length);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al cargar más';
      setError(msg);
    } finally {
      setLoadingMore(false);
      busyRef.current = false;
    }
  }, [enabled, fetchPage, loading, pageSize]);

  const sentinelRef = useInfiniteScroll(
    () => {
      void loadMore();
    },
    {
      rootRef: scrollRef,
      disabled: !enabled || !hasMore || loading || loadingMore || items.length === 0,
    },
  );

  const reload = useCallback(() => {
    void loadFirst().catch(() => undefined);
  }, [loadFirst]);

  return {
    items,
    setItems,
    hasMore,
    loading,
    loadingMore,
    error,
    setError,
    scrollRef,
    sentinelRef,
    reload,
  };
}
