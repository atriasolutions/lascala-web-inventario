import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { PrintReminderModal } from '../components/PrintReminderModal';
import { wrapReceiptHtml } from './qzTray';
import type { SalePrintJob } from './salePrint';
import { printReceiptJob } from '../services/printing';
import { toast } from './toast';

function waitFrames(n = 2) {
  return new Promise<void>((resolve) => {
    const step = (left: number) => {
      if (left <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(() => step(left - 1));
    };
    step(n);
  });
}

/**
 * Comprobante térmico: Agent → QZ (fallback) → modal + window.print().
 * Papel / CSS: 80 mm. Nunca falla en silencio: toast + recordatorio.
 */
export function useSalePrint() {
  const [printJob, setPrintJobState] = useState<SalePrintJob | null>(null);
  const [reminderOpen, setReminderOpen] = useState(false);
  const qzAttempted = useRef(false);

  const clearJob = useCallback(() => {
    setPrintJobState(null);
    setReminderOpen(false);
    qzAttempted.current = false;
  }, []);

  const browserPrint = useCallback(() => {
    setReminderOpen(false);
    const prevTitle = document.title;
    document.title = ' ';
    window.setTimeout(() => {
      window.print();
      document.title = prevTitle;
      clearJob();
    }, 80);
  }, [clearJob]);

  const setPrintJob = useCallback(
    (job: SalePrintJob | null) => {
      if (!job) {
        clearJob();
        return;
      }
      qzAttempted.current = false;
      setPrintJobState(job);
    },
    [clearJob],
  );

  useEffect(() => {
    if (!printJob || qzAttempted.current) return;
    qzAttempted.current = true;
    let cancelled = false;

    void (async () => {
      await waitFrames(3);
      await new Promise((r) => window.setTimeout(r, 120));
      if (cancelled) return;

      const root = document.querySelector('.sale-print-root');
      if (!root) {
        toast.error('No se pudo armar el comprobante para imprimir');
        if (!cancelled) setReminderOpen(true);
        return;
      }

      const html = wrapReceiptHtml(root.innerHTML);
      const result = await printReceiptJob(html);
      if (cancelled) return;

      if (result.ok) {
        toast.success(`Comprobante enviado a ${result.printer}`);
        clearJob();
        return;
      }

      const reason = (result.reason || 'No se pudo imprimir el comprobante').trim();
      const preferBrowser = /Preferencia|diálogo del navegador/i.test(reason);
      const missingPrinter = /Falta impresora|Sin impresora|No hay impresora/i.test(reason);

      if (missingPrinter) {
        toast.error(reason);
      } else if (preferBrowser) {
        toast.warn('Se abrirá el diálogo del navegador para imprimir el comprobante');
      } else {
        toast.warn(`${reason} · Se abrirá el diálogo del navegador`);
      }

      if (!cancelled) setReminderOpen(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [printJob, clearJob]);

  const cancelReminder = useCallback(() => {
    clearJob();
  }, [clearJob]);

  const reminder = createElement(PrintReminderModal, {
    open: reminderOpen,
    profile: 'receipts',
    onConfirm: browserPrint,
    onCancel: cancelReminder,
  });

  return { printJob, setPrintJob, reminder };
}
