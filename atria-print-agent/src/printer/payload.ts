import type { PrinterStatus } from './printer.interface.js';
import { PrinterError } from './printer.interface.js';

export type PrintFormat = 'tspl' | 'raw';

export type DecodedPrintPayload = {
  format: PrintFormat;
  /** Bytes exactos a enviar al spooler (TSPL UTF-8 / ASCII). */
  bytes: Buffer;
  /** Vista texto para logs (truncada / sin secretos). */
  preview: string;
};

/**
 * Decodifica body de POST /print|/print/raw.
 * `copies` del body se ignora si el TSPL ya trae `PRINT n,1` (paridad QZ: un solo job).
 */
export function decodePrintPayload(body: Record<string, unknown>): DecodedPrintPayload {
  const formatRaw = body.format;
  const format =
    formatRaw === undefined || formatRaw === null || formatRaw === ''
      ? 'raw'
      : String(formatRaw).toLowerCase();

  if (format !== 'tspl' && format !== 'raw') {
    throw new PrinterError(
      'UNSUPPORTED_FORMAT',
      `Formato no soportado: ${String(formatRaw)}. Usa "tspl" o "raw". HTML = POST /print/html (Fase 7).`,
    );
  }

  const encoding =
    body.encoding === undefined || body.encoding === null || body.encoding === ''
      ? 'utf8'
      : String(body.encoding).toLowerCase();

  if (encoding !== 'utf8' && encoding !== 'base64') {
    throw new PrinterError(
      'INVALID_REQUEST',
      `encoding inválido: ${encoding}. Usa "utf8" o "base64".`,
    );
  }

  const data = body.data;
  let bytes: Buffer;
  if (typeof data === 'string') {
    if (!data.length) {
      throw new PrinterError('INVALID_REQUEST', 'data vacío');
    }
    if (encoding === 'base64') {
      try {
        bytes = Buffer.from(data, 'base64');
      } catch {
        throw new PrinterError('INVALID_REQUEST', 'data base64 inválido');
      }
      if (!bytes.length) {
        throw new PrinterError('INVALID_REQUEST', 'data base64 vacío');
      }
    } else {
      bytes = Buffer.from(data, 'utf8');
    }
  } else if (data && typeof data === 'object' && ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    bytes = Buffer.from(view.buffer, view.byteOffset, view.byteLength);
  } else {
    throw new PrinterError(
      'INVALID_REQUEST',
      'Falta data (string TSPL/raw o base64). El Agent no genera etiquetas — envía el mismo string que buildLabelTspl.',
    );
  }

  const preview = bytes.toString('utf8').slice(0, 120).replace(/\r/g, '\\r').replace(/\n/g, '\\n');
  return { format: format as PrintFormat, bytes, preview };
}

export function assertPrinterReady(info: { name: string; status: PrinterStatus }): void {
  if (info.status === 'offline') {
    throw new PrinterError('PRINTER_OFFLINE', `Impresora fuera de línea: ${info.name}`);
  }
  if (info.status === 'paused') {
    throw new PrinterError('PRINTER_OFFLINE', `Impresora pausada/deshabilitada: ${info.name}`);
  }
}
