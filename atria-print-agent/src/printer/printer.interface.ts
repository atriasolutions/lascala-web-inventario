export type PrinterSource = 'stub' | 'cups' | 'winspool';

/** Estados normalizados para SPA / UI. */
export type PrinterStatus =
  | 'idle'
  | 'printing'
  | 'paused'
  | 'offline'
  | 'error'
  | 'unknown';

export type PrinterInfo = {
  name: string;
  status: PrinterStatus;
  isDefault: boolean;
  source: PrinterSource;
  type?: string;
};

export type PrintFormat = 'tspl' | 'raw';

export type PrintRawJob = {
  printer: string;
  /** String TSPL/raw (utf8). Preferir `bytes` si ambos vienen. */
  data: string;
  encoding?: 'utf8' | 'base64';
  jobName?: string;
  format?: PrintFormat;
  /** Bytes exactos al spooler (evita re-encode). */
  bytes?: Buffer;
};

/** Comprobante HTML (80 mm). No usar -o raw / Winspool RAW. */
export type PrintHtmlJob = {
  printer: string;
  html: string;
  jobName?: string;
  widthMm?: number;
};

export type PrintResult = {
  ok: boolean;
  jobId?: string;
  error?: string;
  message?: string;
};

export class PrinterError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'PrinterError';
    this.code = code;
  }
}

/**
 * Adaptador de impresora por plataforma.
 * Las rutas HTTP no hacen `if (win32)` — solo hablan con esta interfaz.
 */
export interface PrinterAdapter {
  readonly platform: NodeJS.Platform;
  listPrinters(): Promise<PrinterInfo[]>;
  getPrinterStatus(name: string): Promise<PrinterInfo>;
  printRaw(job: PrintRawJob): Promise<PrintResult>;
  /** Comprobantes: PDF/HTML vía CUPS (sin raw) o equivalente Windows. */
  printHtml(job: PrintHtmlJob): Promise<PrintResult>;
}
