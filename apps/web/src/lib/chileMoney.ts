/**
 * Montos CLP en inputs: puntos de miles (Chile). Enteros (sin decimales).
 * Al guardar: parseChileMoney → number.
 *
 * Distingue:
 * - Miles Chile: "12.990" / "1.299.000" (punto = miles)
 * - Decimal SQL/JSON: "12990.00" (un solo punto + 1–2 decimales) → 12990
 *   Sin esto, digitsOnly quita el punto y "12990.00" → 1299000 (bug ×100).
 */

/**
 * Normaliza string monetario a solo dígitos del entero CLP.
 * Vacío → "".
 */
export function digitsOnlyMoney(raw: string): string {
  let s = String(raw ?? '').trim();
  if (!s) return '';

  // Quita símbolo peso / espacios raros
  s = s.replace(/\$/g, '').replace(/\s/g, '').trim();
  if (!s) return '';

  // Decimal SQL/JSON: "12990.00" | "12990.5" | "0.50" — un solo punto, 1–2 decimales
  if (/^-?\d+\.\d{1,2}$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return String(Math.round(Math.abs(n)));
  }

  // Chile / paste: puntos (o comas) como miles → solo dígitos
  return s
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

/** Parsea input formateado, crudo o decimal SQL a entero CLP. Vacío → null. */
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

/** Valor numérico o string API → string para input con miles Chile. */
export function chileMoneyFromNumber(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const n = parseChileMoney(value);
  if (n == null) return '';
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(n);
}
