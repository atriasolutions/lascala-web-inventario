export const SALE_PAYMENT_METHODS = ['cash', 'card'] as const;
export type SalePaymentMethod = (typeof SALE_PAYMENT_METHODS)[number];

export function parseSalePaymentMethod(raw: unknown, fallback: SalePaymentMethod = 'cash'): SalePaymentMethod {
  if (raw === 'cash' || raw === 'card') return raw;
  return fallback;
}

/** Query param opcional: vacío = sin filtro. */
export function parseSalePaymentMethodFilter(raw: unknown): SalePaymentMethod | null {
  if (raw === 'cash' || raw === 'card') return raw;
  return null;
}
