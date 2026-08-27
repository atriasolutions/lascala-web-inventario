import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ColorSwatch } from './ColorSwatch';
import { ModalOverlayClose } from './ModalOverlayClose';
import {
  ProductCodeEntry,
  type ProductCodeMode,
} from './ProductCodeEntry';
import { ProductFichaFields } from './ProductFichaFields';
import { ConfirmDialog } from './ConfirmDialog';
import { ProductPhotoInput } from './ProductPhotoInput';
import { api, mediaUrl, money } from '../lib/api';
import { lineFloorSalePrice, type PurchaseItem } from '../lib/purchasesStatus';
import { fileToDataUrl } from '../pages/compras/purchaseFormTypes';

export type NoBarcodeLine = PurchaseItem & { draftReceived: number };

export type CategoryOption = { id: string; name: string };

export type ProductSearchHit = {
  id: string;
  name: string;
  barcode: string | null;
  internal_code: string;
  brand?: string | null;
  color?: string | null;
  size_label?: string | null;
  category_name?: string | null;
  photo_url?: string | null;
  sale_price?: string | number;
};

type Mode = 'new' | 'search';

type Props = {
  open: boolean;
  titleId: string;
  lines: NoBarcodeLine[];
  categories: CategoryOption[];
  suggestedBarcode: string;
  /**
   * Código escaneado inexistente: abre ficha create con barcode en modo pistola.
   * Si es null/undefined, flujo «Sin código» (autogenerar).
   */
  presetBarcode?: string | null;
  onClose: () => void;
  onCreateAndReceive: (payload: {
    purchaseItemId: string;
    barcode: string;
    name: string;
    categoryId: string | null;
    brand: string | null;
    sizeLabel: string | null;
    color: string | null;
    productType: string | null;
    season: string | null;
    description: string | null;
    photoUrl: string | null;
    quantityReceived: number;
    labelCopies: number;
  }) => Promise<void>;
  onLinkExisting: (payload: {
    purchaseItemId: string;
    product: ProductSearchHit;
    quantityReceived: number;
    labelCopies: number;
  }) => Promise<void>;
  onPrintLabel: (name: string, code: string, copies: number) => void | Promise<void>;
  /** false = Vendedor/a: solo buscar/vincular existente e imprimir etiqueta. */
  canCreateProduct?: boolean;
};

function linePending(line: NoBarcodeLine) {
  return Math.max(0, Number(line.quantity_ordered) - line.draftReceived);
}

export function NoBarcodeModal({
  open,
  titleId,
  lines,
  categories,
  suggestedBarcode,
  presetBarcode = null,
  onClose,
  onCreateAndReceive,
  onLinkExisting,
  onPrintLabel,
  canCreateProduct = true,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const blobRef = useRef<string | null>(null);
  const searchId = useId();
  const [mode, setMode] = useState<Mode>('new');
  const [busy, setBusy] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState('');

  const [pickLineId, setPickLineId] = useState('');
  const [barcode, setBarcode] = useState(suggestedBarcode);
  const [codeMode, setCodeMode] = useState<ProductCodeMode>('auto');
  const [codeGenerating, setCodeGenerating] = useState(false);
  const [codeAvailability, setCodeAvailability] = useState<
    'idle' | 'checking' | 'ok' | 'taken' | 'error'
  >('idle');
  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [sizeLabel, setSizeLabel] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brand, setBrand] = useState('');
  const [productType, setProductType] = useState('');
  const [season, setSeason] = useState('');
  const [description, setDescription] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [receiveQty, setReceiveQty] = useState(1);
  const [labelCopies, setLabelCopies] = useState(1);

  const [searchQ, setSearchQ] = useState('');
  const [searchHits, setSearchHits] = useState<ProductSearchHit[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [selected, setSelected] = useState<ProductSearchHit | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState(false);

  const selectedLine = useMemo(
    () => lines.find((l) => l.id === pickLineId) ?? null,
    [lines, pickLineId],
  );

  const displaySale = selectedLine ? lineFloorSalePrice(selectedLine) : 0;
  const pendingOnLine = selectedLine ? linePending(selectedLine) : 0;
  const scannedCreate = Boolean(presetBarcode?.trim());
  const photoSrc = photoPreview || (photoUrl ? mediaUrl(photoUrl) : null);

  const hasDraft =
    Boolean(name.trim()) ||
    Boolean(color.trim()) ||
    Boolean(sizeLabel.trim()) ||
    Boolean(categoryId) ||
    Boolean(brand.trim()) ||
    Boolean(photoUrl || photoPreview) ||
    Boolean(barcode.trim() && codeMode === 'scan');

  function requestClose() {
    if (busy || printBusy || photoBusy) return;
    if (hasDraft) {
      setCancelConfirm(true);
      return;
    }
    onClose();
  }

  function revokeBlob() {
    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
      blobRef.current = null;
    }
  }

  useEffect(() => {
    if (!open) return;
    setMode(canCreateProduct ? 'new' : 'search');
    setError('');
    setBusy(false);
    setPrintBusy(false);
    setPhotoBusy(false);
    setPhotoUrl('');
    setPhotoPreview(null);
    revokeBlob();
    const scanned = (presetBarcode || '').trim().toUpperCase().replace(/\s+/g, '');
    if (scanned) {
      setBarcode(scanned);
      setCodeMode('scan');
      setCodeAvailability('ok');
    } else {
      setBarcode(suggestedBarcode);
      setCodeMode('auto');
      setCodeAvailability('idle');
    }
    setCodeGenerating(false);
    setSearchQ('');
    setSearchHits([]);
    setSelected(null);
    const first = lines[0];
    setPickLineId(first?.id || '');
    setName(first?.description || '');
    setColor(first?.color || '');
    setSizeLabel(first?.size_label || '');
    setCategoryId('');
    setBrand('');
    setProductType('');
    setSeason('');
    setDescription(first?.description || '');
    setReceiveQty(1);
    setLabelCopies(1);
    requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>('input, select, button')?.focus();
    });
    return () => revokeBlob();
  }, [open, suggestedBarcode, presetBarcode, lines, canCreateProduct]);

  useEffect(() => {
    if (!selectedLine || mode !== 'new') return;
    if (!name.trim()) setName(selectedLine.description || '');
    if (!color && selectedLine.color) setColor(selectedLine.color);
    if (!sizeLabel && selectedLine.size_label) setSizeLabel(selectedLine.size_label);
  }, [selectedLine?.id, mode]);

  useEffect(() => {
    if (!open || mode !== 'search') return;
    const q = searchQ.trim();
    if (q.length < 2) {
      setSearchHits([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      setSearchBusy(true);
      void api<{ products: ProductSearchHit[] }>(
        `/api/products?q=${encodeURIComponent(q)}`,
      )
        .then((data) => {
          if (!cancelled) setSearchHits(data.products || []);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Error al buscar');
        })
        .finally(() => {
          if (!cancelled) setSearchBusy(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [searchQ, open, mode]);

  if (!open) return null;

  async function checkBarcodeUnique(code: string, excludeProductId?: string) {
    const qs = new URLSearchParams({ code });
    if (excludeProductId) qs.set('excludeProductId', excludeProductId);
    const data = await api<{ available: boolean; barcode: string | null }>(
      `/api/products/barcode-available?${qs.toString()}`,
    );
    return data;
  }

  async function fetchNextCode() {
    setCodeGenerating(true);
    setCodeAvailability('idle');
    try {
      const data = await api<{ nextBarcode: string }>('/api/products/next-barcode');
      setBarcode((data.nextBarcode || '').trim().toUpperCase());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el código');
    } finally {
      setCodeGenerating(false);
    }
  }

  async function checkScanBarcode() {
    const code = barcode.trim().toUpperCase().replace(/\s+/g, '');
    if (!code || codeMode !== 'scan') {
      setCodeAvailability('idle');
      return;
    }
    setCodeAvailability('checking');
    try {
      const data = await checkBarcodeUnique(code);
      if (data.barcode && data.barcode !== code) setBarcode(data.barcode);
      setCodeAvailability(data.available ? 'ok' : 'taken');
    } catch {
      setCodeAvailability('error');
    }
  }

  async function onPhoto(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('La foto debe ser una imagen');
      return;
    }
    setPhotoBusy(true);
    setError('');
    revokeBlob();
    const localPreview = URL.createObjectURL(file);
    blobRef.current = localPreview;
    setPhotoPreview(localPreview);
    try {
      const image = await fileToDataUrl(file);
      const data = await api<{ url: string }>('/api/uploads', {
        method: 'POST',
        body: { image },
      });
      setPhotoUrl(data.url);
      const remote = mediaUrl(data.url);
      if (remote) {
        const probe = new Image();
        probe.onload = () => {
          setPhotoPreview(null);
          revokeBlob();
        };
        probe.src = remote;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la foto');
      setPhotoPreview(null);
      revokeBlob();
    } finally {
      setPhotoBusy(false);
    }
  }

  function clearPhoto() {
    revokeBlob();
    setPhotoPreview(null);
    setPhotoUrl('');
  }

  async function executeCreate() {
    if (!pickLineId || !selectedLine) return;
    const code = barcode.trim().toUpperCase().replace(/\s+/g, '');
    const qty = Math.floor(Number(receiveQty));
    setBusy(true);
    setError('');
    try {
      if (!code) {
        setError(
          codeMode === 'scan'
            ? 'Pistolea o ingresa un código, o elige Autogenerar'
            : 'Espera el código autogenerado o pulsa Otro código',
        );
        return;
      }
      const check = await checkBarcodeUnique(code);
      if (!check.available) {
        setCodeAvailability('taken');
        setError('Ese código ya está en uso');
        return;
      }
      setCodeAvailability('ok');
      await onCreateAndReceive({
        purchaseItemId: pickLineId,
        barcode: check.barcode || code,
        name: name.trim(),
        categoryId: categoryId || null,
        brand: brand.trim() || null,
        sizeLabel: sizeLabel.trim() || null,
        color: color.trim() || null,
        productType: productType.trim() || null,
        season: season.trim() || null,
        description: description.trim() || null,
        photoUrl: photoUrl.trim() || null,
        quantityReceived: qty,
        labelCopies: Math.max(1, Math.floor(Number(labelCopies) || 1)),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la prenda');
    } finally {
      setBusy(false);
    }
  }

  function handleCreate() {
    setError('');
    if (photoBusy) {
      setError('Espera a que termine de subir la foto');
      return;
    }
    if (!lines.length) {
      setError('No hay líneas sin vincular en este ingreso');
      return;
    }
    if (!pickLineId || !selectedLine) {
      setError('Elige la línea del ingreso');
      return;
    }
    const code = barcode.trim().toUpperCase().replace(/\s+/g, '');
    if (!code) {
      setError(
        codeMode === 'scan'
          ? 'Pistolea o ingresa un código, o elige Autogenerar'
          : 'Espera el código autogenerado o pulsa Otro código',
      );
      return;
    }
    if (codeMode === 'scan' && codeAvailability === 'taken') {
      setError('Ese código ya está en uso');
      return;
    }
    if (!name.trim()) {
      setError('Ingresa el nombre de la prenda');
      return;
    }
    const qty = Math.floor(Number(receiveQty));
    if (!Number.isFinite(qty) || qty < 1) {
      setError('Indica la cantidad (mínimo 1)');
      return;
    }
    if (qty > pendingOnLine) {
      setError(`Solo quedan ${pendingOnLine} en esta línea`);
      return;
    }
    void executeCreate();
  }

  async function handleReprintOnly() {
    if (!selected) {
      setError('Selecciona una prenda');
      return;
    }
    if (printBusy) return;
    setError('');
    const copies = Math.floor(Number(labelCopies));
    if (!Number.isFinite(copies) || copies < 1) {
      setError('Indica cuántas etiquetas imprimir');
      return;
    }
    const code = (selected.barcode || selected.internal_code || '').trim();
    if (!code) {
      setError('Esta prenda no tiene código. No se puede imprimir.');
      return;
    }
    setBusy(true);
    setPrintBusy(true);
    try {
      await onPrintLabel(selected.name, code, copies);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo imprimir');
    } finally {
      setBusy(false);
      setPrintBusy(false);
    }
  }

  async function executeLinkExisting() {
    if (!selected || !pickLineId || !selectedLine) return;
    const qty = Math.floor(Number(receiveQty));
    const copies = Math.max(1, Math.floor(Number(labelCopies) || 1));
    setBusy(true);
    setError('');
    try {
      await onLinkExisting({
        purchaseItemId: pickLineId,
        product: selected,
        quantityReceived: qty,
        labelCopies: copies,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo vincular');
    } finally {
      setBusy(false);
    }
  }

  function handleLinkExisting() {
    if (!selected) {
      setError('Selecciona una prenda');
      return;
    }
    if (!pickLineId || !selectedLine) {
      setError('Elige la línea del ingreso para vincular');
      return;
    }
    const qty = Math.floor(Number(receiveQty));
    if (!Number.isFinite(qty) || qty < 1) {
      setError('Indica la cantidad (mínimo 1)');
      return;
    }
    if (qty > pendingOnLine) {
      setError(`Solo quedan ${pendingOnLine} en esta línea`);
      return;
    }
    void executeLinkExisting();
  }

  return (
    <div
      className="pos-modal open no-print"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <ModalOverlayClose onClose={requestClose}>
      <div className="ing-line-modal-shell prod-modal-shell">
      <div
        className="pos-modal-panel ing-nb-panel prod-modal ing-line-modal"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="pos-modal-head">
          <h3 id={titleId}>{scannedCreate ? 'Nueva prenda' : 'Sin código de barras'}</h3>
        </div>

        {!scannedCreate ? (
        <div className="ing-nb-tabs" role="tablist" aria-label="Modo">
          {canCreateProduct ? (
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'new'}
              className={`ing-nb-tab${mode === 'new' ? ' is-active' : ''}`}
              onClick={() => {
                setMode('new');
                setError('');
              }}
            >
              Producto nuevo
            </button>
          ) : null}
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'search'}
            className={`ing-nb-tab${mode === 'search' ? ' is-active' : ''}`}
            onClick={() => {
              setMode('search');
              setError('');
            }}
          >
            Buscar existente
          </button>
        </div>
        ) : null}
        {!canCreateProduct ? (
          <p className="ing-hint" style={{ padding: '0 1.25rem' }}>
            Solo la administración puede dar de alta el código en el sistema. Puedes buscar una
            prenda ya registrada e imprimir la etiqueta.
          </p>
        ) : null}

        {mode === 'new' ? (
          <>
            <div className="ing-nb-body" role="tabpanel">
              {!lines.length ? (
                <p className="ing-hint">
                  No hay líneas sin vincular. Usa “Buscar existente” para reimprimir una etiqueta.
                </p>
              ) : (
                <>
                  <div className="ing-nb-setup">
                    <p className="ing-hint">
                      {scannedCreate
                        ? 'Completa la ficha con el código escaneado y elige la línea del ingreso.'
                        : 'Elige la línea y completa la ficha. El código (LS…) es el de la etiqueta y de la pistola.'}
                    </p>

                    <div className="ing-line-picks" role="radiogroup" aria-label="Líneas pendientes">
                      {lines.map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          role="radio"
                          aria-checked={pickLineId === l.id}
                          className={`ing-line-pick${pickLineId === l.id ? ' is-selected' : ''}`}
                          onClick={() => setPickLineId(l.id)}
                        >
                          <strong>{l.description}</strong>
                          <span>
                            {l.draftReceived}/{l.quantity_ordered} · quedan {linePending(l)}
                            {lineFloorSalePrice(l) > 0
                              ? ` · P. venta ${money(lineFloorSalePrice(l))}`
                              : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="prod-modal-body">
                    <div className="prod-modal-photo">
                      {photoSrc ? (
                        <img src={photoSrc} alt="" />
                      ) : (
                        <ProductPhotoPlaceholder className="prod-modal-photo-empty" />
                      )}
                      <div className="prod-modal-photo-actions">
                        <ProductPhotoInput
                          hasPhoto={Boolean(photoSrc)}
                          busy={photoBusy}
                          disabled={busy}
                          onPick={(file) => void onPhoto(file)}
                        />
                        {photoSrc ? (
                          <button
                            type="button"
                            className="btn ghost"
                            disabled={busy || photoBusy}
                            onClick={clearPhoto}
                          >
                            Quitar
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="prod-modal-fields">
                      <ProductFichaFields
                        idPrefix="ing-nb"
                        values={{
                          name,
                          categoryId,
                          brand,
                          productType,
                          sizeLabel,
                          color,
                          season,
                          description,
                        }}
                        onChange={(partial) => {
                          if (partial.name !== undefined) setName(partial.name);
                          if (partial.categoryId !== undefined) setCategoryId(partial.categoryId);
                          if (partial.brand !== undefined) setBrand(partial.brand);
                          if (partial.productType !== undefined) setProductType(partial.productType);
                          if (partial.sizeLabel !== undefined) setSizeLabel(partial.sizeLabel);
                          if (partial.color !== undefined) setColor(partial.color);
                          if (partial.season !== undefined) setSeason(partial.season);
                          if (partial.description !== undefined) setDescription(partial.description);
                        }}
                        categories={categories}
                        disabled={busy || photoBusy}
                        code={{
                          locked: false,
                          value: barcode,
                          onChange: (v) => {
                            setBarcode(v);
                            setCodeAvailability('idle');
                          },
                          helper: '',
                          slot: (
                            <ProductCodeEntry
                              id="ing-nb-code"
                              value={barcode}
                              mode={codeMode}
                              onModeChange={(m) => {
                                setCodeMode(m);
                                setCodeAvailability('idle');
                                if (m === 'scan' && !scannedCreate) setBarcode('');
                              }}
                              onChange={(v) => {
                                setBarcode(v);
                                setCodeAvailability('idle');
                              }}
                              onAutogenerate={fetchNextCode}
                              disabled={busy || photoBusy}
                              generating={codeGenerating}
                              availability={codeAvailability}
                              onBlurCheck={() => void checkScanBarcode()}
                            />
                          ),
                        }}
                        salePrice={{
                          mode: 'locked',
                          display: displaySale > 0 ? money(displaySale) : '—',
                          amount: displaySale > 0 ? displaySale : undefined,
                          hint: 'Fijado en la compra · no editable en recepción',
                        }}
                        costPrice={selectedLine ? Number(selectedLine.unit_cost) : null}
                      />
                      <div className="ing-nb-grid">
                        <div className="field">
                          <label htmlFor="ing-nb-qty">Cantidad</label>
                          <input
                            id="ing-nb-qty"
                            type="number"
                            min={1}
                            max={Math.max(1, pendingOnLine)}
                            value={receiveQty}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setReceiveQty(v);
                              if (Number.isFinite(v) && v >= 1) setLabelCopies(v);
                            }}
                          />
                          {pendingOnLine > 1 ? (
                            <span className="ing-hint">Máximo {pendingOnLine} en esta línea</span>
                          ) : null}
                        </div>
                        <div className="field">
                          <label htmlFor="ing-nb-labels">Etiquetas</label>
                          <input
                            id="ing-nb-labels"
                            type="number"
                            min={1}
                            max={999}
                            value={labelCopies}
                            onChange={(e) => setLabelCopies(Number(e.target.value))}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {error ? <p className="error">{error}</p> : null}
            </div>

            <div className="btn-row ing-nb-actions prod-modal-actions ing-line-modal-actions">
              <button
                type="button"
                className="btn secondary"
                disabled={busy || printBusy || !barcode.trim() || !name.trim()}
                onClick={() => {
                  void (async () => {
                    if (printBusy) return;
                    const copies = Math.max(1, Math.floor(Number(labelCopies) || 1));
                    if (!barcode.trim()) {
                      setError('Ingresa el código de la prenda');
                      return;
                    }
                    setPrintBusy(true);
                    setError('');
                    try {
                      await onPrintLabel(
                        name.trim() || "Boutique L'Scala",
                        barcode.trim(),
                        copies,
                      );
                    } finally {
                      setPrintBusy(false);
                    }
                  })();
                }}
              >
                {printBusy
                  ? 'Enviando…'
                  : `Imprimir ${Math.max(1, Math.floor(Number(labelCopies) || 1))} etiqueta${
                      Math.max(1, Math.floor(Number(labelCopies) || 1)) === 1 ? '' : 's'
                    }`}
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy || printBusy || !lines.length}
                onClick={() => void handleCreate()}
              >
                {busy ? 'Guardando…' : 'Crear y recibir'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="ing-nb-body" role="tabpanel">
            <p className="ing-hint">
              Busca por nombre, marca, categoría o código interno. Puedes reimprimir o vincular a una
              línea pendiente.
            </p>
            <div className="field">
              <label htmlFor={searchId}>Buscar prenda</label>
              <input
                id={searchId}
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Ej. vestido negro, LS000012"
                autoComplete="off"
              />
            </div>

            <ul className="ing-nb-search-list" aria-label="Resultados">
              {searchBusy ? <li className="muted">Buscando…</li> : null}
              {!searchBusy && searchQ.trim().length >= 2 && !searchHits.length ? (
                <li className="muted">Sin resultados</li>
              ) : null}
              {searchHits.map((p) => {
                const meta = [p.size_label, p.color, p.brand, p.category_name, p.internal_code]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={`ing-nb-search-hit${selected?.id === p.id ? ' is-selected' : ''}`}
                      onClick={() => {
                        setSelected(p);
                        setError('');
                      }}
                    >
                      <span className="ing-nb-search-thumb" aria-hidden>
                        {p.photo_url ? (
                          <img src={mediaUrl(p.photo_url)} alt="" />
                        ) : (
                          <ProductPhotoPlaceholder />
                        )}
                      </span>
                      <span className="ing-nb-search-info">
                        <strong>{p.name}</strong>
                        <span className="meta">
                          {p.color ? <ColorSwatch color={p.color} size="sm" /> : null}
                          {meta || 'Sin detalle'}
                        </span>
                        <span className="meta">
                          Código {p.barcode || p.internal_code}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {selected && lines.length > 0 ? (
              <div className="ing-line-picks" role="radiogroup" aria-label="Línea a vincular">
                {lines.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    role="radio"
                    aria-checked={pickLineId === l.id}
                    className={`ing-line-pick${pickLineId === l.id ? ' is-selected' : ''}`}
                    onClick={() => setPickLineId(l.id)}
                  >
                    <strong>{l.description}</strong>
                    <span>
                      Recibido {l.draftReceived}/{l.quantity_ordered} · Pendiente {linePending(l)}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            {selected ? (
              <div className="ing-nb-grid">
                {lines.length > 0 ? (
                  <div className="field">
                    <label htmlFor="ing-nb-qty-search">Cantidad</label>
                    <input
                      id="ing-nb-qty-search"
                      type="number"
                      min={1}
                      max={Math.max(1, pendingOnLine)}
                      value={receiveQty}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setReceiveQty(v);
                        if (Number.isFinite(v) && v >= 1) setLabelCopies(v);
                      }}
                    />
                    {pendingOnLine > 1 ? (
                      <span className="ing-hint">Máximo {pendingOnLine} en esta línea</span>
                    ) : null}
                  </div>
                ) : null}
                <div className="field">
                  <label htmlFor="ing-nb-labels-search">Etiquetas</label>
                  <input
                    id="ing-nb-labels-search"
                    type="number"
                    min={1}
                    max={999}
                    value={labelCopies}
                    onChange={(e) => setLabelCopies(Number(e.target.value))}
                  />
                </div>
              </div>
            ) : null}

            {error ? <p className="error">{error}</p> : null}
            </div>

            <div className="btn-row ing-nb-actions prod-modal-actions ing-line-modal-actions">
              <button
                type="button"
                className="btn secondary"
                disabled={busy || printBusy || !selected}
                onClick={() => void handleReprintOnly()}
              >
                {busy || printBusy
                  ? 'Imprimiendo…'
                  : `Reimprimir ${Math.max(1, Math.floor(Number(labelCopies) || 1))} etiqueta${
                      Math.max(1, Math.floor(Number(labelCopies) || 1)) === 1 ? '' : 's'
                    }`}
              </button>
              {lines.length > 0 ? (
                <button
                  type="button"
                  className="btn"
                  disabled={busy || !selected || !pickLineId}
                  onClick={() => void handleLinkExisting()}
                >
                  {busy ? 'Vinculando…' : 'Vincular'}
                </button>
              ) : null}
            </div>
            {lines.length > 0 ? (
              <p className="ing-hint ing-nb-foot-hint">
                Vincular deja la cantidad en borrador: usa «Confirmar recepción» para sumar al stock.
              </p>
            ) : null}
          </>
        )}
      </div>
      </div></ModalOverlayClose>
      <ConfirmDialog
        open={cancelConfirm}
        title="¿Cancelar?"
        message="¿Estás seguro de que deseas cancelar? Los datos ingresados se perderán."
        confirmLabel="Sí, cancelar"
        cancelLabel="Seguir editando"
        danger
        onCancel={() => setCancelConfirm(false)}
        onConfirm={() => {
          setCancelConfirm(false);
          onClose();
        }}
      />
    </div>
  );
}
