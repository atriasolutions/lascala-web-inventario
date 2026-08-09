import { type FormEvent, useEffect, useState } from 'react';
import {
  DEFAULT_PRINT_PREFS,
  QZ_TRAY_ENABLED,
  loadPrintPrefs,
  savePrintPrefs,
  type PrintPrefs,
} from '../lib/printPrefs';
import {
  getQzTrustMode,
  isQzConnected,
  listQzPrinters,
  probeQzSigningAssets,
  probeQzStatus,
  type QzStatus,
} from '../lib/qzTray';
import { toast } from '../lib/toast';

/** Formulario de preferencias locales + detección QZ Tray. */
export function PrinterPrefsCard() {
  const [prefs, setPrefs] = useState<PrintPrefs>(() => loadPrintPrefs());
  const [qzStatus, setQzStatus] = useState<QzStatus>('idle');
  const [printers, setPrinters] = useState<string[]>([]);
  const [detectBusy, setDetectBusy] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [signing, setSigning] = useState<{ hasCert: boolean; hasKey: boolean }>({
    hasCert: false,
    hasKey: false,
  });

  useEffect(() => {
    function sync() {
      setPrefs(loadPrintPrefs());
    }
    window.addEventListener('lscala:print-prefs', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('lscala:print-prefs', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    if (!QZ_TRAY_ENABLED) return;
    let cancelled = false;
    void (async () => {
      const assets = await probeQzSigningAssets();
      if (!cancelled) setSigning(assets);
      setQzStatus('connecting');
      const status = await probeQzStatus();
      if (!cancelled) {
        setQzStatus(status);
        if (status === 'connected' && isQzConnected()) {
          try {
            const list = await listQzPrinters();
            if (!cancelled) setPrinters(list);
          } catch {
            /* lista opcional al cargar */
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function detectPrinters() {
    setDetectBusy(true);
    setQzStatus('connecting');
    try {
      const assets = await probeQzSigningAssets();
      setSigning(assets);
      const list = await listQzPrinters();
      setPrinters(list);
      setQzStatus('connected');
      if (!list.length) {
        toast.warn('QZ está conectado, pero no apareció ninguna impresora');
      } else if (!assets.hasCert || !assets.hasKey) {
        toast.success(
          `${list.length} impresora${list.length === 1 ? '' : 's'} · QZ listo (Allow si aparece)`,
        );
      } else {
        toast.success(
          `${list.length} impresora${list.length === 1 ? '' : 's'} detectada${list.length === 1 ? '' : 's'}`,
        );
      }
    } catch (err) {
      setQzStatus('unavailable');
      setPrinters([]);
      toast.error(err instanceof Error ? err.message : 'No se pudo detectar impresoras');
    } finally {
      setDetectBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next: PrintPrefs = {
      ...prefs,
      labels: {
        printerName: prefs.labels.printerName.trim(),
        note: prefs.labels.note.trim() || DEFAULT_PRINT_PREFS.labels.note,
      },
      receipts: {
        printerName: prefs.receipts.printerName.trim(),
        note: prefs.receipts.note.trim() || DEFAULT_PRINT_PREFS.receipts.note,
      },
    };
    savePrintPrefs(next);
    setPrefs(next);
    toast.success('Preferencias de impresoras guardadas en este equipo');
  }

  function resetDefaults() {
    const next = {
      ...DEFAULT_PRINT_PREFS,
      labels: { ...DEFAULT_PRINT_PREFS.labels },
      receipts: { ...DEFAULT_PRINT_PREFS.receipts },
    };
    savePrintPrefs(next);
    setPrefs(next);
    toast.success('Se restauraron los valores sugeridos');
  }

  const statusLabel =
    qzStatus === 'connected'
      ? 'Conectado'
      : qzStatus === 'connecting'
        ? 'Conectando…'
        : qzStatus === 'unavailable'
          ? 'No detectado'
          : 'Sin probar';

  const statusClass =
    qzStatus === 'connected'
      ? 'is-ok'
      : qzStatus === 'unavailable'
        ? 'is-bad'
        : 'is-idle';

  const trustOk = signing.hasCert && signing.hasKey;
  const trustLabel = trustOk
    ? 'Firmado (cert demo / producción)'
    : getQzTrustMode() === 'anonymous' || !trustOk
      ? 'Anonymous / sin cert — ver ayuda'
      : 'Revisando confianza…';

  return (
    <form className="card print-prefs-card" onSubmit={onSubmit}>
      <div className="page-intro" style={{ marginBottom: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.15rem' }}>Impresoras</h2>
        <p style={{ margin: '0.35rem 0 0' }}>
          Etiquetas van por TSPL raw a la Xprinter (50×25). Comprobantes por QZ a la térmica 80 mm.
          Si QZ no está, se usa el diálogo del navegador.
        </p>
      </div>

      <div className="print-qz-bar" role="status">
        <div className="print-qz-status">
          <span className={`print-qz-dot ${statusClass}`} aria-hidden />
          <div>
            <strong>QZ Tray: {statusLabel}</strong>
            <p className="muted" style={{ margin: '0.15rem 0 0', fontSize: '0.8rem' }}>
              Confianza: {trustLabel}
            </p>
          </div>
        </div>
        <div className="btn-row" style={{ margin: 0, flexWrap: 'wrap' }}>
          <button type="button" className="btn ghost" onClick={() => setHelpOpen((v) => !v)}>
            Cómo autorizar QZ
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={() => void detectPrinters()}
            disabled={detectBusy}
          >
            {detectBusy ? 'Detectando…' : 'Detectar impresoras'}
          </button>
        </div>
      </div>

      {helpOpen && (
        <div className="print-qz-help" role="region" aria-label="Cómo autorizar QZ Tray">
          <p>
            La firma es <strong>opcional</strong>: sin cert igual puedes imprimir por QZ (pulsa{' '}
            <strong>Allow</strong> cuando aparezca). Si el diálogo dice “anonymous / Untrusted” y al
            marcar Remember se oculta Allow: no marques Remember, o instala el cert demo:
          </p>
          <ol>
            <li>
              QZ Tray (menú) → <strong>Advanced → Site Manager</strong> → “+” → Create New.
            </li>
            <li>Acepta crear e instalar claves (override.crt).</li>
            <li>
              Copia desde el escritorio <em>QZ Tray Demo Cert</em> a{' '}
              <code>apps/web/public/qz-signing/</code>:
              <br />
              <code>digital-certificate.txt</code> y <code>private-key.pem</code>
            </li>
            <li>Recarga esta página → Detectar impresoras. Debe decir “Firmado”.</li>
            <li>
              Alternativa sin cert: Site Manager → agrega <code>http://localhost:5173</code> como
              sitio permitido (Allow permanente).
            </li>
          </ol>
          <p className="muted" style={{ marginBottom: 0 }}>
            Cert actual: {signing.hasCert ? 'sí' : 'no'} · Clave: {signing.hasKey ? 'sí' : 'no'}
          </p>
        </div>
      )}

      <div className="print-prefs-grid">
        <fieldset className="print-prefs-block">
          <legend>Impresora de etiquetas</legend>
          <p className="muted print-prefs-note">TSPL · Rollo 50 × 25 mm · Xprinter XP-420B</p>
          <div className="field">
            <label htmlFor="print-labels-select">Impresora</label>
            {printers.length > 0 ? (
              <select
                id="print-labels-select"
                value={prefs.labels.printerName}
                onChange={(e) =>
                  setPrefs((p) => ({
                    ...p,
                    labels: { ...p.labels, printerName: e.target.value },
                  }))
                }
              >
                <option value="">— Elegir —</option>
                {printers.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                {prefs.labels.printerName && !printers.includes(prefs.labels.printerName) && (
                  <option value={prefs.labels.printerName}>
                    {prefs.labels.printerName} (guardada)
                  </option>
                )}
              </select>
            ) : (
              <input
                id="print-labels-select"
                value={prefs.labels.printerName}
                onChange={(e) =>
                  setPrefs((p) => ({
                    ...p,
                    labels: { ...p.labels, printerName: e.target.value },
                  }))
                }
                placeholder="Detecta impresoras o escribe el nombre exacto"
                autoComplete="off"
              />
            )}
          </div>
          <div className="field">
            <label htmlFor="print-labels-note">Nota</label>
            <input
              id="print-labels-note"
              value={prefs.labels.note}
              onChange={(e) =>
                setPrefs((p) => ({
                  ...p,
                  labels: { ...p.labels, note: e.target.value },
                }))
              }
            />
          </div>
        </fieldset>

        <fieldset className="print-prefs-block">
          <legend>Impresora de comprobantes</legend>
          <p className="muted print-prefs-note">Térmico 80 mm · Brother u otra de boletas</p>
          <div className="field">
            <label htmlFor="print-receipts-select">Impresora</label>
            {printers.length > 0 ? (
              <select
                id="print-receipts-select"
                value={prefs.receipts.printerName}
                onChange={(e) =>
                  setPrefs((p) => ({
                    ...p,
                    receipts: { ...p.receipts, printerName: e.target.value },
                  }))
                }
              >
                <option value="">— Elegir —</option>
                {printers.map((name) => (
                  <option key={`r-${name}`} value={name}>
                    {name}
                  </option>
                ))}
                {prefs.receipts.printerName && !printers.includes(prefs.receipts.printerName) && (
                  <option value={prefs.receipts.printerName}>
                    {prefs.receipts.printerName} (guardada)
                  </option>
                )}
              </select>
            ) : (
              <input
                id="print-receipts-select"
                value={prefs.receipts.printerName}
                onChange={(e) =>
                  setPrefs((p) => ({
                    ...p,
                    receipts: { ...p.receipts, printerName: e.target.value },
                  }))
                }
                placeholder="Detecta impresoras o escribe el nombre exacto"
                autoComplete="off"
              />
            )}
          </div>
          <div className="field">
            <label htmlFor="print-receipts-note">Nota</label>
            <input
              id="print-receipts-note"
              value={prefs.receipts.note}
              onChange={(e) =>
                setPrefs((p) => ({
                  ...p,
                  receipts: { ...p.receipts, note: e.target.value },
                }))
              }
            />
          </div>
        </fieldset>
      </div>

      <label className="print-prefs-check">
        <input
          type="checkbox"
          checked={prefs.preferQzWhenAvailable}
          onChange={(e) =>
            setPrefs((p) => ({ ...p, preferQzWhenAvailable: e.target.checked }))
          }
        />
        <span>Preferir QZ Tray (si falla, usar diálogo del navegador)</span>
      </label>

      <p className="muted print-prefs-foot">
        Se guarda solo en este navegador/equipo. Cada caja puede tener impresoras distintas.
      </p>

      <div className="btn-row" style={{ marginTop: '0.75rem' }}>
        <button type="button" className="btn secondary" onClick={resetDefaults}>
          Restaurar sugeridos
        </button>
        <button type="submit" className="btn">
          Guardar
        </button>
      </div>
    </form>
  );
}
