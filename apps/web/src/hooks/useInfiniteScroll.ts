import { useEffect, useRef } from 'react';

type Opts = {
  /** Contenedor con overflow (ej. .ing-list-scroll). Si null, usa viewport. */
  rootRef?: React.RefObject<HTMLElement | null>;
  disabled?: boolean;
  /** Margen antes del final para disparar la carga. */
  rootMargin?: string;
};

/**
 * Observa un sentinel al pie de la lista; llama `onLoadMore` al acercarse.
 */
export function useInfiniteScroll(onLoadMore: () => void, opts: Opts = {}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || opts.disabled) return;

    const root = opts.rootRef?.current ?? null;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          onLoadMoreRef.current();
        }
      },
      {
        root,
        rootMargin: opts.rootMargin ?? '240px 0px',
        threshold: 0,
      },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [opts.disabled, opts.rootRef, opts.rootMargin]);

  return sentinelRef;
}
