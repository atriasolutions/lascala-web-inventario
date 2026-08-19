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
import { parseLpstatDefault, parseLpstatDevices, parseLpstatPrinters } from './parseLpstat.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Adaptador macOS vía CUPS CLI.
 *
 * - Etiquetas RAW/TSPL: `lp -o raw`
 * - Comprobantes: HTML → ESC/POS texto → `lp -o raw` (nunca PDF/HTML a térmica)
 */
export class MacosPrinterAdapter implements PrinterAdapter {
  readonly platform = 'darwin' as const;
  private readonly run: CommandRunner;

  constructor(run: CommandRunner = defaultCommandRunner) {
    this.run = run;
  }

  async listPrinters(): Promise<PrinterInfo[]> {
    const env = { LANG: 'C', LC_ALL: 'C' };
    const [pOut, dOut, vOut] = await Promise.all([
      this.run('lpstat', ['-p'], { env }),
      this.run('lpstat', ['-d'], { env }),
      this.run('lpstat', ['-v'], { env }),
    ]);

    if (pOut.code !== 0 && !pOut.stdout.trim() && /No destinations|sin destinos|no se ha/i.test(pOut.stderr)) {
      return [];
    }

    const defaultName = parseLpstatDefault(dOut.stdout) ?? parseLpstatDefault(pOut.stdout);
    const devices = parseLpstatDevices(vOut.stdout);
    return parseLpstatPrinters(pOut.stdout, { defaultName, devices });
  }

  async getPrinterStatus(name: string): Promise<PrinterInfo> {
    const list = await this.listPrinters();
    const found = list.find((p) => p.name === name);
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
    const result = await this.run(
      'lp',
      ['-d', job.printer, '-o', 'raw', '-t', title],
      { stdin: bytes, timeoutMs: 20_000, env: { LANG: 'C', LC_ALL: 'C' } },
    );

    if (result.code === 0) {
      return { ok: true };
    }

    const errText = `${result.stderr}\n${result.stdout}`.trim();
    if (/unknown|does not exist|no such|no existe|The printer or class does not exist/i.test(errText)) {
      throw new PrinterError('PRINTER_NOT_FOUND', errText || `Impresora no encontrada: ${job.printer}`);
    }
    if (/not ready|offline|paused|deshabilit|disabled|Unable to connect|Device not found/i.test(errText)) {
      throw new PrinterError('PRINTER_OFFLINE', errText || `Impresora no disponible: ${job.printer}`);
    }

    if (/stdin|filter failed|Unable to write/i.test(errText)) {
      return this.printRawViaTempFile(job.printer, title, bytes);
    }

    throw new PrinterError('PRINT_FAILED', errText || `lp exit ${result.code}`);
  }

  /**
   * Comprobante 80 mm: HTML → ESC/POS → RAW.
   * No usa Chrome/PDF ni `lp` sin -o raw (eso vacía el rollo en térmicas ESC/POS).
   */
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

  private async printRawViaTempFile(
    printer: string,
    title: string,
    bytes: Buffer,
  ): Promise<PrintResult> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atria-print-'));
    const file = path.join(dir, 'job.bin');
    try {
      await fs.writeFile(file, bytes);
      const result = await this.run(
        'lp',
        ['-d', printer, '-o', 'raw', '-t', title, file],
        { timeoutMs: 20_000, env: { LANG: 'C', LC_ALL: 'C' } },
      );
      if (result.code === 0) return { ok: true };
      const errText = `${result.stderr}\n${result.stdout}`.trim();
      throw new PrinterError('PRINT_FAILED', errText || `lp exit ${result.code}`);
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
