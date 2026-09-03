import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useNetworkStatus } from '../lib/networkStatus';
import {
  findPosProductByCode,
  loadPosSnapshot,
  savePosSnapshot,
  searchPosCatalog,
  applyLocalStockDelta,
  upsertPosCatalogProduct,
  filterPosCatalogProducts,
  isPosCatalogSellable,
  type OfflineSaleItem,
  type PosCatalogProduct,
  type PosCatalogSnapshot,
} from '../lib/posCatalogCache';

type SnapshotApi = {
  branchId: string;
  organizationId: string;
  generatedAt: string;
  count: number;
  products: Array<Record<string, unknown>>;
};

/** Intervalo de refresco en segundo plano (online). */
const REFRESH_MS = 10 * 60 * 1000;
/** Mínimo entre resync por foco / visibilidad. */
const FOCUS_STALE_MS = 45_000;

export function mapApiProductToCatalog(row: Record<string, unknown>): PosCatalogProduct {
  return {
    id: String(row.id),
    name: String(row.name || ''),
    internal_code: String(row.internal_code || ''),
    barcode: row.barcode == null || row.barcode === '' ? null : String(row.barcode),
    sale_price: String(row.sale_price ?? '0'),
    brand:
      row.brand_name != null && String(row.brand_name).trim()
        ? String(row.brand_name)
        : row.brand == null
          ? null
          : String(row.brand),
    size_label: row.size_label == null ? null : String(row.size_label),
    color: row.color == null ? null : String(row.color),
    allows_exchange: Boolean(row.allows_exchange),
    allows_return: Boolean(row.allows_return),
    tracks_stock: row.tracks_stock === undefined ? true : Boolean(row.tracks_stock),
    status: row.status == null ? undefined : String(row.status),
    updated_at: row.updated_at == null ? undefined : String(row.updated_at),
    stock: Number(row.stock) || 0,
    photo_url: row.photo_url == null || row.photo_url === '' ? null : String(row.photo_url),
    category_name: row.category_name == null ? null : String(row.category_name),
  };
}

/**
 * Snapshot POS por sucursal.
 * Online: GET fresco a /api/sales/pos-snapshot (no pinta IndexedDB primero).
 * Offline: lectura local del último snapshot, filtrado.
 * Resync al montar (online), al volver online, por intervalo, y al foco si está stale (≥45s).
 */
export function usePosCatalog(branchId: string | null | undefined) {
  const { online } = useNetworkStatus();
  const [products, setProducts] = useState<PosCatalogProduct[]>([]);
  const [meta, setMeta] = useState<Omit<PosCatalogSnapshot, 'products'> | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const lastOnline = useRef(online);
  const syncInFlightRef = useRef(false);
  const lastSyncAtRef = useRef(0);
  const onlineRef = useRef(online);
  onlineRef.current = online;

  const applySnapshot = useCallback((snap: PosCatalogSnapshot, opts?: { stale?: boolean }) => {
    setProducts(snap.products);
    setMeta({
      branchId: snap.branchId,
      organizationId: snap.organizationId,
      generatedAt: snap.generatedAt,
      count: snap.count,
    });
    setStale(Boolean(opts?.stale));
  }, []);

  const loadLocal = useCallback(
    async (id: string) => {
      const snap = await loadPosSnapshot(id);
      if (snap) applySnapshot(snap, { stale: true });
      return snap;
    },
    [applySnapshot],
  );

  const syncFromApi = useCallback(
    async (id: string, _opts?: { force?: boolean }) => {
      void _opts;
      if (syncInFlightRef.current) return null;
      syncInFlightRef.current = true;
      setSyncing(true);
      setError('');
      try {
        const data = await api<SnapshotApi>('/api/sales/pos-snapshot');
        const mapped = filterPosCatalogProducts((data.products || []).map(mapApiProductToCatalog));
        const snap: PosCatalogSnapshot = {
          branchId: data.branchId || id,
          organizationId: data.organizationId,
          generatedAt: data.generatedAt || new Date().toISOString(),
          count: data.count ?? mapped.length,
          products: mapped,
        };
        await savePosSnapshot(snap);
        applySnapshot(snap, { stale: false });
        lastSyncAtRef.current = Date.now();
        return snap;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'No se pudo actualizar el catálogo';
        setError(msg);
        throw err;
      } finally {
        syncInFlightRef.current = false;
        setSyncing(false);
      }
    },
    [applySnapshot],
  );

  /** Estable: no recrear en cada render (evita loops en effects de PosPage). */
  const refresh = useCallback(async () => {
    if (!branchId) return null;
    return syncFromApi(branchId, { force: true });
  }, [branchId, syncFromApi]);

  // Carga inicial / cambio de sucursal (no re-disparar solo por online: eso va aparte).
  useEffect(() => {
    if (!branchId) {
      setProducts([]);
      setMeta(null);
      setLoading(false);
      setStale(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        if (onlineRef.current) {
          try {
            await syncFromApi(branchId, { force: true });
          } catch {
            const local = await loadLocal(branchId);
            if (!local && !cancelled) {
              setError('Sin catálogo. Revisa la conexión e intenta de nuevo.');
            }
          }
        } else {
          const local = await loadLocal(branchId);
          if (cancelled) return;
          if (!local) {
            setError('Sin catálogo guardado. Conéctate una vez para descargar la Caja.');
          } else {
            setStale(true);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [branchId, loadLocal, syncFromApi]);

  // Al recuperar red: una sync.
  useEffect(() => {
    if (!branchId) return;
    if (online && !lastOnline.current) {
      void syncFromApi(branchId, { force: true }).catch(() => undefined);
    }
    lastOnline.current = online;
  }, [online, branchId, syncFromApi]);

  // Refresco periódico en segundo plano.
  useEffect(() => {
    if (!branchId || !online) return;
    const id = branchId;
    const t = window.setInterval(() => {
      void syncFromApi(id).catch(() => undefined);
    }, REFRESH_MS);
    return () => window.clearInterval(t);
  }, [branchId, online, syncFromApi]);

  // Foco / pestaña visible: solo si el snapshot está stale (> FOCUS_STALE_MS).
  useEffect(() => {
    if (!branchId || !online) return;
    const id = branchId;

    function maybeResync() {
      if (document.visibilityState !== 'visible') return;
      if (syncInFlightRef.current) return;
      if (Date.now() - lastSyncAtRef.current < FOCUS_STALE_MS) return;
      void syncFromApi(id).catch(() => undefined);
    }

    document.addEventListener('visibilitychange', maybeResync);
    window.addEventListener('focus', maybeResync);
    return () => {
      document.removeEventListener('visibilitychange', maybeResync);
      window.removeEventListener('focus', maybeResync);
    };
  }, [branchId, online, syncFromApi]);

  useEffect(() => {
    if (!branchId || !online) return;
    const id = branchId;
    function onRefresh() {
      void syncFromApi(id, { force: true }).catch(() => undefined);
    }
    window.addEventListener('lscala:pos-catalog-refresh', onRefresh);
    return () => window.removeEventListener('lscala:pos-catalog-refresh', onRefresh);
  }, [branchId, online, syncFromApi]);

  const findByCode = useCallback(
    (code: string) => findPosProductByCode(products, code),
    [products],
  );

  const search = useCallback(
    (q: string, limit = 30) => searchPosCatalog(products, q, limit),
    [products],
  );

  const applyLocalSale = useCallback(
    async (items: OfflineSaleItem[]) => {
      if (!branchId || !items.length) return null;
      const next = await applyLocalStockDelta(branchId, items);
      if (next) applySnapshot(next, { stale: true });
      return next;
    },
    [applySnapshot, branchId],
  );

  /** Incorpora respuesta fresca de /by-code al estado + IndexedDB (solo prendas vendibles). */
  const rememberProduct = useCallback(
    async (row: Record<string, unknown>) => {
      const mapped = mapApiProductToCatalog(row);
      if (!isPosCatalogSellable(mapped)) return mapped;
      setProducts((prev) => {
        const idx = prev.findIndex((p) => p.id === mapped.id);
        if (idx < 0) return [...prev, mapped];
        const next = [...prev];
        next[idx] = { ...next[idx], ...mapped };
        return next;
      });
      if (branchId) {
        await upsertPosCatalogProduct(branchId, mapped).catch(() => undefined);
      }
      return mapped;
    },
    [branchId],
  );

  return {
    products,
    meta,
    loading,
    syncing,
    stale,
    error,
    ready: products.length > 0,
    findByCode,
    search,
    applyLocalSale,
    rememberProduct,
    refresh,
  };
}
