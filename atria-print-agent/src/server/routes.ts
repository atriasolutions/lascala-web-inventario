import type { Response, Router } from 'express';
import { Router as createRouter } from 'express';
import type { AgentConfig } from '../config/index.js';
import { AGENT_NAME, AGENT_VERSION } from '../config/index.js';
import { executeHtmlPrint, executeRawPrint } from '../jobs/printService.js';
import { jobQueue } from '../jobs/queue.js';
import { logger } from '../logging/logger.js';
import type { PrinterAdapter } from '../printer/index.js';
import { PrinterError } from '../printer/index.js';

function jsonJob(res: Response, httpStatus: number, job: {
  id: string;
  status: string;
  printer?: string;
  error?: string;
  message?: string;
  format?: string;
}, ok: boolean): void {
  res.status(httpStatus).json({
    ok,
    jobId: job.id,
    status: job.status,
    printer: job.printer,
    format: job.format,
    error: job.error,
    message: job.message,
  });
}

export function createRoutes(config: AgentConfig, printer: PrinterAdapter): Router {
  const router = createRouter();

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      ok: true,
      agent: AGENT_NAME,
      name: AGENT_NAME,
      version: AGENT_VERSION,
      platform: process.platform,
      agentId: config.agentId,
      host: '127.0.0.1',
      port: config.port,
    });
  });

  router.get('/printers', async (_req, res) => {
    try {
      const printers = await printer.listPrinters();
      res.json({
        printers,
        platform: process.platform,
        source:
          printers[0]?.source ??
          (process.platform === 'darwin' ? 'cups' : process.platform === 'win32' ? 'winspool' : 'stub'),
      });
    } catch (err) {
      if (err instanceof PrinterError) {
        logger.error('printers.list_failed', { code: err.code, message: err.message });
        res.status(500).json({ error: err.code, message: err.message, printers: [] });
        return;
      }
      logger.error('printers.list_failed', { err: String(err) });
      res.status(500).json({
        error: 'PRINTERS_LIST_FAILED',
        message: 'No se pudo listar impresoras',
        printers: [],
      });
    }
  });

  router.get('/printers/:name/status', async (req, res) => {
    const name = decodeURIComponent(req.params.name ?? '').trim();
    if (!name) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Nombre de impresora requerido' });
      return;
    }
    try {
      const info = await printer.getPrinterStatus(name);
      res.json({ printer: info });
    } catch (err) {
      if (err instanceof PrinterError && err.code === 'PRINTER_NOT_FOUND') {
        res.status(404).json({ error: err.code, message: err.message });
        return;
      }
      if (err instanceof PrinterError) {
        res.status(500).json({ error: err.code, message: err.message });
        return;
      }
      logger.error('printers.status_failed', { err: String(err), name });
      res.status(500).json({
        error: 'PRINTERS_STATUS_FAILED',
        message: 'No se pudo obtener el estado de la impresora',
      });
    }
  });

  router.get('/jobs/:id', (req, res) => {
    const id = (req.params.id ?? '').trim();
    const job = jobQueue.get(id);
    if (!job) {
      res.status(404).json({ error: 'JOB_NOT_FOUND', message: `Job no encontrado: ${id}` });
      return;
    }
    res.json({ job });
  });

  async function handleRawPrint(req: { body?: unknown }, res: Response): Promise<void> {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    try {
      const result = await executeRawPrint(printer, body);
      jsonJob(res, result.httpStatus, result.job, result.ok);
    } catch (err) {
      if (err instanceof PrinterError) {
        const httpStatus =
          err.code === 'UNSUPPORTED_FORMAT' || err.code === 'INVALID_REQUEST'
            ? 400
            : err.code === 'UNSUPPORTED'
              ? 501
              : 500;
        res.status(httpStatus).json({
          ok: false,
          error: err.code,
          message: err.message,
        });
        return;
      }
      logger.error('print.raw.unexpected', { err: String(err) });
      res.status(500).json({
        ok: false,
        error: 'PRINT_FAILED',
        message: 'Error inesperado al imprimir',
      });
    }
  }

  async function handleHtmlPrint(req: { body?: unknown }, res: Response): Promise<void> {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    try {
      const result = await executeHtmlPrint(printer, body);
      jsonJob(res, result.httpStatus, result.job, result.ok);
    } catch (err) {
      if (err instanceof PrinterError) {
        const httpStatus =
          err.code === 'UNSUPPORTED_FORMAT' || err.code === 'INVALID_REQUEST'
            ? 400
            : err.code === 'UNSUPPORTED'
              ? 501
              : 500;
        res.status(httpStatus).json({
          ok: false,
          error: err.code,
          message: err.message,
        });
        return;
      }
      logger.error('print.html.unexpected', { err: String(err) });
      res.status(500).json({
        ok: false,
        error: 'PRINT_FAILED',
        message: 'Error inesperado al imprimir el comprobante',
      });
    }
  }

  router.post('/print/raw', (req, res) => {
    void handleRawPrint(req, res);
  });

  /** Alias: raw/tspl → printRaw; html → printHtml. */
  router.post('/print', (req, res) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const format = String(body.format ?? 'raw').toLowerCase();
    if (format === 'html') {
      void handleHtmlPrint(req, res);
      return;
    }
    void handleRawPrint(req, res);
  });

  router.post('/print/html', (req, res) => {
    void handleHtmlPrint(req, res);
  });

  return router;
}
