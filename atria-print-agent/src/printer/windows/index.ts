import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { CommandRunner } from '../commandRunner.js';
import { defaultCommandRunner } from '../commandRunner.js';
import { htmlToEscPosReceipt } from '../escposReceipt.js';
import type {
  PrinterAdapter,
  PrinterInfo,
  PrintHtmlJob,
  PrintRawJob,
  PrintResult,
} from '../printer.interface.js';
import { PrinterError } from '../printer.interface.js';
import { parseWinPrinterJson, WIN_LIST_PRINTERS_PS } from './parseWinPrinters.js';
import { WIN_RAW_PRINT_PS } from './rawPrintPs.js';

/**
 * Adaptador Windows: listado CIM + print RAW vía Winspool (PowerShell Add-Type).
 * HTML: PDF vía Chrome/Edge headless + PrintTo, o texto Out-Printer.
 */
export class WindowsPrinterAdapter implements PrinterAdapter {
  readonly platform = 'win32' as const;
  private readonly run: CommandRunner;

  constructor(run: CommandRunner = defaultCommandRunner) {
    this.run = run;
  }

  async listPrinters(): Promise<PrinterInfo[]> {
    const result = await this.run(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WIN_LIST_PRINTERS_PS],
      { timeoutMs: 15_000 },
    );

    if (result.code !== 0 && !result.stdout.trim()) {
      throw new PrinterError(
        'PRINTERS_LIST_FAILED',
        `No se pudo listar impresoras (Winspool/PowerShell): ${result.stderr.trim() || `exit ${result.code}`}`,
      );
    }

    try {
      return parseWinPrinterJson(result.stdout);
    } catch (err) {
      throw new PrinterError(
        'PRINTERS_LIST_FAILED',
        `Salida PowerShell inválida: ${String(err)}`,
      );
    }
  }

  async getPrinterStatus(name: string): Promise<PrinterInfo> {
    const list = await this.listPrinters();
    const found = list.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (!found) {
      throw new PrinterError('PRINTER_NOT_FOUND', `Impresora no encontrada: ${name}`);
    }
    return found;
  }

  async printRaw(job: PrintRawJob): Promise<PrintResult> {
    const bytes = job.bytes ?? Buffer.from(job.data, job.encoding === 'base64' ? 'base64' : 'utf8');
    if (!bytes.length) {
      return { ok: false, error: 'INVALID_REQUEST', message: 'Payload vacío' };
    }

    const title = (job.jobName || 'atria-print-agent').slice(0, 80);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atria-print-'));
    const dataFile = path.join(dir, 'job.bin');
    const scriptFile = path.join(dir, 'print-raw.ps1');

    try {
      await fs.writeFile(dataFile, bytes);
      await fs.writeFile(scriptFile, WIN_RAW_PRINT_PS, 'utf8');

      const result = await this.run(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          scriptFile,
          '-PrinterName',
          job.printer,
          '-FilePath',
          dataFile,
          '-DocName',
          title,
        ],
        { timeoutMs: 25_000 },
      );

      if (result.code === 0 && /OK:/i.test(result.stdout)) {
        return { ok: true };
      }

      const errText = `${result.stderr}\n${result.stdout}`.trim();
      if (/OPEN_FAILED|not found|cannot find|no se encuentra/i.test(errText)) {
        throw new PrinterError('PRINTER_NOT_FOUND', errText || `Impresora no encontrada: ${job.printer}`);
      }
      if (/offline|not ready|paused/i.test(errText)) {
        throw new PrinterError('PRINTER_OFFLINE', errText || `Impresora no disponible: ${job.printer}`);
      }
      throw new PrinterError('PRINT_FAILED', errText || `Winspool RAW falló (exit ${result.code})`);
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async printHtml(job: PrintHtmlJob): Promise<PrintResult> {
    const html = typeof job.html === 'string' ? job.html.trim() : '';
    if (!html) {
      return { ok: false, error: 'INVALID_REQUEST', message: 'html vacío' };
    }

    let escpos: Buffer;
    try {
      escpos = htmlToEscPosReceipt(html, { widthMm: job.widthMm ?? 80 });
    } catch (err) {
      return {
        ok: false,
        error: 'INVALID_REQUEST',
        message: err instanceof Error ? err.message : 'No se pudo armar el comprobante ESC/POS',
      };
    }

    return this.printRaw({
      printer: job.printer,
      data: '',
      encoding: 'utf8',
      bytes: escpos,
      jobName: job.jobName || 'comprobante',
      format: 'raw',
    });
  }
}
