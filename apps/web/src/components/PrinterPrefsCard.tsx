import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_PRINT_PREFS,
  loadPrintPrefs,
  savePrintPrefs,
  type PrintPrefs,
} from '../lib/printPrefs';
import {
  fetchAgentHealth,
  findCanonicalPrinterName,
  printService,
  resolvePrinterName,
  type AgentHealth,
  type Printer,
} from '../services/printing';
import { toast } from '../lib/toast';

type AgentUiStatus = 'idle' | 'connecting' | 'connected' | 'unavailable';

function canonicalizePrefs(prefs: PrintPrefs, agentNames: string[]): PrintPrefs {
  if (!agentNames.length) return prefs;
  return {
    ...prefs,
    labels: {
      ...prefs.labels,
      printerName: resolvePrinterName(prefs.labels.printerName, agentNames),
    },
    receipts: {
      ...prefs.receipts,
      printerName: resolvePrinterName(prefs.receipts.printerName, agentNames),
    },
  };
}

function printerSelect(
  id: string,
  value: string,
  printers: Printer[],
  agentNames: string[],
  onChange: (v: string) => void,
  disabled: boolean,
) {
  const selected = resolvePrinterName(value, agentNames);
  const orphan =
    value.trim() && !findCanonicalPrinterName(value, agentNames) ? value.trim() : null;

  return (
    <select
      id={id}
      value={selected}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">— Elegir —</option>
      {printers.map((p) => (
        <option key={`${id}-${p.name}`} value={p.name}>
          {p.name}
          {p.isDefault ? ' (predeterminada)' : ''}
          {p.status === 'offline' || p.status === 'error' ? ` · ${p.status}` : ''}
        </option>
      ))}
      {orphan ? <option value={orphan}>{orphan} (guardada)</option> : null}
    </select>
  );
}

/** Preferencias locales de impresión — Atria Print Agent en este computador. */
export function PrinterPrefsCard() {
  const [prefs, setPrefs] = useState<PrintPrefs>(() => loadPrintPrefs());
  const [agentStatus, setAgentStatus] = useState<AgentUiStatus>('connecting');
  const [health, setHealth] = useState<AgentHealth | null>(null);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [detectBusy, setDetectBusy] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const agentNames = useMemo(() => printers.map((p) => p.name), [printers]);
  const connected = agentStatus === 'connected';
  const labelsName = prefs.labels.printerName.trim();
  const receiptsName = prefs.receipts.printerName.trim();
  const samePrinter = Boolean(labelsName && receiptsName && labelsName === receiptsName);
  const canChoose = connected && printers.length > 0;

  useEffect(() => {
    function sync() {
      setPrefs(canonicalizePrefs(loadPrintPrefs(), agentNames));
    }
    window.addEventListener('lscala:print-prefs', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('lscala:print-prefs', sync);
      window.removeEventListener('storage', sync);
    };
  }, [agentNames]);

  const refreshAgent = useCallback(async () => {
    setAgentStatus('connecting');
    const h = await fetchAgentHealth();
    if (!h?.ok) {
      setHealth(null);
      setPrinters([]);
      setAgentStatus('unavailable');
      return { ok: false as const, list: [] as Printer[] };
    }
    setHealth(h);
    const list = await printService.getPrinters();
    setPrinters(list);
    setAgentStatus('connected');

    const names = list.map((p) => p.name);
    setPrefs((prev) => {
      const next = canonicalizePrefs(prev, names);
      const changed =
        next.labels.printerName !== prev.labels.printerName ||
        next.receipts.printerName !== prev.receipts.printerName;
      if (changed) savePrintPrefs(next);
      return next;
    });

    return { ok: true as const, list };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await refreshAgent();
      if (cancelled) return;
      if (!result.ok) setAgentStatus('unavailable');
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshAgent]);

  async function detectPrinters() {
    setDetectBusy(true);
    try {
      const result = await refreshAgent();
      if (!result.ok) {
        toast.error('No encontramos Atria Print Agent. Ábrelo en la barra de menú e intenta de nuevo.');
        setHelpOpen(true);
        return;
      }
      if (!result.list.length) {
        toast.warn('Agent conectado, pero no apareció ninguna impresora');
      } else {
        toast.success(
          `${result.list.length} impresora${result.list.length === 1 ? '' : 's'} detectada${
            result.list.length === 1 ? '' : 's'
          }`,
        );
      }
    } finally {
      setDetectBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (samePrinter) {
      toast.warn('Etiquetas y comprobantes no deberían usar la misma impresora');
    }
    const resolved = canonicalizePrefs(prefs, agentNames);
    const next: PrintPrefs = {
      ...resolved,
      labels: {
        printerName: resolved.labels.printerName.trim(),
        note: resolved.labels.note.trim() || DEFAULT_PRINT_PREFS.labels.note,
      },
      receipts: {
        printerName: resolved.receipts.printerName.trim(),
        note: resolved.receipts.note.trim() || DEFAULT_PRINT_PREFS.receipts.note,
      },
    };
    savePrintPrefs(next);
    setPrefs(next);
    toast.success('Preferencias guardadas en este equipo');
  }

  function resetDefaults() {
    const next = {
      ...DEFAULT_PRINT_PREFS,
      labels: { ...DEFAULT_PRINT_PREFS.labels },
      receipts: { ...DEFAULT_PRINT_PREFS.receipts },
    };
    savePrintPrefs(next);
    setPrefs(next);
    toast.success('Valores sugeridos restaurados');
  }

  const statusLabel =
    agentStatus === 'connected'
      ? 'Conectado'
      : agentStatus === 'connecting'
        ? 'Buscando Atria Print Agent…'
        : 'No encontrado';

  const statusHint =
    agentStatus === 'connected'
      ? printers.length
        ? `${printers.length} impresora${printers.length === 1 ? '' : 's'} en este computador${
            health?.version ? ` · v${health.version}` : ''
          }`
        : 'Conectado, sin impresoras. Revisa el cable o pulsa Detectar.'
      : agentStatus === 'connecting'
        ? 'Revisamos si está abierto en este computador.'
        : 'Ábrelo en la barra de menú (arriba a la derecha) y pulsa Detectar.';

  const statusClass =
    agentStatus === 'connected' ? 'is-ok' : agentStatus === 'unavailable' ? 'is-bad' : 'is-idle';

  return (
    <form className="print-prefs" onSubmit={onSubmit}>
      <div className={`print-status print-status--${statusClass}`} role="status">
        <span className={`print-status-dot ${statusClass}`} aria-hidden />
        <div className="print-status-copy">
          <span className="print-status-label">{statusLabel}</span>
          <span className="print-status-hint">{statusHint}</span>
        </div>
        <div className="print-status-actions">
          <button
            type="button"
            className="btn secondary print-status-btn"
            onClick={() => void detectPrinters()}
            disabled={detectBusy || agentStatus === 'connecting'}
          >
            {detectBusy || agentStatus === 'connecting' ? 'Buscando…' : 'Detectar'}
          </button>
          {agentStatus === 'unavailable' ? (
            <button
              type="button"
              className="btn print-status-btn"
              onClick={() => setHelpOpen(true)}
            >
              Cómo instalar
            </button>
          ) : (
            <button
              type="button"
              className="btn ghost print-status-btn"
              onClick={() => setHelpOpen((v) => !v)}
            >
              {helpOpen ? 'Ocultar ayuda' : 'Ayuda'}
            </button>
          )}
        </div>
      </div>

      {agentStatus === 'unavailable' || helpOpen ? (
        <div className="print-agent-missing" role="region" aria-label="Cómo abrir Atria Print Agent">
          <p>
            <strong>Atria Print Agent</strong> conecta L&apos;Scala con las impresoras de este
            computador. Debe quedar abierto: en Mac, un ícono Atria en la barra de menú; en
            Windows, junto al reloj.
          </p>
          <ol className="print-agent-steps">
            <li>Ábrelo desde Aplicaciones (Mac) o el menú Inicio (Windows).</li>
            <li>Pulsa <strong>Detectar</strong> en esta pantalla.</li>
            <li>Elige una impresora para etiquetas y otra para comprobantes, y guarda.</li>
          </ol>
          {agentStatus === 'unavailable' ? (
            <p className="muted" style={{ marginBottom: 0 }}>
              Si aún no lo tienes, instálalo en este computador (Atria te entrega el instalador) y
              vuelve a Detectar.
            </p>
          ) : (
            <p className="muted" style={{ marginBottom: 0 }}>
              Etiquetas: rollo 50 × 25 mm. Comprobantes: ticket térmico 80 mm. No uses la misma
              para ambos.
            </p>
          )}
        </div>
      ) : null}

      <div className="print-prefs-stack">
        <div className="print-prefs-block">
          <p className="print-prefs-kicker">Rollo 50 × 25 mm</p>
          <h3 className="print-prefs-heading">Etiquetas</h3>
          <p className="muted print-prefs-note">Códigos de barras para vitrina</p>
          <div className="field">
            <label htmlFor="print-labels-select">Impresora</label>
            {canChoose ? (
              printerSelect(
                'print-labels-select',
                prefs.labels.printerName,
                printers,
                agentNames,
                (v) =>
                  setPrefs((p) => ({
                    ...p,
                    labels: { ...p.labels, printerName: resolvePrinterName(v, agentNames) || v },
                  })),
                false,
              )
            ) : (
              <p className="print-prefs-pending">
                {labelsName || 'Abre el Agent y pulsa Detectar para elegir'}
              </p>
            )}
          </div>
        </div>

        <div className="print-prefs-block">
          <p className="print-prefs-kicker">Ticket 80 mm</p>
          <h3 className="print-prefs-heading">Comprobantes</h3>
          <p className="muted print-prefs-note">Ventas, cambios y tickets de piso</p>
          <div className="field">
            <label htmlFor="print-receipts-select">Impresora</label>
            {canChoose ? (
              printerSelect(
                'print-receipts-select',
                prefs.receipts.printerName,
                printers,
                agentNames,
                (v) =>
                  setPrefs((p) => ({
                    ...p,
                    receipts: {
                      ...p.receipts,
                      printerName: resolvePrinterName(v, agentNames) || v,
                    },
                  })),
                false,
              )
            ) : (
              <p className="print-prefs-pending">
                {receiptsName || 'Abre el Agent y pulsa Detectar para elegir'}
              </p>
            )}
          </div>
        </div>
      </div>

      {samePrinter ? (
        <p className="print-same-warn" role="status">
          Elegiste la misma impresora para etiquetas y comprobantes. Usa dos distintas: el rollo
          50 × 25 no sirve para el ticket de 80 mm.
        </p>
      ) : null}

      <label className="print-prefs-check">
        <input
          type="checkbox"
          checked={prefs.preferQzWhenAvailable}
          onChange={(e) => setPrefs((p) => ({ ...p, preferQzWhenAvailable: e.target.checked }))}
        />
        <span>Imprimir directo en este computador. Si falla, se abre el diálogo del navegador.</span>
      </label>

      <div className="print-prefs-actions">
        <button type="submit" className="btn" disabled={!connected && !labelsName && !receiptsName}>
          Guardar
        </button>
        <button type="button" className="btn ghost" onClick={resetDefaults}>
          Restaurar sugeridos
        </button>
      </div>
    </form>
  );
}
