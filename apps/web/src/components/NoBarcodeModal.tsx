import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ColorSelect } from './ColorSelect';
import { ColorSwatch } from './ColorSwatch';
import { ProductPhotoPlaceholder } from './ProductPhotoPlaceholder';
import { api, mediaUrl, money } from '../lib/api';
import { COLOR_PRESETS } from '../lib/colorSwatch';
import { lineFloorSalePrice, type PurchaseItem } from '../lib/purchasesStatus';

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
    quantityReceived: number;
    labelCopies: number;
  }) => Promise<void>;
  onLinkExisting: (payload: {
    purchaseItemId: string;
    product: ProductSearchHit;
    quantityReceived: number;
    labelCopies: number;
    barcode?: string;
  }) => Promise<void>;
  onPrintLabel: (name: string, code: string, copies: number) => void | Promise<void>;
  onAssignBarcodeAndPrint: (
    product: ProductSearchHit,
    barcode: string,
    labelCopies: number,
  ) => Promise<void>;
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
  onClose,
  onCreateAndReceive,
  onLinkExisting,
  onPrintLabel,
  onAssignBarcodeAndPrint,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const searchId = useId();
  const [mode, setMode] = useState<Mode>('new');
  const [busy, setBusy] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);
  const [error, setError] = useState('');

  const [pickLineId, setPickLineId] = useState('');
  const [barcode, setBarcode] = useState(suggestedBarcode);
  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [sizeLabel, setSizeLabel] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brand, setBrand] = useState('');
  const [productType, setProductType] = useState('');
  const [receiveQty, setReceiveQty] = useState(1);
  const [labelCopies, setLabelCopies] = useState(1);

  const [searchQ, setSearchQ] = useState('');
  const [searchHits, setSearchHits] = useState<ProductSearchHit[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [selected, setSelected] = useState<ProductSearchHit | null>(null);
  const [existingBarcode, setExistingBarcode] = useState('');

  const selectedLine = useMemo(
    () => lines.find((l) => l.id === pickLineId) ?? null,
    [lines, pickLineId],
  );

  const displaySale = selectedLine ? lineFloorSalePrice(selectedLine) : 0;
  const pendingOnLine = selectedLine ? linePending(selectedLine) : 0;

  useEffect(() => {
    if (!open) return;
    setMode('new');
    setError('');
    setBusy(false);
    setBarcode(suggestedBarcode);
    setSearchQ('');
    setSearchHits([]);
    setSelected(null);
    setExistingBarcode('');
    const first = lines[0];
    const pend = first ? linePending(first) : 1;
    setPickLineId(first?.id || '');
    setName(first?.description || '');
    setColor(first?.color || '');
    setSizeLabel(first?.size_label || '');
    setCategoryId('');
    setBrand('');
    setProductType('');
    setReceiveQty(Math.max(1, pend));
    setLabelCopies(Math.max(1, pend));
    requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>('input, select, button')?.focus();
    });
  }, [open, suggestedBarcode, lines]);

  useEffect(() => {
    if (!selectedLine || mode !== 'new') return;
    const pend = linePending(selectedLine);
    setReceiveQty(Math.max(1, pend));
    setLabelCopies(Math.max(1, pend));
    if (!name.trim()) setName(selectedLine.description || '');
    if (!color && selectedLine.color) setColor(selectedLine.color);
    if (!sizeLabel && selectedLine.size_label) setSizeLabel(selectedLine.size_label);
  }, [selectedLine?.id, mode]);

  useEffect(() => {
    if (!selectedLine || mode !== 'search') return;
    const pend = linePending(selectedLine);
    setReceiveQty(Math.max(1, pend || 1));
    setLabelCopies(Math.max(1, pend || 1));
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

  async function handleCreate() {
    setError('');
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
      setError('Ingresa un código de barras');
      return;
    }
    if (!name.trim()) {
      setError('Ingresa el nombre de la prenda');
      return;
    }
    const qty = Math.floor(Number(receiveQty));
    const copies = Math.floor(Number(labelCopies));
    if (!Number.isFinite(qty) || qty < 1) {
      setError('Indica la cantidad recibida (mínimo 1)');
      return;
    }
    if (qty > pendingOnLine) {
      setError(`Solo quedan ${pendingOnLine} pendiente${pendingOnLine === 1 ? '' : 's'} en esta línea`);
      return;
    }
    if (!Number.isFinite(copies) || copies < 1) {
      setError('Indica cuántas etiquetas imprimir');
      return;
    }
    setBusy(true);
    try {
      const check = await checkBarcodeUnique(code);
      if (!check.available) {
        setError('Ese código de barras ya existe');
        return;
      }
      await onCreateAndReceive({
        purchaseItemId: pickLineId,
        barcode: check.barcode || code,
        name: name.trim(),
        categoryId: categoryId || null,
        brand: brand.trim() || null,
        sizeLabel: sizeLabel.trim() || null,
        color: color.trim() || null,
        productType: productType.trim() || null,
        quantityReceived: qty,
        labelCopies: copies,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la prenda');
    } finally {
      setBusy(false);
    }
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
    setBusy(true);
    setPrintBusy(true);
    try {
      let code = (selected.barcode || existingBarcode || '').trim().toUpperCase();
      if (!code) {
        const next = await api<{ nextBarcode: string }>('/api/products/next-barcode');
        code = next.nextBarcode;
        setExistingBarcode(code);
      }
      const check = await checkBarcodeUnique(code, selected.id);
      if (!selected.barcode && !check.available) {
        setError('Ese código de barras ya existe');
        return;
      }
      if (!selected.barcode) {
        await onAssignBarcodeAndPrint(selected, check.barcode || code, copies);
      } else {
        await onPrintLabel(selected.name, selected.barcode, copies);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo imprimir');
    } finally {
      setBusy(false);
      setPrintBusy(false);
    }
  }

  async function handleLinkExisting() {
    if (!selected) {
      setError('Selecciona una prenda');
      return;
    }
    if (!pickLineId || !selectedLine) {
      setError('Elige la línea del ingreso para vincular');
      return;
    }
    const qty = Math.floor(Number(receiveQty));
    const copies = Math.floor(Number(labelCopies));
    if (!Number.isFinite(qty) || qty < 1) {
      setError('Indica la cantidad recibida (mínimo 1)');
      return;
    }
    if (qty > pendingOnLine) {
      setError(`Solo quedan ${pendingOnLine} pendiente${pendingOnLine === 1 ? '' : 's'} en esta línea`);
      return;
    }
    if (!Number.isFinite(copies) || copies < 1) {
      setError('Indica cuántas etiquetas imprimir');
      return;
    }
    setError('');
    setBusy(true);
    try {
      let assignBarcode: string | undefined;
      if (!selected.barcode) {
        let code = existingBarcode.trim().toUpperCase();
        if (!code) {
          const next = await api<{ nextBarcode: string }>('/api/products/next-barcode');
          code = next.nextBarcode;
          setExistingBarcode(code);
        }
        const check = await checkBarcodeUnique(code, selected.id);
        if (!check.available) {
          setError('Ese código de barras ya existe');
          return;
        }
        assignBarcode = check.barcode || code;
      }
      await onLinkExisting({
        purchaseItemId: pickLineId,
        product: selected,
        quantityReceived: qty,
        labelCopies: copies,
        barcode: assignBarcode,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo vincular');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="pos-modal open no-print"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="pos-modal-panel ing-nb-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="pos-modal-head">
          <h3 id={titleId}>Sin código de barras</h3>
          <button type="button" className="btn ghost" onClick={onClose} aria-label="Cerrar">
            Cerrar
          </button>
        </div>

        <div className="ing-nb-tabs" role="tablist" aria-label="Modo">
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

        {mode === 'new' ? (
          <div className="ing-nb-body" role="tabpanel">
            {!lines.length ? (
              <p className="ing-hint">
                No hay líneas sin vincular. Usa “Buscar existente” para reimprimir una etiqueta.
              </p>
            ) : (
              <>
                <p className="ing-hint">Elige la línea y completa la ficha. El código no lleva guión (ej. BC000003).</p>

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
                        Recibido {l.draftReceived}/{l.quantity_ordered} · Pendiente{' '}
                        {linePending(l)}
                        {lineFloorSalePrice(l) > 0
                          ? ` · P. venta ${money(lineFloorSalePrice(l))}`
                          : ''}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="ing-nb-grid">
                  <div className="field">
                    <label htmlFor="ing-nb-code">Código de barras</label>
                    <input
                      id="ing-nb-code"
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value.toUpperCase())}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <span className="ing-hint">Sugerido: {suggestedBarcode}</span>
                  </div>
                  <div className="field">
                    <label htmlFor="ing-nb-name">Nombre</label>
                    <input
                      id="ing-nb-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="ing-nb-color">Color</label>
                    <ColorSelect
                      id="ing-nb-color"
                      value={color}
                      onChange={setColor}
                      disabled={busy}
                    />
                    <input
                      className="ing-nb-color-custom"
                      aria-label="Color personalizado"
                      placeholder="Otro color…"
                      value={
                        color && !(COLOR_PRESETS as readonly string[]).includes(color)
                          ? color
                          : ''
                      }
                      onChange={(e) => setColor(e.target.value)}
                      autoComplete="off"
                      disabled={busy}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="ing-nb-size">Talla</label>
                    <input
                      id="ing-nb-size"
                      value={sizeLabel}
                      onChange={(e) => setSizeLabel(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="ing-nb-cat">Categoría</label>
                    <select
                      id="ing-nb-cat"
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                    >
                      <option value="">Sin categoría</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="ing-nb-brand">Marca</label>
                    <input
                      id="ing-nb-brand"
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="ing-nb-type">Tipología</label>
                    <input
                      id="ing-nb-type"
                      value={productType}
                      onChange={(e) => setProductType(e.target.value)}
                      placeholder="Ej. vestido, jeans"
                      autoComplete="off"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="ing-nb-sale">Precio de venta</label>
                    <input
                      id="ing-nb-sale"
                      value={displaySale > 0 ? money(displaySale) : '—'}
                      disabled
                      readOnly
                      aria-readonly="true"
                    />
                    <span className="ing-hint">Fijado en la compra · no editable en recepción</span>
                  </div>
                  <div className="field">
                    <label htmlFor="ing-nb-qty">Cantidad recibida</label>
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
                    <span className="ing-hint">
                      Pendiente en la línea: {pendingOnLine}
                    </span>
                  </div>
                  <div className="field">
                    <label htmlFor="ing-nb-labels">Imprimir N etiquetas</label>
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
              </>
            )}

            {error ? <p className="error">{error}</p> : null}

            <div className="btn-row ing-nb-actions">
              <button
                type="button"
                className="btn secondary"
                disabled={busy || printBusy || !barcode.trim() || !name.trim()}
                onClick={() => {
                  void (async () => {
                    if (printBusy) return;
                    setPrintBusy(true);
                    try {
                      await onPrintLabel(
                        name.trim() || "Boutique L'Scala",
                        barcode.trim(),
                        Math.max(1, Math.floor(Number(labelCopies) || 1)),
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
                {busy ? 'Guardando…' : 'Usar y crear'}
              </button>
            </div>
          </div>
        ) : (
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
                placeholder="Ej. vestido negro, LS-000012"
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
                        setExistingBarcode(p.barcode || '');
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
                          {p.barcode ? `Barcode ${p.barcode}` : 'Sin barcode'}
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

            {selected && !selected.barcode ? (
              <div className="field">
                <label htmlFor="ing-nb-assign-code">Asignar código</label>
                <input
                  id="ing-nb-assign-code"
                  value={existingBarcode}
                  onChange={(e) => setExistingBarcode(e.target.value.toUpperCase())}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Se sugiere el correlativo si falta"
                />
              </div>
            ) : null}

            {selected ? (
              <div className="ing-nb-grid">
                {lines.length > 0 ? (
                  <div className="field">
                    <label htmlFor="ing-nb-qty-search">Cantidad recibida</label>
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
                    <span className="ing-hint">Pendiente en la línea: {pendingOnLine}</span>
                  </div>
                ) : null}
                <div className="field">
                  <label htmlFor="ing-nb-labels-search">Imprimir N etiquetas</label>
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

            <div className="btn-row ing-nb-actions">
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
                  {busy ? 'Vinculando…' : 'Vincular y recibir'}
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
