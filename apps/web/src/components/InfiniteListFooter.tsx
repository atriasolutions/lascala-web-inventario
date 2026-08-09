import type { RefObject } from 'react';

type Props = {
  sentinelRef: RefObject<HTMLDivElement | null>;
  loadingMore: boolean;
  hasMore: boolean;
  itemCount: number;
};

/** Pie de lista: sentinel + estado de carga / fin. */
export function InfiniteListFooter({ sentinelRef, loadingMore, hasMore, itemCount }: Props) {
  if (itemCount === 0) return null;
  return (
    <div className="ing-list-infinite" aria-live="polite">
      <div ref={sentinelRef} className="ing-list-infinite-sentinel" aria-hidden />
      {loadingMore && <p className="ing-list-infinite-status">Cargando…</p>}
      {!loadingMore && !hasMore && (
        <p className="ing-list-infinite-status is-end">No hay más resultados</p>
      )}
    </div>
  );
}
