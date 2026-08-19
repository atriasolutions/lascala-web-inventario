/**
 * Preferencias locales de impresoras (Mac / Windows).
 *
 * Con QZ Tray: envío directo a la impresora nombrada.
 * Sin QZ / fallo: fallback a window.print() + modal recordatorio.
 */

export type PrintProfileId = 'labels' | 'receipts';

export type PrintProfile = {
  /** Nombre exacto en el SO / QZ (texto libre o elegido de la lista). */
  printerName: string;
  /** Nota visible en UI (tamaño / modelo). */
  note: string;
};

export type PrintPrefs = {
  labels: PrintProfile;
  receipts: PrintProfile;
  /** Preferir QZ cuando esté disponible; si falla, usa el navegador. */
  preferQzWhenAvailable: boolean;
};

/** Integración QZ Tray activa. */
export const QZ_TRAY_ENABLED = true;

const STORAGE_KEY = 'lscala_print_prefs_v1';

export const DEFAULT_PRINT_PREFS: PrintPrefs = {
  labels: {
    printerName: '',
    note: 'Rollo 50 × 25 mm · códigos de barras / etiquetas',
  },
  receipts: {
    printerName: '',
    note: 'Térmica ticket 80 mm · ESC/POS (no etiquetas TSPL ni inkjet)',
  },
  preferQzWhenAvailable: true,
};

export function loadPrintPrefs(): PrintPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        ...DEFAULT_PRINT_PREFS,
        labels: { ...DEFAULT_PRINT_PREFS.labels },
        receipts: { ...DEFAULT_PRINT_PREFS.receipts },
      };
    }
    const parsed = JSON.parse(raw) as Partial<PrintPrefs>;
    return {
      labels: {
        printerName: String(parsed.labels?.printerName ?? '').trim(),
        note: String(parsed.labels?.note ?? DEFAULT_PRINT_PREFS.labels.note),
      },
      receipts: {
        printerName: String(parsed.receipts?.printerName ?? '').trim(),
        note: String(parsed.receipts?.note ?? DEFAULT_PRINT_PREFS.receipts.note),
      },
      preferQzWhenAvailable:
        parsed.preferQzWhenAvailable === undefined
          ? true
          : Boolean(parsed.preferQzWhenAvailable),
    };
  } catch {
    return {
      ...DEFAULT_PRINT_PREFS,
      labels: { ...DEFAULT_PRINT_PREFS.labels },
      receipts: { ...DEFAULT_PRINT_PREFS.receipts },
    };
  }
}

export function savePrintPrefs(prefs: PrintPrefs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  window.dispatchEvent(new CustomEvent('lscala:print-prefs'));
}

export function getProfile(id: PrintProfileId): PrintProfile {
  const prefs = loadPrintPrefs();
  return id === 'labels' ? prefs.labels : prefs.receipts;
}

export function profileTitle(id: PrintProfileId) {
  return id === 'labels' ? 'Impresora de etiquetas' : 'Impresora de comprobantes';
}

export function profilePaperHint(id: PrintProfileId) {
  return id === 'labels' ? '50 × 25 mm' : '80 mm térmico';
}
