/**
 * Montos CLP en inputs: puntos de miles (Chile). Enteros (sin decimales).
 * Al guardar: parseChileMoney → number.
 */

/** Quita basura y deja solo dígitos (y un signo opcional). */
export function digitsOnlyMoney(raw: string): string {
  return String(raw ?? '')
    .replace(/\./g, '')
    .replace(/,/g, '')
    .replace(/[^\d]/g, '');
}

/** Formatea mientras se escribe: "1234567" → "1.234.567". */
export function formatChileMoneyInput(raw: string): string {
  const digits = digitsOnlyMoney(raw);
  if (!digits) return '';
  const n = Number(digits);
  if (!Number.isFinite(n)) return '';
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(n);
}

/** Parsea input formateado o crudo a entero CLP. Vacío → null. */
export function parseChileMoney(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? Math.round(raw) : null;
  }
  const digits = digitsOnlyMoney(raw);
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

/** Valor numérico → string para input con miles. */
export function chileMoneyFromNumber(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'number' ? value : Number(digitsOnlyMoney(String(value)) || value);
  if (!Number.isFinite(n)) return '';
  return formatChileMoneyInput(String(Math.round(n)));
}
