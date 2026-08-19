/**
 * Nombres de cola CUPS/Agent vs nombres “bonitos” del SO.
 * Ej.: Brother_DCP_T520W ≡ Brother DCP-T520W
 */

/** Clave comparable: trim, case-insensitive, `_` / `-` / espacios ≈ mismos separadores. */
export function normalizePrinterKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function printerNamesMatch(a: string, b: string): boolean {
  const ka = normalizePrinterKey(a);
  const kb = normalizePrinterKey(b);
  return Boolean(ka && kb && ka === kb);
}

/** Nombre exacto del Agent/CUPS si hay equivalencia; si no, null. */
export function findCanonicalPrinterName(
  savedOrInput: string,
  agentNames: readonly string[],
): string | null {
  const key = normalizePrinterKey(savedOrInput);
  if (!key) return null;
  const hit = agentNames.find((n) => normalizePrinterKey(n) === key);
  return hit ?? null;
}

/**
 * Para prefs/UI: si el Agent conoce la impresora, usa su nombre canónico;
 * si no, deja el valor guardado (texto libre).
 */
export function resolvePrinterName(
  savedOrInput: string,
  agentNames: readonly string[],
): string {
  const trimmed = savedOrInput.trim();
  if (!trimmed) return '';
  return findCanonicalPrinterName(trimmed, agentNames) ?? trimmed;
}
