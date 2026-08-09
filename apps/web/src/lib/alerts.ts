import { useEffect, useState } from 'react';
import { api } from './api';

export type LowStockAlert = {
  product_id: string;
  name: string;
  internal_code: string;
  quantity: number;
};

export type NoMovementAlert = {
  id: string;
  name: string;
  internal_code: string;
  quantity: number;
  last_movement_at: string | null;
};

export type ExpiringVoucher = {
  id: string;
  voucher_number: string;
  product_name: string;
  expires_at: string;
};

export type AlertsResponse = {
  lowStock: LowStockAlert[];
  noMovement: NoMovementAlert[];
  vouchersExpiring: ExpiringVoucher[];
  generatedAt: string;
};

export type AlertItem = {
  id: string;
  severity: 'high' | 'medium';
  category: 'stock' | 'rotacion' | 'voucher';
  title: string;
  detail: string;
  to: string;
};

const POLL_MS = 60_000;

export function useAlerts() {
  const [data, setData] = useState<AlertsResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval>;

    async function load() {
      try {
        const res = await api<AlertsResponse>('/api/dashboard/alerts');
        if (!cancelled) {
          setData(res);
          setError('');
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error al cargar alertas');
      }
    }

    load();
    timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const items: AlertItem[] = data
    ? [
        ...data.lowStock.map((a) => ({
          id: `low-${a.product_id}`,
          severity: a.quantity <= 0 ? ('high' as const) : ('medium' as const),
          category: 'stock' as const,
          title: a.quantity <= 0 ? 'Quiebre de stock' : 'Stock bajo',
          detail: `${a.name} (${a.internal_code}) · quedan ${a.quantity}`,
          to: '/inventario',
        })),
        ...data.noMovement.map((a) => ({
          id: `nomove-${a.id}`,
          severity: 'medium' as const,
          category: 'rotacion' as const,
          title: 'Sin movimiento',
          detail: `${a.name} (${a.internal_code}) · ${
            a.last_movement_at ? `desde ${new Date(a.last_movement_at).toLocaleDateString('es-CL')}` : 'sin ventas registradas'
          }`,
          to: '/movimientos',
        })),
        ...data.vouchersExpiring.map((v) => ({
          id: `voucher-${v.id}`,
          severity: 'medium' as const,
          category: 'voucher' as const,
          title: 'Voucher por vencer',
          detail: `${v.voucher_number} · ${v.product_name} · vence ${new Date(v.expires_at).toLocaleDateString('es-CL')}`,
          to: '/mermas',
        })),
      ]
    : [];

  return { items, loading: !data && !error, error, generatedAt: data?.generatedAt };
}
