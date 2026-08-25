import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useNetworkStatus } from '../lib/networkStatus';
import {
  OFFLINE_SALES_EVENT,
  countPendingOfflineSales,
} from '../lib/posCatalogCache';
import {
  OFFLINE_SYNC_EVENT,
  isOfflineSyncing,
  syncOfflineSalesQueue,
} from '../lib/offlineSalesSync';

/** Banner offline / cola pendiente — Caja y resto de módulos. */
export function OfflineBanner() {
  const { online, checking, refresh } = useNetworkStatus();
  const { branchId } = useAuth();
  const { pathname } = useLocation();
  const onPos = pathname.startsWith('/vender');
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(() => isOfflineSyncing());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!branchId) {
        if (!cancelled) setPending(0);
        return;
      }
      const n = await countPendingOfflineSales(branchId);
      if (!cancelled) setPending(n);
    }
    void load();
    function onSales() {
      void load();
    }
    function onSync() {
      setSyncing(isOfflineSyncing());
    }
    window.addEventListener(OFFLINE_SALES_EVENT, onSales);
    window.addEventListener(OFFLINE_SYNC_EVENT, onSync);
    return () => {
      cancelled = true;
      window.removeEventListener(OFFLINE_SALES_EVENT, onSales);
      window.removeEventListener(OFFLINE_SYNC_EVENT, onSync);
    };
  }, [branchId]);

  async function retry() {
    if (online && branchId && pending > 0) {
      await syncOfflineSalesQueue(branchId);
      return;
    }
    await refresh();
  }

  if (online && pending > 0) {
    return (
      <div className="net-offline-banner net-offline-banner--pending" role="status" aria-live="polite">
        <p className="net-offline-banner-text">
          <strong>
            {pending} venta{pending === 1 ? '' : 's'} pendiente{pending === 1 ? '' : 's'} de
            sincronizar.
          </strong>{' '}
          {syncing ? 'Enviando al servidor…' : 'Se envían al servidor automáticamente.'}
        </p>
        <button
          type="button"
          className="btn ghost net-offline-banner-btn"
          onClick={() => void retry()}
          disabled={syncing}
        >
          {syncing ? 'Enviando…' : 'Reintentar'}
        </button>
      </div>
    );
  }

  if (online) return null;

  return (
    <div className="net-offline-banner" role="status" aria-live="polite">
      <p className="net-offline-banner-text">
        <strong>Sin conexión.</strong>{' '}
        {checking
          ? 'Comprobando la red…'
          : onPos
            ? pending > 0
              ? `Puedes seguir vendiendo. Hay ${pending} venta${pending === 1 ? '' : 's'} guardada${
                  pending === 1 ? '' : 's'
                } en este equipo; se enviarán al volver la red.`
              : 'Puedes buscar, escanear y guardar ventas en este equipo. Se enviarán al volver la red.'
            : pending > 0
              ? `Este módulo necesita internet. Hay ${pending} venta${pending === 1 ? '' : 's'} pendiente${
                  pending === 1 ? '' : 's'
                } — ve a Ventas o reconecta.`
              : 'Este módulo necesita internet. Puedes ir a Ventas con el catálogo de este equipo.'}
      </p>
      <button
        type="button"
        className="btn ghost net-offline-banner-btn"
        onClick={() => void retry()}
        disabled={checking}
      >
        {checking ? 'Revisando…' : 'Reintentar'}
      </button>
    </div>
  );
}
