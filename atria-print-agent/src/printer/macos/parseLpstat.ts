import type { PrinterInfo, PrinterStatus } from '../printer.interface.js';

/**
 * Parseo de salida `lpstat` (CUPS).
 * Preferimos LANG=C, pero macOS a menudo localiza mensajes → soportamos EN + ES.
 */

const DEFAULT_RE =
  /(?:system default destination|destino por omisi[oó]n del sistema)\s*:\s*(.+)\s*$/im;

/** Línea de impresora: EN "printer X is idle." / ES "la impresora X está inactiva." */
const PRINTER_LINE_RE =
  /^(?:printer\s+(.+?)\s+(?:is\s+|now\s+)?(.+?)(?:\.|$)|la impresora\s+(.+?)\s+est[aá]\s+(.+?)(?:\.|$))/i;

function mapCupsState(raw: string): PrinterStatus {
  const s = raw.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (/offline|fuera de linea|no disponible/.test(s)) return 'offline';
  if (/disabled|deshabilitad|paused|detenid|stopped|stopped printing/.test(s)) return 'paused';
  if (/printing|imprimiendo|now printing/.test(s)) return 'printing';
  if (/idle|inactiv|ready|lista|acept/.test(s)) return 'idle';
  if (/error|fault|falla/.test(s)) return 'error';
  return 'unknown';
}

function inferType(deviceUri?: string): string | undefined {
  if (!deviceUri) return undefined;
  const u = deviceUri.toLowerCase();
  if (u.startsWith('usb:')) return 'usb';
  if (u.startsWith('dnssd:') || u.startsWith('ipp:') || u.startsWith('ipps:') || u.startsWith('socket:')) {
    return 'network';
  }
  if (u.startsWith('file:') || u.includes('cups-pdf') || u.includes('pdf')) return 'virtual';
  return 'local';
}

export function parseLpstatDefault(stdout: string): string | null {
  const m = stdout.match(DEFAULT_RE);
  if (!m) return null;
  const name = m[1].trim();
  return name && name.toLowerCase() !== 'none' ? name : null;
}

/**
 * Parsea `lpstat -p` (y opcionalmente mezcla con -d en el mismo stdout).
 */
export function parseLpstatPrinters(
  lpstatP: string,
  opts: { defaultName?: string | null; devices?: Record<string, string> } = {},
): PrinterInfo[] {
  const defaultName = opts.defaultName ?? parseLpstatDefault(lpstatP);
  const byName = new Map<string, PrinterInfo>();

  for (const line of lpstatP.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const m = trimmed.match(PRINTER_LINE_RE);
    if (!m) continue;

    const name = (m[1] ?? m[3] ?? '').trim();
    const stateRaw = (m[2] ?? m[4] ?? '').trim();
    if (!name) continue;

    const device = opts.devices?.[name];
    byName.set(name, {
      name,
      status: mapCupsState(stateRaw),
      isDefault: defaultName != null && name === defaultName,
      source: 'cups',
      type: inferType(device),
    });
  }

  // Si solo conocemos el default y no hubo líneas (salida vacía / locale raro), no inventamos.
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** `lpstat -v` → device for NAME: uri */
export function parseLpstatDevices(stdout: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(/^(?:device for|dispositivo para)\s+(.+?):\s*(.+)\s*$/i);
    if (m) out[m[1].trim()] = m[2].trim();
  }
  return out;
}
