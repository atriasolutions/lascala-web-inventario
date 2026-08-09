/**
 * Comprobante térmico L'Scala (Calama).
 * Papel objetivo: 80 mm de ancho (estándar retail Chile); alto según contenido (rollo).
 * CSS: @page thermal-80mm + layout 76 mm útiles.
 */
export const THERMAL_PAPER_WIDTH_MM = 80;

export const SALE_BUSINESS = {
  legalName: 'BOUTIQUE L SCALA SPA',
  rut: '78.164.515-K',
  address: 'Eleuterio Ramirez 2120, Calama',
  logoUrl: '/brand/lscala-logo-mark.png',
  city: 'Calama',
} as const;

export const CHANGE_TICKET_DAYS = 7;

export const NON_TAX_DISCLAIMER =
  'Este documento no es válido como boleta ni factura tributaria. No reemplaza la boleta electrónica del SII.';

/** Pie / reglas del comprobante de venta (NO se imprimen en cada voucher). */
export const CHANGE_POLICY_SHORT =
  'Presentar el ticket de cambio. Solo prendas habilitadas.';

/**
 * Condiciones de cambio/devolución — solo en el comprobante de venta.
 */
export const RECEIPT_CHANGE_RULES: readonly string[] = [
  `Plazo: ${CHANGE_TICKET_DAYS} días corridos desde la fecha de compra.`,
  'Prenda en buen estado: sin manchas, olores (tabaco) ni daños.',
  'No aplica a vestidos de fiesta ni prendas sin cambio/devolución.',
];

/** @deprecated Alias; las reglas van solo en el comprobante. */
export const VOUCHER_RULES = RECEIPT_CHANGE_RULES;

export const VOUCHER_NON_TAX = 'Doc. interno. No válido tributariamente.';

/** @deprecated */
export const DEFAULT_VOUCHER_CONDITIONS = RECEIPT_CHANGE_RULES.join(' ');

export type SalePrintSale = {
  id?: string;
  receipt_number: string;
  total: string;
  subtotal?: string;
  discount: string;
  sold_at: string;
  seller_name: string;
  pos_name: string;
  branch_name?: string;
  notes: string | null;
};

export type SalePrintItem = {
  id: string;
  product_id: string;
  name: string;
  internal_code: string;
  barcode?: string | null;
  size_label?: string | null;
  color?: string | null;
  quantity: number;
  unit_price: string;
  line_total: string;
  allows_exchange: boolean;
  allows_return: boolean;
};

export type SalePrintVoucher = {
  id: string;
  sale_item_id: string | null;
  product_id: string;
  voucher_number: string;
  expires_at: string;
  conditions: string | null;
  product_name: string;
  internal_code: string;
  barcode?: string | null;
  size_label?: string | null;
  color?: string | null;
};

export type ChangeTicketPrint = {
  key: string;
  voucherNumber: string;
  productName: string;
  internalCode: string;
  /** Código de barras del producto; si falta, se usa internalCode para Code128. */
  barcode: string | null;
  sizeLabel: string | null;
  color: string | null;
  receiptNumber: string;
  soldAt: string;
  expiresAt: string | null;
  mode: 'cambio' | 'devolucion' | 'ambos';
};

export type SalePrintJob = {
  sale: SalePrintSale;
  items: SalePrintItem[];
  changeTickets: ChangeTicketPrint[];
  reprint?: boolean;
};

export function fmtPrintDateTime(d: string) {
  return new Date(d).toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtPrintDateOnly(d: string) {
  const raw = d.length <= 10 ? `${d}T12:00:00` : d;
  return new Date(raw).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function daysSinceSale(soldAt: string) {
  const sold = new Date(soldAt);
  const startSold = new Date(sold.getFullYear(), sold.getMonth(), sold.getDate());
  const now = new Date();
  const startNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((startNow.getTime() - startSold.getTime()) / 86_400_000);
}

export function withinChangeWindow(soldAt: string) {
  return daysSinceSale(soldAt) <= CHANGE_TICKET_DAYS;
}

export function allowsChangeTicket(item: SalePrintItem) {
  return Boolean(item.allows_exchange || item.allows_return);
}

export function ticketMode(item: SalePrintItem): ChangeTicketPrint['mode'] {
  if (item.allows_exchange && item.allows_return) return 'ambos';
  if (item.allows_return) return 'devolucion';
  return 'cambio';
}

export function ticketModeLabel(mode: ChangeTicketPrint['mode']) {
  if (mode === 'ambos') return 'CAMBIO / DEVOLUCIÓN';
  if (mode === 'devolucion') return 'DEVOLUCIÓN';
  return 'CAMBIO';
}

export function buildChangeTickets(
  sale: SalePrintSale,
  items: SalePrintItem[],
  vouchers: SalePrintVoucher[],
): ChangeTicketPrint[] {
  const byItem = new Map(vouchers.map((v) => [v.sale_item_id || '', v]));
  const tickets: ChangeTicketPrint[] = [];
  for (const item of items) {
    if (!allowsChangeTicket(item)) continue;
    const voucher = byItem.get(item.id) || vouchers.find((v) => v.product_id === item.product_id);
    const barcode =
      (voucher?.barcode || item.barcode || '').trim() ||
      (voucher?.internal_code || item.internal_code || '').trim() ||
      null;
    tickets.push({
      key: voucher?.id || item.id,
      voucherNumber: voucher?.voucher_number || `REIMP-${sale.receipt_number}`,
      productName: voucher?.product_name || item.name,
      internalCode: voucher?.internal_code || item.internal_code,
      barcode,
      sizeLabel: voucher?.size_label ?? item.size_label ?? null,
      color: voucher?.color ?? item.color ?? null,
      receiptNumber: sale.receipt_number,
      soldAt: sale.sold_at,
      expiresAt: voucher?.expires_at ?? null,
      mode: ticketMode(item),
    });
  }
  return tickets;
}
