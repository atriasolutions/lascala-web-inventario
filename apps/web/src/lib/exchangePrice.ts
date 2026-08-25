/**
 * Comparación de precio de venta en CLP (enteros) para cambios de ticket.
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
