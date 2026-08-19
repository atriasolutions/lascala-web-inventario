import { MacosPrinterAdapter } from './macos/index.js';
import type {
  PrinterAdapter,
  PrinterInfo,
  PrintHtmlJob,
  PrintRawJob,
  PrintResult,
} from './printer.interface.js';
import { PrinterError } from './printer.interface.js';
import { WindowsPrinterAdapter } from './windows/index.js';

export type {
  PrinterAdapter,
  PrinterInfo,
  PrinterStatus,
  PrinterSource,
  PrintHtmlJob,
  PrintRawJob,
  PrintResult,
} from './printer.interface.js';
export { PrinterError } from './printer.interface.js';

/** Plataformas fuera de alcance boutique (Linux, etc.). */
class UnsupportedPrinterAdapter implements PrinterAdapter {
  readonly platform: NodeJS.Platform;

  constructor(platform: NodeJS.Platform) {
    this.platform = platform;
  }

  async listPrinters(): Promise<PrinterInfo[]> {
    return [];
  }

  async getPrinterStatus(name: string): Promise<PrinterInfo> {
    throw new PrinterError('PRINTER_NOT_FOUND', `Impresora no encontrada: ${name}`);
  }

  async printRaw(_job: PrintRawJob): Promise<PrintResult> {
    return { ok: false, error: 'UNSUPPORTED', message: 'Plataforma no soportada' };
  }

  async printHtml(_job: PrintHtmlJob): Promise<PrintResult> {
    return { ok: false, error: 'UNSUPPORTED', message: 'Plataforma no soportada' };
  }
}

export function createPrinterAdapter(): PrinterAdapter {
  switch (process.platform) {
    case 'win32':
      return new WindowsPrinterAdapter();
    case 'darwin':
      return new MacosPrinterAdapter();
    default:
      return new UnsupportedPrinterAdapter(process.platform);
  }
}
