import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useBlocker, useNavigate } from 'react-router-dom';
import { BoutiqueMood } from '../../components/BoutiqueMood';
import { ChileMoneyInput } from '../../components/ChileMoneyInput';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { IconTrash } from '../../components/icons';
import { MarginHint } from '../../components/MarginHint';
import { ModalOverlayClose } from '../../components/ModalOverlayClose';
import { ProductPhotoPlaceholder } from '../../components/ProductPhotoPlaceholder';
import { SupplierLookup } from '../../components/SupplierLookup';
import { api, mediaUrl, money } from '../../lib/api';
import { parseChileMoney } from '../../lib/chileMoney';
import { useAuth } from '../../lib/auth';
import { toast } from '../../lib/toast';
import {
  blankEditor,
  DOC_TYPES,
  fileToDataUrl,
  suggestSale,
  toApiPayload,
  toEditor,
  moneyInput,
  validateEditor,
  type DocType,
  type LineDraft,
  type LineEditor,
  type PurchaseFormValues,
  type Supplier,
} from './purchaseFormTypes';

type Props = {
  mode: 'create' | 'edit' | 'view';
  initial?: PurchaseFormValues;
  backTo?: string;
  backLabel?: string;
  submitLabel?: string;
  /** Toast tras guardar con éxito (antes de ir a la lista). */
  successToast?: string;
  banner?: ReactNode;
  moodTitle?: string;
  moodCopy?: string;
  onSubmit?: (payload: ReturnType<typeof toApiPayload>) => Promise<void>;
};

const EMPTY: PurchaseFormValues = {
  docType: 'factura',
  invoice: '',
  supplierId: '',
  purchasedAt: '',
  notes: '',
  destinationBranchId: '',
  lines: [],
};

function snapshotOf(v: {
  docType: DocType;
  invoice: string;
  supplierId: string;
  purchasedAt: string;
  notes: string;
  destinationBranchId: string;
  lines: LineDraft[];
}) {
  return JSON.stringify({
    docType: v.docType,
    invoice: v.invoice.trim(),
    supplierId: v.supplierId,
    purchasedAt: v.purchasedAt,
    notes: v.notes.trim(),
    destinationBranchId: v.destinationBranchId,
    lines: v.lines.map((l) => ({
      key: l.key,
      description: l.description,
      quantity: l.quantity,
      unitCost: l.unitCost,
      salePrice: l.salePrice,
      photoUrl: l.photoUrl || '',
    })),
  });
}

export function PurchaseDocumentForm({
  mode,
  initial,
  backTo = '/compras',
  backLabel = '← Volver a compras',
  submitLabel = 'Guardar compra',
  successToast = 'Compra guardada',
  banner,
  moodTitle = 'Documento de compra',
  moodCopy = 'Registra factura o boleta y las prendas. La recepción a stock se hace después en Ingresos.',
  onSubmit,
}: Props) {
  const readOnly = mode === 'view';
  const navigate = useNavigate();
  const { branches, branchId } = useAuth();
  const modalTitleId = useId();
  const modalRef = useRef<HTMLDivElement>(null);
  const descRef = useRef<HTMLInputElement>(null);
  /** Permite navegar tras guardar sin disparar el blocker (dirty aún no re-renderizó). */
  const allowLeaveRef = useRef(false);

  const seed = initial || EMPTY;
  const [docType, setDocType] = useState<DocType>(seed.docType);
  const [invoice, setInvoice] = useState(seed.invoice);
  const [supplierId, setSupplierId] = useState(seed.supplierId);
  const [purchasedAt, setPurchasedAt] = useState(seed.purchasedAt);
  const [notes, setNotes] = useState(seed.notes);
  const [destinationBranchId, setDestinationBranchId] = useState(
    () => seed.destinationBranchId || branchId || branches[0]?.id || '',
  );
  const [lines, setLines] = useState<LineDraft[]>(seed.lines);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [baseline, setBaseline] = useState(() =>
    snapshotOf({
      docType: seed.docType,
      invoice: seed.invoice,
      supplierId: seed.supplierId,
      purchasedAt: seed.purchasedAt,
      notes: seed.notes,
      destinationBranchId: seed.destinationBranchId || branchId || branches[0]?.id || '',
      lines: seed.lines,
    }),
  );
  const [listNudge, setListNudge] = useState<'idle' | 'added' | 'updated'>('idle');

  const [editor, setEditor] = useState<LineEditor | null>(null);
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
  const [editorError, setEditorError] = useState('');

  useEffect(() => {
    if (!initial) return;
    setDocType(initial.docType);
    setInvoice(initial.invoice);
    setSupplierId(initial.supplierId);
    setPurchasedAt(initial.purchasedAt);
    setNotes(initial.notes);
    setDestinationBranchId(initial.destinationBranchId || branchId || branches[0]?.id || '');
    setLines(initial.lines);
    setBaseline(
      snapshotOf({
        docType: initial.docType,
        invoice: initial.invoice,
        supplierId: initial.supplierId,
        purchasedAt: initial.purchasedAt,
        notes: initial.notes,
        destinationBranchId: initial.destinationBranchId || branchId || branches[0]?.id || '',
        lines: initial.lines,
      }),
    );
    setListNudge('idle');
  }, [initial, branchId, branches]);

  useEffect(() => {
    api<{ suppliers: Supplier[] }>('/api/catalog/suppliers')
      .then((d) => setSuppliers(d.suppliers))
      .catch(() => setSuppliers([]));
  }, []);

  useEffect(() => {
    if (!editor) return;
    // Solo al abrir una línea (mismo key mientras se edita) — no en cada tecleo
    const t = window.setTimeout(() => descRef.current?.focus(), 40);
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeEditor();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focus solo al abrir (editor.key)
  }, [editor?.key]);

  const totalCosto = useMemo(
    () =>
      lines.reduce((sum, l) => {
        const q = Number(l.quantity) || 0;
        const c = parseChileMoney(l.unitCost) || 0;
        return sum + q * c;
      }, 0),
    [lines],
  );

  const dirty = useMemo(() => {
    if (readOnly) return false;
    return (
      snapshotOf({ docType, invoice, supplierId, purchasedAt, notes, destinationBranchId, lines }) !==
      baseline
    );
  }, [readOnly, docType, invoice, supplierId, purchasedAt, notes, destinationBranchId, lines, baseline]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      !allowLeaveRef.current &&
      currentLocation.pathname !== nextLocation.pathname,
  );
  const leaveOpen = blocker.state === 'blocked';

  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (listNudge === 'idle') return;
    const t = window.setTimeout(() => setListNudge('idle'), 5200);
    return () => window.clearTimeout(t);
  }, [listNudge]);

  const cancelLeave = useCallback(() => {
    if (blocker.state === 'blocked') blocker.reset();
  }, [blocker]);

  const confirmLeave = useCallback(() => {
    if (blocker.state === 'blocked') blocker.proceed();
  }, [blocker]);

  function openCreate() {
    if (readOnly) return;
    setEditorMode('create');
    setEditorError('');
    setError('');
    setEditor(blankEditor());
  }

  function openEdit(line: LineDraft) {
    if (readOnly) return;
    setEditorMode('edit');
    setEditorError('');
    setError('');
    setEditor(toEditor(line));
  }

  function closeEditor() {
    setEditor(null);
    setEditorError('');
  }

  function patchEditor(patch: Partial<LineEditor>) {
    setEditor((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function setEditorCost(unitCost: string) {
    setEditor((prev) => {
      if (!prev) return prev;
      const next = { ...prev, unitCost };
      if (!prev.saleTouched) next.salePrice = suggestSale(unitCost);
      return next;
    });
  }

  async function onPhoto(file: File | null) {
    if (!file || !editor || readOnly) return;
    if (!file.type.startsWith('image/')) {
      setEditorError('La foto debe ser una imagen');
      return;
    }
    patchEditor({ photoBusy: true });
    setEditorError('');
    try {
      const image = await fileToDataUrl(file);
      const data = await api<{ url: string }>('/api/uploads', {
        method: 'POST',
        body: { image },
      });
      patchEditor({ photoUrl: data.url, photoBusy: false });
    } catch (err) {
      patchEditor({ photoBusy: false });
      setEditorError(err instanceof Error ? err.message : 'No se pudo subir la foto');
    }
  }

  function commitLineToList() {
    if (!editor || readOnly) return;
    const msg = validateEditor(editor);
    if (msg) {
      setEditorError(msg);
      return;
    }
    const saved: LineDraft = {
      key: editor.key,
      description: editor.description.trim(),
      quantity: String(Math.max(1, Math.round(Number(editor.quantity)) || 1)),
      unitCost: moneyInput(editor.unitCost),
      salePrice: moneyInput(editor.salePrice),
      saleTouched: editor.saleTouched,
      photoUrl: editor.photoUrl,
    };
    setLines((prev) => {
      if (editorMode === 'edit') return prev.map((l) => (l.key === saved.key ? saved : l));
      return [...prev, saved];
    });
    setListNudge(editorMode === 'edit' ? 'updated' : 'added');
    closeEditor();
  }

  function removeLine(key: string) {
    if (readOnly) return;
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (readOnly || !onSubmit) return;
    setError('');

    if (editor) {
      setError('Agrega o cierra la prenda abierta antes de guardar la compra');
      return;
    }
    if (!invoice.trim()) {
      setError('Ingresa el número del documento');
      return;
    }
    if (!destinationBranchId) {
      setError('Elige la sucursal destino de la mercadería');
      return;
    }
    if (!lines.length) {
      setError('Agrega al menos una prenda');
      return;
    }

    setBusy(true);
    try {
      await onSubmit(
        toApiPayload({
          docType,
          invoice,
          supplierId,
          purchasedAt,
          notes,
          destinationBranchId,
          lines,
        }),
      );
      const snap = snapshotOf({
        docType,
        invoice,
        supplierId,
        purchasedAt,
        notes,
        destinationBranchId,
        lines,
      });
      setBaseline(snap);
      setListNudge('idle');
      allowLeaveRef.current = true;
      toast.success(successToast);
      navigate(backTo);
    } catch (err) {
      allowLeaveRef.current = false;
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }

  const docLabel = DOC_TYPES.find((d) => d.id === docType)?.label || 'documento';
  const supplierName =
    seed.supplierName ||
    suppliers.find((s) => s.id === supplierId)?.name;

  return (
    <form
      className={`ing-new compras-form${dirty ? ' is-dirty' : ''}`}
      onSubmit={handleSubmit}
    >
      <div className="ing-new-top">
        <Link to={backTo} className="btn ghost">
          {backLabel}
        </Link>
      </div>

      {banner}

      {!readOnly && (
        <p className="ing-save-steps" role="note">
          <span>
            <strong>1.</strong> Arma el documento y las prendas
          </span>
          <span className="ing-save-steps-sep" aria-hidden>
            →
          </span>
          <span>
            <strong>2.</strong> Toca <em>{submitLabel}</em> abajo para registrarlas
          </span>
        </p>
      )}

      <div className="ing-new-layout">
        <section className="ing-new-doc card" aria-labelledby="compra-doc-title">
          <h3 id="compra-doc-title">Documento de compra</h3>

          <div className="ing-doc-types" role="radiogroup" aria-label="Tipo de documento">
            {DOC_TYPES.map((d) => (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={docType === d.id}
                className={`ing-doc-type${docType === d.id ? ' is-active' : ''}`}
                onClick={() => !readOnly && setDocType(d.id)}
                disabled={readOnly}
              >
                {d.label}
              </button>
            ))}
          </div>

          <div className="ing-new-meta">
            <div className="field">
              <label htmlFor="compra-invoice">Nº {docLabel.toLowerCase()}</label>
              <input
                id="compra-invoice"
                required={!readOnly}
                value={invoice}
                onChange={(e) => setInvoice(e.target.value)}
                autoComplete="off"
                placeholder="Ej. 1234"
                readOnly={readOnly}
                disabled={readOnly}
              />
            </div>
            <div className="field">
              <label htmlFor="compra-date">Fecha</label>
              <input
                id="compra-date"
                type="date"
                value={purchasedAt}
                onChange={(e) => setPurchasedAt(e.target.value)}
                readOnly={readOnly}
                disabled={readOnly}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="compra-supplier">Proveedor</label>
            {readOnly ? (
              <input id="compra-supplier" value={supplierName || '—'} readOnly disabled />
            ) : (
              <SupplierLookup
                id="compra-supplier"
                value={supplierId}
                suppliers={suppliers}
                onChange={setSupplierId}
                onSuppliersChange={setSuppliers}
              />
            )}
          </div>

          <div className="field">
            <label htmlFor="compra-dest-branch">Sucursal destino</label>
            {readOnly || mode === 'edit' ? (
              <input
                id="compra-dest-branch"
                value={
                  branches.find((b) => b.id === destinationBranchId)?.name ||
                  destinationBranchId ||
                  '—'
                }
                readOnly
                disabled
              />
            ) : branches.length <= 1 ? (
              <input
                id="compra-dest-branch"
                readOnly
                value={branches[0] ? `${branches[0].name} (${branches[0].code})` : '—'}
              />
            ) : (
              <select
                id="compra-dest-branch"
                required
                value={destinationBranchId}
                onChange={(e) => setDestinationBranchId(e.target.value)}
              >
                <option value="">Elegir sucursal…</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                    {b.id === branchId ? ' · activa' : ''}
                  </option>
                ))}
              </select>
            )}
            <span className="muted" style={{ display: 'block', marginTop: '0.35rem', fontSize: '0.8rem' }}>
              Ahí se recibirá la mercadería a stock (puede ser distinta a la sucursal de la barra).
            </span>
          </div>

          <div className="field">
            <label htmlFor="compra-notes">Notas</label>
            <textarea
              id="compra-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Opcional"
              readOnly={readOnly}
              disabled={readOnly}
            />
          </div>
        </section>

        <section className="ing-new-lines-wrap" aria-labelledby="compra-lines-title">
          <div className="ing-lines-head">
            <div>
              <h3 id="compra-lines-title">Prendas</h3>
              <p className="ing-hint">
                {readOnly
                  ? lines.length
                    ? `${lines.length} línea${lines.length === 1 ? '' : 's'}`
                    : 'Sin prendas en este documento'
                  : lines.length
                    ? `${lines.length} en la lista · guarda la compra abajo`
                    : 'Agrega prendas; después guarda abajo'}
              </p>
            </div>
          </div>

          {!lines.length && !editor && !readOnly && (
            <div className="ing-lines-empty">
              <p>No hay prendas en la lista</p>
              <p className="muted">
                Cada prenda se suma aquí. La compra se registra con el botón de abajo.
              </p>
              <button type="button" className="btn ing-add-prenda" onClick={openCreate}>
                + Agregar primera prenda
              </button>
            </div>
          )}

          {lines.length > 0 && (
            <ul className="ing-compact-list" aria-label="Líneas del documento">
              {lines.map((line, idx) => {
                const sub = (Number(line.quantity) || 0) * (parseChileMoney(line.unitCost) || 0);
                return (
                  <li key={line.key} className="ing-compact-row">
                    {readOnly ? (
                      <div className="ing-compact-main">
                        <span className="ing-compact-thumb" aria-hidden>
                          {line.photoUrl ? (
                            <img src={mediaUrl(line.photoUrl)} alt="" />
                          ) : (
                            <span>{idx + 1}</span>
                          )}
                        </span>
                        <span className="ing-compact-body">
                          <strong>{line.description}</strong>
                          <span className="meta">
                            {line.quantity} ud · Precio costo {money(parseChileMoney(line.unitCost) ?? 0)} · Venta{' '}
                            {money(parseChileMoney(line.salePrice) ?? 0)}
                          </span>
                        </span>
                        <span className="ing-compact-side">
                          <em>{money(sub)}</em>
                        </span>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="ing-compact-main"
                          onClick={() => openEdit(line)}
                          aria-label={`Editar ${line.description}`}
                        >
                          <span className="ing-compact-thumb" aria-hidden>
                            {line.photoUrl ? (
                              <img src={mediaUrl(line.photoUrl)} alt="" />
                            ) : (
                              <span>{idx + 1}</span>
                            )}
                          </span>
                          <span className="ing-compact-body">
                            <strong>{line.description}</strong>
                            <span className="meta">
                              {line.quantity} ud · Precio costo {money(parseChileMoney(line.unitCost) ?? 0)} · Venta{' '}
                              {money(parseChileMoney(line.salePrice) ?? 0)}
                            </span>
                          </span>
                          <span className="ing-compact-side">
                            <em>{money(sub)}</em>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="btn ghost ing-compact-remove"
                          aria-label={`Eliminar ${line.description}`}
                          title="Eliminar línea"
                          onClick={() => removeLine(line.key)}
                        >
                          <IconTrash size={16} />
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {!readOnly && lines.length > 0 && (
            <button
              type="button"
              className="btn ing-add-prenda ing-add-line-cta"
              onClick={openCreate}
              disabled={Boolean(editor)}
            >
              + Agregar prenda
            </button>
          )}
        </section>

        <BoutiqueMood
          className="ing-new-mood desktop-only"
          image="/brand/ingresos-mood.jpg"
          title={moodTitle}
          copy={moodCopy}
        />
      </div>

      {error && <p className="error">{error}</p>}

      {!readOnly && (
        <div
          className={`ing-sticky-bar${dirty ? ' is-dirty' : ''}${listNudge !== 'idle' ? ' is-nudge' : ''}`}
        >
          <div className="ing-sticky-copy">
            {listNudge !== 'idle' ? (
              <p className="ing-sticky-nudge" role="status">
                {listNudge === 'added'
                  ? 'Prenda en la lista · todavía falta guardar la compra'
                  : 'Lista actualizada · todavía falta guardar la compra'}
              </p>
            ) : dirty ? (
              <p className="ing-sticky-nudge" role="status">
                Cambios sin guardar
              </p>
            ) : (
              <span className="muted">
                {lines.length} prenda{lines.length === 1 ? '' : 's'} · Total costo
              </span>
            )}
            <strong className="ing-money">{money(totalCosto)}</strong>
          </div>
          <button
            className="btn"
            type="submit"
            disabled={busy || Boolean(editor) || !lines.length}
          >
            {busy ? 'Guardando…' : submitLabel}
          </button>
        </div>
      )}

      {readOnly && (
        <div className="ing-sticky-bar">
          <div>
            <span className="muted">
              {lines.length} prenda{lines.length === 1 ? '' : 's'} · Total costo
            </span>
            <strong className="ing-money">{money(totalCosto)}</strong>
          </div>
        </div>
      )}

      {editor && !readOnly && (
        <div className="pos-modal open" role="presentation">
          <ModalOverlayClose onClose={closeEditor}>
          <div className="ing-line-modal-shell">
            <div
              className="pos-modal-panel ing-line-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby={modalTitleId}
              ref={modalRef}
            >
              <div className="pos-modal-head">
                <h3 id={modalTitleId}>
                  {editorMode === 'create' ? 'Nueva prenda' : 'Editar prenda'}
                </h3>
              </div>

              <p className="ing-line-modal-note">
                Suma a la lista; después guarda la compra abajo.
              </p>

              <div className="ing-line-modal-body">
                <div className="ing-line-photo">
                  {editor.photoUrl ? (
                    <img src={mediaUrl(editor.photoUrl)} alt="" />
                  ) : (
                    <ProductPhotoPlaceholder className="ing-line-photo-empty" />
                  )}
                  <div className="ing-line-photo-actions">
                    <label className="ing-photo-btn">
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        hidden
                        onChange={(e) => void onPhoto(e.target.files?.[0] ?? null)}
                      />
                      {editor.photoBusy
                        ? 'Subiendo…'
                        : editor.photoUrl
                          ? 'Cambiar foto'
                          : 'Agregar foto'}
                    </label>
                    {editor.photoUrl ? (
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => patchEditor({ photoUrl: null })}
                      >
                        Quitar
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="ing-line-fields">
                  <div className="field">
                    <label htmlFor="compra-modal-desc">Descripción</label>
                    <input
                      id="compra-modal-desc"
                      ref={descRef}
                      value={editor.description}
                      onChange={(e) => patchEditor({ description: e.target.value })}
                      autoComplete="off"
                      placeholder="Ej. Polera básica negra"
                    />
                  </div>
                  <div className="ing-line-grid-3">
                    <div className="field">
                      <label htmlFor="compra-modal-qty">Cant.</label>
                      <input
                        id="compra-modal-qty"
                        type="number"
                        min={1}
                        step={1}
                        inputMode="numeric"
                        value={editor.quantity}
                        onChange={(e) => patchEditor({ quantity: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="compra-modal-cost">Precio costo</label>
                      <ChileMoneyInput
                        id="compra-modal-cost"
                        value={editor.unitCost}
                        onChange={(unitCost) => setEditorCost(unitCost)}
                        placeholder="0"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="compra-modal-sale">Venta</label>
                      <ChileMoneyInput
                        id="compra-modal-sale"
                        value={editor.salePrice}
                        onChange={(salePrice) =>
                          patchEditor({ salePrice, saleTouched: true })
                        }
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <MarginHint
                    cost={parseChileMoney(editor.unitCost)}
                    sale={parseChileMoney(editor.salePrice)}
                  />
                </div>
              </div>

              {editorError && <p className="error">{editorError}</p>}

              <div className="btn-row ing-line-modal-actions">
                <button type="button" className="btn secondary" onClick={closeEditor}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={commitLineToList}
                  disabled={editor.photoBusy}
                >
                  {editorMode === 'create' ? 'Agregar a la lista' : 'Actualizar en la lista'}
                </button>
              </div>
            </div>
          </div></ModalOverlayClose>
        </div>
      )}

      <ConfirmDialog
        open={leaveOpen}
        title="Salir sin guardar"
        message="Si sales ahora, se perderá lo que no hayas guardado en esta compra."
        cancelLabel="Seguir editando"
        confirmLabel="Salir sin guardar"
        danger
        onCancel={cancelLeave}
        onConfirm={confirmLeave}
      />
    </form>
  );
}
