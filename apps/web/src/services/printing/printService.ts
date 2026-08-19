/**
 * Fachada de impresión: Agent primero, QZ como puente temporal (Fase 5).
 * Reutiliza buildLabelTspl intacto desde qzTray.
 */

import { getProfile, loadPrintPrefs } from '../../lib/printPrefs';
import {
  buildLabelTspl,
  printHtmlViaQz,
  printLabelTsplViaQz,
} from '../../lib/qzTray';
import { toast } from '../../lib/toast';
import {
  AgentHttpError,
  fetchAgentHealth,
  fetchAgentPrinters,
  postAgentPrintHtml,
  postAgentPrintRaw,
} from './agentClient';
import { resolvePrinterName } from './printerNames';
import type { PrintJob, PrintResult, PrintService, Printer } from './types';

const FALLBACK_TOAST =
  'Atria Print Agent no completó el envío; se usó un respaldo en este computador';

function shouldPreferBridge(): boolean {
  return loadPrintPrefs().preferQzWhenAvailable;
}

function isAgentPrintUnsupported(err: unknown): boolean {
  return err instanceof AgentHttpError && err.isUnsupported;
}

function isAbortOrNetwork(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof TypeError) return true;
  return false;
}

function errMessage(err: unknown, fallback: string): string {
  if (err instanceof AgentHttpError) return err.message || fallback;
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

async function canonicalPrinter(preferred: string): Promise<string> {
  const trimmed = preferred.trim();
  if (!trimmed) return '';
  try {
    const list = await fetchAgentPrinters();
    return resolvePrinterName(
      trimmed,
      list.map((p) => p.name),
    );
  } catch {
    return trimmed;
  }
}

async function printLabel(job: Extract<PrintJob, { kind: 'label' }>): Promise<PrintResult> {
  if (!shouldPreferBridge()) {
    return { ok: false, reason: 'Preferencia: usar diálogo del navegador' };
  }

  const n = Math.max(1, Math.min(999, Math.floor(Number(job.copies) || 1)));
  const rawName = (job.printer || getProfile('labels').printerName).trim();
  if (!rawName) {
    return {
      ok: false,
      reason: 'Falta impresora de etiquetas. Configúrala en Ajustes → Impresoras.',
    };
  }
  const printer = await canonicalPrinter(rawName);

  const tspl = buildLabelTspl(job.name, job.code, n);
  let agentReachable = false;
  let softFallback = false;
  let agentErr = '';

  const health = await fetchAgentHealth();
  if (health?.ok) {
    agentReachable = true;
    try {
      await postAgentPrintRaw({
        printer,
        data: tspl,
        encoding: 'utf8',
        jobName: `etiqueta-${job.code}`.slice(0, 64),
      });
      return { ok: true, via: 'agent', printer, copies: n };
    } catch (err) {
      agentErr = errMessage(err, 'Error del Agent');
      softFallback = isAgentPrintUnsupported(err) || !isAbortOrNetwork(err);
      if (!softFallback) {
        return { ok: false, reason: agentErr };
      }
    }
  }

  try {
    const used = await printLabelTsplViaQz(job.name, job.code, printer, n);
    if (softFallback || agentReachable) {
      toast.warn(FALLBACK_TOAST);
    }
    return {
      ok: true,
      via: 'qz',
      printer: used,
      copies: n,
      usedFallback: agentReachable,
    };
  } catch (err) {
    const qzReason = errMessage(err, 'No se pudo imprimir la etiqueta');
    return {
      ok: false,
      reason: agentErr ? `${agentErr} · ${qzReason}` : qzReason,
    };
  }
}

async function printReceipt(job: Extract<PrintJob, { kind: 'receipt' }>): Promise<PrintResult> {
  if (!shouldPreferBridge()) {
    return { ok: false, reason: 'Preferencia: usar diálogo del navegador' };
  }

  const rawName = (job.printer || getProfile('receipts').printerName).trim();
  if (!rawName) {
    return {
      ok: false,
      reason:
        'Falta impresora de comprobantes. En Ajustes → Impresoras elige una distinta a la de etiquetas.',
    };
  }
  const printer = await canonicalPrinter(rawName);

  let agentReachable = false;
  let softFallback = false;
  let agentErr = '';

  const health = await fetchAgentHealth();
  if (health?.ok) {
    agentReachable = true;
    try {
      await postAgentPrintHtml({
        printer,
        html: job.html,
        jobName: 'comprobante',
        widthMm: 80,
      });
      return { ok: true, via: 'agent', printer };
    } catch (err) {
      agentErr = errMessage(err, 'El Agent no pudo imprimir el comprobante');
      // Solo caer a QZ si es 501/unsupported o error de spooler; red = no Agent usable.
      softFallback = isAgentPrintUnsupported(err) || !isAbortOrNetwork(err);
      if (!softFallback) {
        return { ok: false, reason: agentErr };
      }
    }
  }

  try {
    const used = await printHtmlViaQz('receipts', job.html, printer);
    if (softFallback || agentReachable) {
      toast.warn(FALLBACK_TOAST);
    }
    return { ok: true, via: 'qz', printer: used, usedFallback: agentReachable };
  } catch (err) {
    const qzReason = errMessage(err, 'No se pudo imprimir el comprobante');
    if (!agentReachable) {
      return {
        ok: false,
        reason: `${qzReason}. Revisa Atria Print Agent y la impresora de comprobantes en Ajustes.`,
      };
    }
    return {
      ok: false,
      reason: agentErr
        ? `${agentErr} · Alternativa: ${qzReason}`
        : qzReason,
    };
  }
}

class AtriaPrintService implements PrintService {
  async isAgentAvailable(): Promise<boolean> {
    const health = await fetchAgentHealth();
    return Boolean(health?.ok);
  }

  async getPrinters(): Promise<Printer[]> {
    const health = await fetchAgentHealth();
    if (!health?.ok) return [];
    try {
      return await fetchAgentPrinters();
    } catch {
      return [];
    }
  }

  async print(job: PrintJob): Promise<PrintResult> {
    if (job.kind === 'label') return printLabel(job);
    return printReceipt(job);
  }
}

export const printService: PrintService = new AtriaPrintService();

/** Atajo etiquetas (Ingresos / POS). */
export async function printLabelJob(
  name: string,
  code: string,
  copies = 1,
): Promise<PrintResult> {
  return printService.print({ kind: 'label', name, code, copies });
}

/** Atajo comprobantes. */
export async function printReceiptJob(html: string): Promise<PrintResult> {
  return printService.print({ kind: 'receipt', html });
}
