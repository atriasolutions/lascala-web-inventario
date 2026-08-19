import { ApiError, api } from './api';
import {
  OFFLINE_SALES_EVENT,
  countPendingOfflineSales,
  listPendingOfflineSales,
  markOfflineSaleError,
  markOfflineSalePending,
  removeOfflineSale,
} from './posCatalogCache';
import { toast } from './toast';

export const OFFLINE_SYNC_EVENT = 'lscala:offline-sync';

type SyncResultRow = {
  clientSaleId: string;
  status: 'created' | 'duplicate' | 'error';
  saleId?: string;
  receiptNumber?: string;
  error?: string;
};

export type SyncResponse = {
  results: SyncResultRow[];
  summary: { created: number; duplicate: number; error: number };
};

const BATCH = 50;

let syncLock = false;
let authBlocked = false;
let syncing = false;

function notifySync() {
  window.dispatchEvent(
    new CustomEvent(OFFLINE_SYNC_EVENT, { detail: { syncing, authBlocked } }),
  );
}

export function isOfflineSyncing() {
  return syncing;
}

export function isOfflineSyncAuthBlocked() {
  return authBlocked;
}

export function clearOfflineSyncAuthBlock() {
  authBlocked = false;
  notifySync();
}

/**
 * Sync FIFO → POST /api/sales/offline-sync.
 * Lock global (un solo sync a la vez aunque haya varios hooks).
 * 401: no borra la cola.
 */
export async function syncOfflineSalesQueue(branchId: string): Promise<SyncResponse | null> {
  if (!branchId || syncLock || authBlocked) return null;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return null;

  syncLock = true;
  syncing = true;
  notifySync();

  let createdTotal = 0;
  let dupTotal = 0;
  let errTotal = 0;

  try {
    for (;;) {
      const pending = await listPendingOfflineSales(branchId);
      if (!pending.length) break;

      const batch = pending.slice(0, BATCH);
      for (const row of batch) {
        await markOfflineSalePending(row.clientSaleId);
      }

      let data: SyncResponse;
      try {
        data = await api<SyncResponse>('/api/sales/offline-sync', {
          method: 'POST',
          body: {
            sales: batch.map((s) => ({
              clientSaleId: s.clientSaleId,
              posId: s.posId,
              soldAt: s.soldAt,
              notes: s.notes || 'Venta offline',
              items: s.items.map((it) => ({
                productId: it.productId,
                quantity: it.quantity,
                unitPrice: it.unitPrice,
              })),
            })),
          },
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          authBlocked = true;
          toast.warn('Sesión vencida. Inicia sesión de nuevo para enviar las ventas guardadas.');
          notifySync();
          return null;
        }
        throw err;
      }

      for (const row of data.results || []) {
        if (row.status === 'created' || row.status === 'duplicate') {
          await removeOfflineSale(row.clientSaleId);
        } else {
          await markOfflineSaleError(row.clientSaleId, row.error || 'Error al sincronizar');
        }
      }

      createdTotal += data.summary?.created || 0;
      dupTotal += data.summary?.duplicate || 0;
      errTotal += data.summary?.error || 0;

      const progressed = (data.summary?.created || 0) + (data.summary?.duplicate || 0);
      if (!progressed) break;
      if (pending.length <= BATCH) break;
    }

    window.dispatchEvent(new CustomEvent(OFFLINE_SALES_EVENT));
    const ok = createdTotal + dupTotal;
    if (ok > 0) {
      toast.success(`Se enviaron ${ok} venta${ok === 1 ? '' : 's'} pendiente${ok === 1 ? '' : 's'}`);
      window.dispatchEvent(new CustomEvent('lscala:pos-catalog-refresh'));
    }
    if (errTotal > 0) {
      toast.warn(
        `${errTotal} venta${errTotal === 1 ? '' : 's'} no se pudo${errTotal === 1 ? '' : 'ieron'} enviar — se reintentará`,
      );
    }
    return {
      results: [],
      summary: { created: createdTotal, duplicate: dupTotal, error: errTotal },
    };
  } catch (err) {
    toast.warn(err instanceof Error ? err.message : 'No se pudieron enviar las ventas pendientes');
    window.dispatchEvent(new CustomEvent(OFFLINE_SALES_EVENT));
    return null;
  } finally {
    syncLock = false;
    syncing = false;
    notifySync();
  }
}

export async function getPendingOfflineSalesCount(branchId: string) {
  return countPendingOfflineSales(branchId);
}
