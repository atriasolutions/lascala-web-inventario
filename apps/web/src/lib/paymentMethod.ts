export const PAYMENT_METHODS = ['cash', 'card'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
};

export function paymentMethodLabel(raw: string | null | undefined): string {
  if (raw === 'cash' || raw === 'card') return PAYMENT_METHOD_LABEL[raw];
  return PAYMENT_METHOD_LABEL.cash;
}

export function isPaymentMethod(raw: unknown): raw is PaymentMethod {
  return raw === 'cash' || raw === 'card';
}
