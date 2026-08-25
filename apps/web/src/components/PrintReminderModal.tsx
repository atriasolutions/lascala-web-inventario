import { useEffect, useId, useState } from 'react';
import { ModalOverlayClose } from './ModalOverlayClose';
import {
  getProfile,
  loadPrintPrefs,
  profilePaperHint,
  profileTitle,
  savePrintPrefs,
  type PrintPrefs,
  type PrintProfileId,
} from '../lib/printPrefs';
import { toast } from '../lib/toast';

type Props = {
  open: boolean;
  profile: PrintProfileId;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Recordatorio antes de window.print(): el SO/navegador abre el diálogo
 * y el usuario debe elegir la impresora configurada.
 */
export function PrintReminderModal({ open, profile, onConfirm, onCancel }: Props) {
  const titleId = useId();
  const descId = useId();
  const [printerName, setPrinterName] = useState(() => getProfile(profile).printerName);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPrinterName(getProfile(profile).printerName);
    setEditing(false);
  }, [open, profile]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const paper = profilePaperHint(profile);
  const note = getProfile(profile).note;

  function persistName() {
    const name = printerName.trim();
    if (!name) {
      toast.error('Indica el nombre de la impresora');
      return;
    }
    const prefs = loadPrintPrefs();
    const next: PrintPrefs = {
      ...prefs,
      [profile]: { ...prefs[profile], printerName: name },
    };
    savePrintPrefs(next);
    setEditing(false);
    toast.success('Nombre de impresora guardado en este equipo');
  }

  return (
    <div
      className="pos-modal open no-print print-reminder-modal"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <ModalOverlayClose onClose={onCancel}>
      <div
        className="pos-modal-panel print-reminder-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <div className="pos-modal-head">
          <h3 id={titleId}>{profileTitle(profile)}</h3>
        </div>

        <div id={descId} className="print-reminder-body">
          <p className="print-reminder-lead">
            El navegador abrirá el diálogo de impresión. Ahí debes elegir la impresora correcta
            (Mac y Windows).
          </p>

          <div className="print-reminder-pick" role="status">
            <span className="print-reminder-pick-label">En el diálogo de impresión, elige:</span>
            <strong className="print-reminder-pick-name">{printerName.trim() || '—'}</strong>
            <span className="print-reminder-pick-meta muted">
              Papel / tamaño: {paper}
              {note ? ` · ${note}` : ''}
            </span>
          </div>

          {editing ? (
            <div className="field print-reminder-edit">
              <label htmlFor="print-reminder-name">Nombre de la impresora en este equipo</label>
              <input
                id="print-reminder-name"
                value={printerName}
                onChange={(e) => setPrinterName(e.target.value)}
                placeholder={profile === 'labels' ? 'Ej. Xprinter XP-420B' : 'Ej. Brother QL / HL'}
                autoComplete="off"
                autoFocus
              />
              <div className="btn-row" style={{ marginTop: '0.5rem' }}>
                <button type="button" className="btn secondary" onClick={() => setEditing(false)}>
                  Cancelar
                </button>
                <button type="button" className="btn" onClick={persistName}>
                  Guardar
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn ghost print-reminder-tweak" onClick={() => setEditing(true)}>
              Cambiar nombre en este equipo
            </button>
          )}

          <p className="print-reminder-hint muted">
            Tip: con Atria Print Agent abierto y la impresora asignada en Ajustes, el envío es
            directo. Aquí usamos el diálogo del navegador como respaldo. En Chrome/Edge desmarca
            “Encabezados y pies de página” si aparecen fecha o URL.
          </p>
        </div>

        <div className="btn-row confirm-dialog-actions">
          <button type="button" className="btn secondary" onClick={onCancel}>
            Ahora no
          </button>
          <button type="button" className="btn" onClick={onConfirm} autoFocus={!editing}>
            Imprimir
          </button>
        </div>
      </div></ModalOverlayClose>
    </div>
  );
}
