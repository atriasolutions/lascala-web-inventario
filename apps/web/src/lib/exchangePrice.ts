/**
 * Comparación / diferencia de precio de venta en CLP (enteros) para cambios de ticket.
 */
export function clpExact(value: string | number | null | undefined): number {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(/\s/g, ''));
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n);
}

/** true si ambos precios son CLP enteros iguales. */
export function sameSalePriceExact(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): boolean {
  const pa = clpExact(a);
  const pb = clpExact(b);
  return Number.isFinite(pa) && Number.isFinite(pb) && pa === pb;
}

export type ExchangePriceKind = 'same' | 'more_expensive' | 'cheaper';

export function exchangePriceDiff(
  returnedPrice: string | number | null | undefined,
  newPrice: string | number | null | undefined,
): { returned: number; neu: number; diff: number; kind: ExchangePriceKind } {
  const returned = clpExact(returnedPrice);
  const neu = clpExact(newPrice);
  if (!Number.isFinite(returned) || !Number.isFinite(neu)) {
    return { returned: NaN, neu: NaN, diff: NaN, kind: 'same' };
  }
  const diff = neu - returned;
  const kind: ExchangePriceKind = diff === 0 ? 'same' : diff > 0 ? 'more_expensive' : 'cheaper';
  return { returned, neu, diff, kind };
}
