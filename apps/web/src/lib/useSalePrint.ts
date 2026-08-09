import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { PrintReminderModal } from '../components/PrintReminderModal';
import { tryQzPrint, wrapReceiptHtml } from './qzTray';
import type { SalePrintJob } from './salePrint';
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
 * Comprobante térmico: intenta QZ Tray; si no, modal + window.print().
 * Papel QZ / CSS: 80 mm.
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
      // Primero montamos el DOM; el effect intenta QZ o abre el recordatorio.
    },
    [clearJob],
  );

  useEffect(() => {
    if (!printJob || qzAttempted.current) return;
    qzAttempted.current = true;
    let cancelled = false;

    void (async () => {
      await waitFrames(3);
      // Dar tiempo a JsBarcode en vouchers
      await new Promise((r) => window.setTimeout(r, 120));
      if (cancelled) return;

      const root = document.querySelector('.sale-print-root');
      if (root) {
        const html = wrapReceiptHtml(root.innerHTML);
        const result = await tryQzPrint('receipts', html);
        if (cancelled) return;
        if (result.ok) {
          toast.success(`Comprobante enviado a ${result.printer}`);
          clearJob();
          return;
        }
        if (
          result.reason &&
          !result.reason.includes('deshabilitado') &&
          !result.reason.includes('Preferencia')
        ) {
          toast.warn(`${result.reason} · Se abrirá el diálogo del navegador`);
        }
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
