import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PrinterAdapter, PrinterInfo, PrintHtmlJob, PrintRawJob, PrintResult } from '../printer/printer.interface.js';
import { PrinterError } from '../printer/printer.interface.js';
import { SAMPLE_LABEL_TSPL } from '../fixtures/sampleTspl.js';
import { executeHtmlPrint, executeRawPrint } from './printService.js';
import { jobQueue } from './queue.js';

function mockAdapter(overrides: Partial<PrinterAdapter> = {}): PrinterAdapter {
  const base: PrinterAdapter = {
    platform: 'darwin',
    async listPrinters(): Promise<PrinterInfo[]> {
      return [
        {
          name: 'Xprinter_XP-420B',
          status: 'idle',
          isDefault: false,
          source: 'cups',
          type: 'usb',
        },
      ];
    },
    async getPrinterStatus(name: string): Promise<PrinterInfo> {
      if (name !== 'Xprinter_XP-420B') {
        throw new PrinterError('PRINTER_NOT_FOUND', `Impresora no encontrada: ${name}`);
      }
      return {
        name,
        status: 'idle',
        isDefault: false,
        source: 'cups',
        type: 'usb',
      };
    },
    async printRaw(_job: PrintRawJob): Promise<PrintResult> {
      return { ok: true };
    },
    async printHtml(_job: PrintHtmlJob): Promise<PrintResult> {
      return { ok: true };
    },
  };
  return { ...base, ...overrides };
}

describe('executeRawPrint', () => {
  it('completes job with sample TSPL', async () => {
    const result = await executeRawPrint(mockAdapter(), {
      printer: 'Xprinter_XP-420B',
      format: 'tspl',
      data: SAMPLE_LABEL_TSPL,
      jobName: 'sample',
    });
    assert.equal(result.ok, true);
    assert.equal(result.httpStatus, 200);
    assert.equal(result.job.status, 'completed');
    assert.ok(jobQueue.get(result.job.id));
  });

  it('returns 404 when printer missing', async () => {
    const result = await executeRawPrint(mockAdapter(), {
      printer: 'NoExiste',
      format: 'raw',
      data: SAMPLE_LABEL_TSPL,
    });
    assert.equal(result.ok, false);
    assert.equal(result.httpStatus, 404);
    assert.equal(result.job.error, 'PRINTER_NOT_FOUND');
    assert.equal(result.job.status, 'failed');
  });

  it('returns 409 when printer offline', async () => {
    const adapter = mockAdapter({
      async getPrinterStatus(name: string) {
        return {
          name,
          status: 'offline',
          isDefault: false,
          source: 'cups',
        };
      },
    });
    const result = await executeRawPrint(adapter, {
      printer: 'Xprinter_XP-420B',
      data: SAMPLE_LABEL_TSPL,
    });
    assert.equal(result.ok, false);
    assert.equal(result.httpStatus, 409);
    assert.equal(result.job.error, 'PRINTER_OFFLINE');
  });

  it('rejects bad format before queue', async () => {
    await assert.rejects(
      () =>
        executeRawPrint(mockAdapter(), {
          printer: 'Xprinter_XP-420B',
          format: 'pdf',
          data: 'x',
        }),
      (err: unknown) => err instanceof PrinterError && err.code === 'UNSUPPORTED_FORMAT',
    );
  });
});

describe('executeHtmlPrint', () => {
  it('completes html job', async () => {
    const result = await executeHtmlPrint(mockAdapter(), {
      printer: 'Xprinter_XP-420B',
      html: '<html><body><p>Venta 1</p></body></html>',
      jobName: 'comprobante',
      widthMm: 80,
    });
    assert.equal(result.ok, true);
    assert.equal(result.httpStatus, 200);
    assert.equal(result.job.status, 'completed');
    assert.equal(result.job.format, 'escpos');
  });

  it('rejects empty html', async () => {
    await assert.rejects(
      () =>
        executeHtmlPrint(mockAdapter(), {
          printer: 'Xprinter_XP-420B',
          html: '   ',
        }),
      (err: unknown) => err instanceof PrinterError && err.code === 'INVALID_REQUEST',
    );
  });

  it('accepts sample smoke without html', async () => {
    const adapter = mockAdapter({
      async printRaw() {
        return { ok: true };
      },
    });
    const result = await executeHtmlPrint(adapter, {
      printer: 'Xprinter_XP-420B',
      sample: true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.job.format, 'escpos');
  });
});
