/**
 * Margen de boutique: sugerido ≈ 2× Precio costo.
 * Alerta si p. venta &lt; 1.5× costo (markup bajo).
 */

/** Multiplicador mínimo p.venta / Precio costo antes de alertar (default 1.5). */
export const MIN_SALE_COST_MULTIPLIER = 1.5;

/** Multiplicador sugerido del dominio. */
export const SUGGESTED_SALE_COST_MULTIPLIER = 2;

export type MarginInfo = {
  cost: number;
  sale: number;
  /** Venta − costo (CLP). */
  amount: number;
  /** (venta − costo) / costo × 100. */
  markupPct: number;
  /** (venta − costo) / venta × 100. */
  marginPct: number;
  /** venta / costo. */
  ratio: number;
  suggestedSale: number;
  isLow: boolean;
};

export function computeMargin(
  costRaw: number | null | undefined,
  saleRaw: number | null | undefined,
  minMultiplier = MIN_SALE_COST_MULTIPLIER,
): MarginInfo | null {
  const cost = Number(costRaw);
  const sale = Number(saleRaw);
  if (!Number.isFinite(cost) || cost <= 0) return null;
  if (!Number.isFinite(sale) || sale <= 0) return null;
  const amount = sale - cost;
  const markupPct = (amount / cost) * 100;
  const marginPct = (amount / sale) * 100;
  const ratio = sale / cost;
  return {
    cost,
    sale,
    amount,
    markupPct,
    marginPct,
    ratio,
    suggestedSale: Math.round(cost * SUGGESTED_SALE_COST_MULTIPLIER),
    isLow: ratio < minMultiplier,
  };
}
