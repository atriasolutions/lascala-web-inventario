import { expandProductCodeVariants } from './inventory.js';
import { isPartyDress } from './voucherFulfill.js';

export function isFulfillableVoucherStatus(status: string) {
  return status === 'open' || status === 'expired';
}

export type SaleVoucherPickRow = {
  status: string;
  internal_code: string;
  barcode: string | null;
};

export type SaleVoucherPick =
  | { result: 'empty' }
  | { result: 'need_garment'; openCount: number; usedCount: number; total: number }
  | { result: 'picked'; index: number }
  | { result: 'all_closed'; usedCount: number; total: number }
  | { result: 'garment_used'; index: number; openSiblings: number }
  | { result: 'garment_unknown' };

export function garmentMatchesVoucher(
  row: SaleVoucherPickRow,
  garmentVariants: string[],
): boolean {
  if (!garmentVariants.length) return false;
  const want = new Set(garmentVariants);
  const codes = [row.internal_code, row.barcode].filter(Boolean) as string[];
  for (const code of codes) {
    for (const v of expandProductCodeVariants(code)) {
      if (want.has(v)) return true;
    }
  }
  return false;
}

/**
 * Varios tickets de la misma venta son independientes.
 * Sin pistola de prenda, si hay más de un vigente hay que pedir la prenda.
 */
export function pickVoucherForSaleLookup<T extends SaleVoucherPickRow>(
  rows: T[],
  garmentVariants: string[],
): SaleVoucherPick {
  if (!rows.length) return { result: 'empty' };

  const fulfillable = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => isFulfillableVoucherStatus(r.status));
  const usedCount = rows.filter((r) => r.status === 'used' || r.status === 'cancelled').length;

  if (garmentVariants.length) {
    const matching = rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => garmentMatchesVoucher(r, garmentVariants));
    if (!matching.length) return { result: 'garment_unknown' };
    const openMatch = matching.filter(({ r }) => isFulfillableVoucherStatus(r.status));
    if (openMatch.length) return { result: 'picked', index: openMatch[0].i };
    return {
      result: 'garment_used',
      index: matching[0].i,
      openSiblings: fulfillable.length,
    };
  }

  if (fulfillable.length === 1) return { result: 'picked', index: fulfillable[0].i };
  if (fulfillable.length > 1) {
    return {
      result: 'need_garment',
      openCount: fulfillable.length,
      usedCount,
      total: rows.length,
    };
  }
  return { result: 'all_closed', usedCount, total: rows.length };
}

export function saleLookupClosedMessage() {
  return 'Todos los tickets de esta venta ya fueron usados o anulados.';
}

export function saleLookupGarmentUsedMessage(openSiblings: number) {
  if (openSiblings > 0) {
    return 'Esta prenda ya tiene el ticket usado. Pistolea la otra prenda de la misma venta.';
  }
  return 'Esta prenda ya tiene el ticket usado.';
}

export function voucherBlockedReason(status: string): string | null {
  if (status === 'used') return 'Este ticket ya fue usado';
  if (status === 'cancelled') return 'Este ticket está anulado';
  return null;
}

export function voucherApiPayload(
  row: {
    id: string;
    status: string;
    voucher_number: string;
    issued_at: string;
    expires_at: string;
    conditions: string | null;
    product_id: string;
    sale_id: string | null;
    branch_id: string;
    branch_name: string;
    branch_code: string;
    product_name: string;
    internal_code: string;
    barcode: string | null;
    photo_url: string | null;
    size_label: string | null;
    color: string | null;
    allows_exchange: boolean;
    allows_return: boolean;
    category_slug: string | null;
    sale_price: string;
    receipt_number: string | null;
    sold_at: string | null;
    line_total: string | null;
    unit_price: string | null;
    line_qty: number | null;
    units_used?: number | null;
  },
  today: string,
) {
  const expired = row.expires_at < today || row.status === 'expired';
  const unitsTotal = Math.max(1, Number(row.line_qty) || 1);
  const unitsUsed = Math.max(0, Number(row.units_used) || 0);
  const unitsRemaining = Math.max(0, unitsTotal - unitsUsed);
  const fulfillableStatus = isFulfillableVoucherStatus(row.status);
  const canFulfill = fulfillableStatus && unitsRemaining > 0;
  let blockedReason = voucherBlockedReason(row.status);
  if (!blockedReason && fulfillableStatus && unitsRemaining <= 0) {
    blockedReason = 'Este ticket ya fue usado por completo';
  }
  return {
    id: row.id,
    voucher_number: row.voucher_number,
    status: row.status,
    issued_at: row.issued_at,
    expires_at: row.expires_at,
    expired,
    days_left: Math.round(
      (new Date(row.expires_at + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) /
        86_400_000,
    ),
    conditions: row.conditions,
    branch: { id: row.branch_id, name: row.branch_name, code: row.branch_code },
    product: {
      id: row.product_id,
      name: row.product_name,
      internal_code: row.internal_code,
      barcode: row.barcode,
      photo_url: row.photo_url,
      sale_price: row.sale_price,
      allows_exchange: row.allows_exchange,
      allows_return: row.allows_return,
      size_label: row.size_label,
      color: row.color,
    },
    sale: row.sale_id
      ? {
          id: row.sale_id,
          receipt_number: row.receipt_number,
          sold_at: row.sold_at,
          line_total: row.line_total,
          unit_price: row.unit_price,
          quantity: row.line_qty,
        }
      : null,
    unitsTotal,
    unitsUsed,
    unitsRemaining,
    warnPartyDress: isPartyDress({
      allows_exchange: row.allows_exchange,
      category_slug: row.category_slug,
    }),
    canFulfill,
    blockedReason,
  };
}
