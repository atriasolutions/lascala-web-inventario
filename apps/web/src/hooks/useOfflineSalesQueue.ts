import { useCallback, useEffect, useState } from 'react';
import { useNetworkStatus } from '../lib/networkStatus';
import {
  OFFLINE_SALES_EVENT,
  enqueueOfflineSale,
  type OfflineSaleDraft,
  type OfflineSaleRecord,
} from '../lib/posCatalogCache';
import {
  OFFLINE_SYNC_EVENT,
  clearOfflineSyncAuthBlock,
  getPendingOfflineSalesCount,
  isOfflineSyncAuthBlocked,
  isOfflineSyncing,
  syncOfflineSalesQueue,
} from '../lib/offlineSalesSync';

/**
 * Cola FIFO de ventas offline → POST /api/sales/offline-sync.
 * 401: no borra la cola (re-login + reintento).
 */
export function useOfflineSalesQueue(branchId: string | null | undefined) {
  const { online } = useNetworkStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(() => isOfflineSyncing());
  const [authBlocked, setAuthBlocked] = useState(() => isOfflineSyncAuthBlocked());

  const refreshCount = useCallback(async () => {
    if (!branchId) {
      setPendingCount(0);
      return 0;
    }
    const n = await getPendingOfflineSalesCount(branchId);
    setPendingCount(n);
    return n;
  }, [branchId]);

  useEffect(() => {
    void refreshCount();
    function onSales() {
      void refreshCount();
    }
    function onSync() {
      setSyncing(isOfflineSyncing());
      setAuthBlocked(isOfflineSyncAuthBlocked());
    }
    window.addEventListener(OFFLINE_SALES_EVENT, onSales);
    window.addEventListener(OFFLINE_SYNC_EVENT, onSync);
    return () => {
      window.removeEventListener(OFFLINE_SALES_EVENT, onSales);
      window.removeEventListener(OFFLINE_SYNC_EVENT, onSync);
    };
  }, [refreshCount]);

  const syncPending = useCallback(async () => {
    if (!branchId) return null;
    return syncOfflineSalesQueue(branchId);
  }, [branchId]);

  useEffect(() => {
    if (!branchId || !online) return;
    clearOfflineSyncAuthBlock();
    setAuthBlocked(false);
    void syncOfflineSalesQueue(branchId);
  }, [branchId, online]);

  const enqueue = useCallback(
    async (draft: OfflineSaleDraft) => {
      const record = await enqueueOfflineSale(draft);
      const n = await refreshCount();
      return { record, pendingCount: n };
    },
    [refreshCount],
  );

  return {
    pendingCount,
    syncing,
    authBlocked,
    enqueue,
    syncNow: syncPending,
    refreshCount,
  };
}

export type { OfflineSaleRecord };
