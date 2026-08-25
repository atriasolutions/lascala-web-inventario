/**
 * Normaliza códigos leídos por pistola / teclado en Caja e Ingresos.
 * Serie LS###### (histórico LS-######); BC* = legado de etiqueta.
 */

/** Quita basura típica de wedge (apóstrofe por guión, espacios). */
export function normalizeScanCode(code: string): string {
  return code.trim().replace(/['`´]/g, '').toUpperCase();
}

/**
 * Variantes equivalentes para match:
 * BC000003 ↔ BC-000003; LS100007 ↔ LS-100007 (también padding a 6).
 */
export function expandProductCodeVariants(code: string): string[] {
  const n = normalizeScanCode(code);
  if (!n) return [];
  const keys = new Set<string>([n]);

  const bc = n.match(/^BC-?(\d+)$/);
  if (bc) {
    const digits = bc[1];
    keys.add(`BC${digits}`);
    keys.add(`BC-${digits}`);
    if (digits.length < 6) {
      const padded = digits.padStart(6, '0');
      keys.add(`BC${padded}`);
      keys.add(`BC-${padded}`);
    }
  }

  const ls = n.match(/^LS-?(\d+)$/i);
  if (ls) {
    const digits = ls[1];
    keys.add(`LS${digits}`);
    keys.add(`LS-${digits}`);
    if (digits.length < 6) {
      const padded = digits.padStart(6, '0');
      keys.add(`LS${padded}`);
      keys.add(`LS-${padded}`);
    }
  }

  return [...keys];
}

export function codesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false;
  const left = expandProductCodeVariants(String(a));
  const right = new Set(expandProductCodeVariants(String(b)));
  if (!left.length || !right.size) return false;
  return left.some((k) => right.has(k));
}
