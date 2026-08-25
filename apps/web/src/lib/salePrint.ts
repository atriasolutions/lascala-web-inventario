/**
 * Comprobante térmico L'Scala (Calama).
 * Papel: 80 mm retail Chile. Copy Chile, tono boutique.
 */
export const THERMAL_PAPER_WIDTH_MM = 80;

export const SALE_BUSINESS = {
  legalName: "BOUTIQUE L'SCALA SPA",
  rut: '78.164.515-K',
  address: 'Eleuterio Ramírez 2120, Calama',
  logoUrl: '/brand/lscala-logo.png',
  city: 'Calama',
} as const;

export const CHANGE_TICKET_DAYS = 7;

export const NON_TAX_DISCLAIMER =
  'Documento interno. No reemplaza boleta ni factura tributaria.';

/** Pie corto (vouchers). */
export const CHANGE_POLICY_SHORT =
  'Presentar este ticket. Solo prendas habilitadas.';

/**
 * Políticas en comprobante — tono corporativo, 2–3 líneas máx.
 */
export const RECEIPT_CHANGE_RULES: readonly string[] = [
  `Cambio: ${CHANGE_TICKET_DAYS} días, prenda en buen estado con ticket.`,
  'No aplica a vestidos de fiesta u otras exclusiones.',
];

/** @deprecated Alias; las reglas van solo en el comprobante. */
export const VOUCHER_RULES = RECEIPT_CHANGE_RULES;

export const VOUCHER_NON_TAX = 'Doc. interno.';

/** @deprecated */
export const DEFAULT_VOUCHER_CONDITIONS = RECEIPT_CHANGE_RULES.join(' ');

/** Marcador que el Agent convierte en corte parcial ESC/POS. */
export const ESC_POS_CUT_MARKER = '- - - corte - - -';

/** Marcador → wordmark ESC/POS (bitmap no es estable en térmicas baratas). */
export const ESC_POS_LOGO_MARKER = '[[[LOGO]]]';

/** Marcador → Code128 ESC/POS en el Agent (SVG se pierde al convertir a texto). */
export function escPosBarcodeMarker(code: string): string {
  const c = code.trim();
  return c ? `[[[BARCODE:${c}]]]` : '';
}

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

/** Código de pistola de la prenda (LS…). */
export function resolveVoucherScanCode(t: Pick<ChangeTicketPrint, 'barcode' | 'internalCode'>): string {
  return (t.barcode || t.internalCode || '').trim();
}

/**
 * Code128 en 80 mm (módulo 2): tope conservador para que no se corte el trazo.
 * `VC-000095` entra holgado; si no cabe, se recorta a ASCII.
 */
export const ACCESS_BARCODE_MAX_LEN = 22;

function asciiPrintable(s: string) {
  return /^[\x20-\x7E]+$/.test(s);
}

/**
 * Barcode Ticket = `VC-…` único de esa prenda (no el n° de venta: chocaría dos tickets).
 * Caption debajo = el mismo payload. La boleta va solo como texto `Venta V-…`.
 */
export function resolveAccessScanCode(t: Pick<ChangeTicketPrint, 'voucherNumber'>): string {
  const voucher = (t.voucherNumber || '').trim();
  if (voucher && voucher.length <= ACCESS_BARCODE_MAX_LEN && asciiPrintable(voucher)) {
    return voucher;
  }
  return voucher.replace(/[^\x20-\x7E]/g, '').slice(0, ACCESS_BARCODE_MAX_LEN);
}

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

/** Línea tipo caja registradora: label izq + valor der (48 cols = 80 mm). */
export function thermalPadLine(left: string, right: string, cols = 48): string {
  const l = left.trim();
  const r = right.trim();
  const gap = Math.max(1, cols - l.length - r.length);
  return `${l}${' '.repeat(gap)}${r}`.slice(0, cols);
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
    // Un voucher por unidad elegible (como tiendas): si qty>1 y un solo voucher, repetir bloque.
    const voucher = byItem.get(item.id) || vouchers.find((v) => v.product_id === item.product_id);
    const barcode =
      (voucher?.barcode || item.barcode || '').trim() ||
      (voucher?.internal_code || item.internal_code || '').trim() ||
      null;
    const units = Math.max(1, Math.floor(Number(item.quantity) || 1));
    for (let u = 0; u < units; u++) {
      tickets.push({
        key: `${voucher?.id || item.id}-${u}`,
        voucherNumber:
          voucher?.voucher_number && units === 1
            ? voucher.voucher_number
            : voucher?.voucher_number
              ? `${voucher.voucher_number}${units > 1 ? `-${u + 1}` : ''}`
              : `REIMP-${sale.receipt_number}-${u + 1}`,
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
  }
  return tickets;
}
