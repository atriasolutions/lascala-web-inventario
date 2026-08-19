import type { PrinterInfo, PrinterStatus } from '../printer.interface.js';

/**
 * Parseo de salida PowerShell / CIM para Winspool (sin native addon).
 *
 * Decisión Fase 3: `Get-CimInstance Win32_Printer` vía PowerShell.
 * - Disponible en Windows 10/11 boutique sin instalar Node addons.
 * - Evita node-gyp / Visual Studio Build Tools en PCs de tienda.
 * - Bindings (`@luckykiet/node-printer`, etc.) se re-evalúan en Fase 4 (print RAW).
 */

export type WinPrinterRow = {
  Name?: string;
  Default?: boolean;
  PrinterStatus?: number;
  WorkOffline?: boolean;
  PortName?: string;
  Shared?: boolean;
  Network?: boolean;
  Local?: boolean;
};

/** MSDN Win32_Printer.PrinterStatus */
export function mapWinPrinterStatus(status?: number, workOffline?: boolean): PrinterStatus {
  if (workOffline) return 'offline';
  switch (status) {
    case 3: // Idle
      return 'idle';
    case 4: // Printing
    case 5: // Warmup
      return 'printing';
    case 6: // Stopped Printing
    case 1: // Other / often paused-ish
      return 'paused';
    case 7: // Offline
      return 'offline';
    case 2: // Unknown
      return 'unknown';
    default:
      return status == null ? 'unknown' : 'error';
  }
}

function inferType(row: WinPrinterRow): string | undefined {
  const port = (row.PortName ?? '').toLowerCase();
  if (row.Network || port.startsWith('ipp') || port.startsWith('http') || port.includes('wnsd')) {
    return 'network';
  }
  if (port.startsWith('usb') || port.startsWith('dot4')) return 'usb';
  if (port.startsWith('file:') || port.includes('pdf') || port.includes('xps')) return 'virtual';
  if (row.Local) return 'local';
  return port ? 'local' : undefined;
}

export function parseWinPrinterRows(rows: WinPrinterRow[]): PrinterInfo[] {
  const printers: PrinterInfo[] = [];
  for (const row of rows) {
    const name = row.Name?.trim();
    if (!name) continue;
    printers.push({
      name,
      status: mapWinPrinterStatus(row.PrinterStatus, row.WorkOffline),
      isDefault: Boolean(row.Default),
      source: 'winspool',
      type: inferType(row),
    });
  }
  return printers.sort((a, b) => a.name.localeCompare(b.name));
}

/** PowerShell puede devolver objeto único o array. */
export function parseWinPrinterJson(stdout: string): PrinterInfo[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed) as WinPrinterRow | WinPrinterRow[];
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return parseWinPrinterRows(rows);
}

/** Script embebido — Select-Object + ConvertTo-Json. */
export const WIN_LIST_PRINTERS_PS = [
  'Get-CimInstance -ClassName Win32_Printer |',
  'Select-Object Name,Default,PrinterStatus,WorkOffline,PortName,Shared,Network,Local |',
  'ConvertTo-Json -Compress',
].join(' ');
