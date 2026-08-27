import { parseChileMoney } from './chileMoney';

export type PurchaseStatus =
  | 'pending_reception'
  | 'partially_received'
  | 'received'
  | 'cancelled'
  | string;

export type Purchase = {
  id: string;
  status: PurchaseStatus;
  invoice_number: string | null;
  document_type?: string | null;
  created_at: string;
  purchased_at?: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  notes?: string | null;
  destination_branch_id?: string | null;
  destination_branch_name?: string | null;
  items_count?: number | string | null;
  qty_ordered?: number | string | null;
  qty_received?: number | string | null;
};

export type PurchaseItem = {
  id: string;
  description: string;
  quantity_ordered: number;
  quantity_received: number;
  product_id: string | null;
  unit_cost: string | number;
  suggested_sale_price: string | number | null;
  /** Joined from product when linked (backend may omit until wired) */
  product_name?: string | null;
  photo_url?: string | null;
  size_label?: string | null;
  color?: string | null;
  /** Precio venta del producto vinculado (si viene del API) */
  sale_price?: string | number | null;
};

/**
 * Precio de venta para piso (recepción): el fijado en la compra/línea.
 * No expone ni usa el costo en la UI; el fallback 2× es solo numérico interno.
 * Usa parseChileMoney: "12990.00" (SQL) y "12.990" (Chile) → entero correcto.
 */
export function lineFloorSalePrice(
  line: {
    suggested_sale_price?: string | number | null;
    unit_cost?: string | number | null;
    sale_price?: string | number | null;
  },
  priceMultiplier = 2,
): number {
  const suggested = parseChileMoney(line.suggested_sale_price);
  if (suggested != null && suggested >= 0) return suggested;
  const linked = parseChileMoney(line.sale_price);
  if (linked != null && linked >= 0) return linked;
  const cost = parseChileMoney(line.unit_cost);
  if (cost != null && cost >= 0) {
    return Math.round(cost * priceMultiplier);
  }
  return 0;
}

export function statusLabel(status: PurchaseStatus) {
  switch (status) {
    case 'pending_reception':
      return 'Pendiente';
    case 'partially_received':
      return 'Parcial';
    case 'received':
      return 'Recibido';
    case 'cancelled':
      return 'Anulado';
    default:
      return status;
  }
}

export function statusBadgeClass(status: PurchaseStatus) {
  switch (status) {
    case 'pending_reception':
      return 'badge warning';
    case 'partially_received':
      return 'badge brand';
    case 'received':
      return 'badge success';
    default:
      return 'badge';
  }
}

export function purchaseRef(p: Pick<Purchase, 'invoice_number' | 'id' | 'document_type'>) {
  const num = p.invoice_number?.trim();
  if (!num) return 'Sin documento';
  const type = (p.document_type || '').toLowerCase();
  const label =
    type === 'factura'
      ? 'Factura'
      : type === 'boleta'
        ? 'Boleta'
        : type === 'guia'
          ? 'Guía'
          : type === 'otro'
            ? 'Doc.'
            : '';
  return label ? `${label} ${num}` : num;
}

/** CTA de fila: recepcionar vs solo consultar. */
export function purchaseActionLabel(status: PurchaseStatus) {
  if (status === 'received' || status === 'cancelled') return 'Revisar';
  return 'Ingresar';
}

export function purchaseProgress(p: Purchase) {
  const ordered = Number(p.qty_ordered ?? 0);
  const received = Number(p.qty_received ?? 0);
  const lines = Number(p.items_count ?? 0);
  return { ordered, received, lines };
}

export function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat('es-CL', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
