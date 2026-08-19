import type { PrinterAdapter } from '../printer/index.js';
import { PrinterError } from '../printer/index.js';
import { assertPrinterReady, decodePrintPayload } from '../printer/payload.js';
import { logger } from '../logging/logger.js';
import { jobQueue, type PrintJobRecord } from './queue.js';

export type PrintRequestBody = Record<string, unknown>;

export type PrintServiceResult = {
  ok: boolean;
  job: PrintJobRecord;
  httpStatus: number;
};

/**
 * Orquesta validación → cola serial → PrinterAdapter.printRaw.
 * Un solo envío al spooler; las N copias viven en `PRINT n,1` del TSPL (como QZ).
 */
export async function executeRawPrint(
  printer: PrinterAdapter,
  body: PrintRequestBody,
): Promise<PrintServiceResult> {
  const printerName = typeof body.printer === 'string' ? body.printer.trim() : '';
  if (!printerName) {
    throw new PrinterError('INVALID_REQUEST', 'Campo printer requerido');
  }

  const jobName = typeof body.jobName === 'string' ? body.jobName : undefined;
  const payload = decodePrintPayload(body);

  // copies en body: no duplicar jobs. Solo log si alguien lo manda aparte del TSPL.
  if (body.copies != null) {
    logger.info('print.copies_ignored', {
      copies: body.copies,
      note: 'Las copias deben ir en PRINT n,1 del TSPL (paridad QZ). Un solo job.',
    });
  }

  const job = jobQueue.create({
    printer: printerName,
    jobName,
    format: payload.format,
  });

  try {
    const final = await jobQueue.runSerial(job.id, async () => {
      const info = await printer.getPrinterStatus(printerName);
      assertPrinterReady(info);

      logger.info('print.raw.start', {
        jobId: job.id,
        printer: printerName,
        format: payload.format,
        bytes: payload.bytes.length,
        preview: payload.preview,
      });

      const result = await printer.printRaw({
        printer: printerName,
        data: payload.bytes.toString('utf8'),
        encoding: 'utf8',
        jobName,
        format: payload.format,
        bytes: payload.bytes,
      });

      if (!result.ok) {
        throw new PrinterError(
          result.error || 'PRINT_FAILED',
          result.message || result.error || 'PRINT_FAILED',
        );
      }
    });

    return { ok: true, job: final, httpStatus: 200 };
  } catch (err) {
    const code = err instanceof PrinterError ? err.code : 'PRINT_FAILED';
    const message = err instanceof Error ? err.message : String(err);
    const failed = jobQueue.get(job.id) ?? job;
    if (failed.status !== 'failed') {
      jobQueue.markFailed(job.id, code, message);
    }
    const httpStatus =
      code === 'INVALID_REQUEST' || code === 'UNSUPPORTED_FORMAT'
        ? 400
        : code === 'PRINTER_NOT_FOUND'
          ? 404
          : code === 'PRINTER_OFFLINE'
            ? 409
            : code === 'UNSUPPORTED'
              ? 501
              : 500;
    return {
      ok: false,
      job: jobQueue.get(job.id) ?? failed,
      httpStatus,
    };
  }
}

/**
 * Comprobante: HTML → ESC/POS → printRaw.
 * Nunca envía PDF/HTML a la cola (térmicas ESC/POS lo imprimen como basura).
 * body.sample === true → job corto de prueba (~6 líneas + corte).
 */
export async function executeHtmlPrint(
  printer: PrinterAdapter,
  body: PrintRequestBody,
): Promise<PrintServiceResult> {
  const printerName = typeof body.printer === 'string' ? body.printer.trim() : '';
  if (!printerName) {
    throw new PrinterError('INVALID_REQUEST', 'Campo printer requerido');
  }

  const isSample = body.sample === true || body.sample === '1' || body.sample === 1;
  const html = typeof body.html === 'string' ? body.html : '';
  if (!isSample && !html.trim()) {
    throw new PrinterError('INVALID_REQUEST', 'Campo html requerido (o sample:true para prueba corta)');
  }

  const jobName =
    typeof body.jobName === 'string'
      ? body.jobName
      : isSample
        ? 'comprobante-prueba'
        : 'comprobante';
  const widthMm =
    typeof body.widthMm === 'number' && Number.isFinite(body.widthMm) ? body.widthMm : 80;

  const job = jobQueue.create({
    printer: printerName,
    jobName,
    format: 'escpos',
  });

  try {
    const final = await jobQueue.runSerial(job.id, async () => {
      const info = await printer.getPrinterStatus(printerName);
      assertPrinterReady(info);

      if (isSample) {
        const { buildEscPosSmokeTest } = await import('../printer/escposReceipt.js');
        const bytes = buildEscPosSmokeTest();
        logger.info('print.escpos.smoke', {
          jobId: job.id,
          printer: printerName,
          bytes: bytes.length,
        });
        const result = await printer.printRaw({
          printer: printerName,
          data: '',
          bytes,
          jobName,
          format: 'raw',
        });
        if (!result.ok) {
          throw new PrinterError(
            result.error || 'PRINT_FAILED',
            result.message || 'No se pudo imprimir la prueba ESC/POS',
          );
        }
        return;
      }

      logger.info('print.escpos.start', {
        jobId: job.id,
        printer: printerName,
        htmlBytes: Buffer.byteLength(html, 'utf8'),
        widthMm,
      });

      const result = await printer.printHtml({
        printer: printerName,
        html,
        jobName,
        widthMm,
      });

      if (!result.ok) {
        throw new PrinterError(
          result.error || 'PRINT_FAILED',
          result.message || result.error || 'PRINT_FAILED',
        );
      }
    });

    return { ok: true, job: final, httpStatus: 200 };
  } catch (err) {
    const code = err instanceof PrinterError ? err.code : 'PRINT_FAILED';
    const message = err instanceof Error ? err.message : String(err);
    const failed = jobQueue.get(job.id) ?? job;
    if (failed.status !== 'failed') {
      jobQueue.markFailed(job.id, code, message);
    }
    const httpStatus =
      code === 'INVALID_REQUEST' || code === 'UNSUPPORTED_FORMAT'
        ? 400
        : code === 'PRINTER_NOT_FOUND'
          ? 404
          : code === 'PRINTER_OFFLINE'
            ? 409
            : code === 'UNSUPPORTED'
              ? 501
              : 500;
    return {
      ok: false,
      job: jobQueue.get(job.id) ?? failed,
      httpStatus,
    };
  }
}
