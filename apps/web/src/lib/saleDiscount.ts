/** Descuentos POS: mismos presets y redondeo CLP (×500) que el API. */

export const SALE_DISCOUNT_PRESETS = [5, 10, 15, 20, 25, 30] as const;

/** Paso de redondeo del monto descontado (CLP). */
export const DISCOUNT_ROUND_STEP = 500;

export type SaleDiscountPreset = (typeof SALE_DISCOUNT_PRESETS)[number];
export type SaleDiscountPct = 0 | SaleDiscountPreset;

export function roundClp(n: number): number {
  return Math.round(Number(n) || 0);
}

/**
 * Redondea al múltiplo de 500 más cercano (CLP).
 * Ej.: 2145→2000, 798→1000, 749→500, 750→1000.
 */
export function roundDiscountClp(n: number): number {
  const v = Number(n) || 0;
  if (v <= 0) return 0;
  return Math.round(v / DISCOUNT_ROUND_STEP) * DISCOUNT_ROUND_STEP;
}

/** Monto de descuento: % → CLP → múltiplo de 500, sin superar la base. */
export function discountAmountFromPct(baseClp: number, pct: number): number {
  const base = Math.max(0, roundClp(baseClp));
  if (base <= 0 || !(pct > 0)) return 0;
  const raw = roundClp((base * pct) / 100);
  let amount = roundDiscountClp(raw);
  if (amount > base) {
    amount = Math.floor(base / DISCOUNT_ROUND_STEP) * DISCOUNT_ROUND_STEP;
  }
  return Math.max(0, amount);
}

export function isSaleDiscountPct(n: unknown): n is SaleDiscountPct {
  const v = Number(n);
  if (v === 0) return true;
  return (SALE_DISCOUNT_PRESETS as readonly number[]).includes(v);
}

export function parseSaleDiscountPct(raw: unknown): SaleDiscountPct {
  if (raw === null || raw === undefined || raw === '') return 0;
  const v = Number(raw);
  if (!Number.isFinite(v)) return 0;
  const n = Math.round(v);
  if (n === 0) return 0;
  if ((SALE_DISCOUNT_PRESETS as readonly number[]).includes(n)) return n as SaleDiscountPct;
  return 0;
}

export function lineSaleAmounts(unitPrice: number, quantity: number, discountPct: number) {
  const qty = Math.max(0, Math.floor(Number(quantity) || 0));
  const price = Math.max(0, Number(unitPrice) || 0);
  const pct = isSaleDiscountPct(discountPct) ? discountPct : 0;
  const lineSubtotal = roundClp(price * qty);
  const discountAmount = discountAmountFromPct(lineSubtotal, pct);
  const lineTotal = Math.max(lineSubtotal - discountAmount, 0);
  return { lineSubtotal, discountPct: pct as SaleDiscountPct, discountAmount, lineTotal };
}

export function saleGlobalAmounts(
  lineTotals: number[],
  globalDiscountPct: number,
): { subtotal: number; discountPct: SaleDiscountPct; discount: number; total: number } {
  const pct = isSaleDiscountPct(globalDiscountPct) ? globalDiscountPct : 0;
  const subtotal = roundClp(lineTotals.reduce((s, n) => s + (Number(n) || 0), 0));
  const discount = discountAmountFromPct(subtotal, pct);
  const total = Math.max(subtotal - discount, 0);
  return { subtotal, discountPct: pct as SaleDiscountPct, discount, total };
}

export function discountPctLabel(pct: number): string {
  const n = Number(pct) || 0;
  return n > 0 ? `${n}%` : '';
}
