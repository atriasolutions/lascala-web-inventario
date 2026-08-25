import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useBlocker } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ModalOverlayClose } from '../components/ModalOverlayClose';
import { SaleThermalPrint } from '../components/SaleThermalPrint';
import { ColorSwatch } from '../components/ColorSwatch';
import { ProductPhotoPlaceholder } from '../components/ProductPhotoPlaceholder';
import { api, mediaUrl, money } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useNetworkStatus } from '../lib/networkStatus';
import { usePosCatalog } from '../hooks/usePosCatalog';
import { useOfflineSalesQueue } from '../hooks/useOfflineSalesQueue';
import {
  buildChangeTickets,
  type SalePrintItem,
  type SalePrintSale,
  type SalePrintVoucher,
} from '../lib/salePrint';
import { toast } from '../lib/toast';
import { useSalePrint } from '../lib/useSalePrint';
import type { PosCatalogProduct } from '../lib/posCatalogCache';

type Product = {
  id: string;
  name: string;
  internal_code: string;
  sale_price: string;
  stock?: number | string;
  photo_url?: string | null;
  category_name?: string | null;
  size_label?: string | null;
  color?: string | null;
  allows_exchange?: boolean;
  allows_return?: boolean;
  barcode?: string | null;
};

function fromCatalog(p: PosCatalogProduct): Product {
  return {
    id: p.id,
    name: p.name,
    internal_code: p.internal_code,
    sale_price: p.sale_price,
    stock: p.stock,
    photo_url: p.photo_url,
    category_name: p.category_name,
    size_label: p.size_label,
    color: p.color,
    allows_exchange: p.allows_exchange,
    allows_return: p.allows_return,
    barcode: p.barcode,
  };
}

type CartLine = { product: Product; quantity: number };

function productAllowsVoucher(p: Product) {
  return Boolean(p.allows_exchange || p.allows_return);
}

function stockOf(p: Product): number | null {
  if (p.stock === undefined || p.stock === null || p.stock === '') return null;
  const n = Number(p.stock);
  return Number.isFinite(n) ? n : null;
}

/** Cantidad en carrito mayor que stock disponible (si hay dato de stock). */
function lineLacksStock(c: CartLine): boolean {
  const stock = stockOf(c.product);
  if (stock === null) return false;
  return c.quantity > stock;
}

function ProductThumb({
  product,
  className,
  decorative = false,
}: {
  product: Product;
  className: string;
  decorative?: boolean;
}) {
  const url = mediaUrl(product.photo_url);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  if (url && !failed) {
    return (
      <div className={className}>
        <img
          key={url}
          src={url}
          alt={decorative ? '' : product.name}
          onError={() => setFailed(true)}
        />
      </div>
    );
  }
  return (
    <div className={`${className} is-empty`} aria-hidden={decorative || undefined}>
      <ProductPhotoPlaceholder showLabel={!url} />
    </div>
  );
}

/** Stage: fondo blur cover + imagen completa contain centrada. */
function StagePhoto({ product }: { product: Product }) {
  const url = mediaUrl(product.photo_url);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  if (!url) {
    return (
      <div className="pos-stage-photo is-empty is-no-photo" aria-hidden>
        <ProductPhotoPlaceholder />
      </div>
    );
  }
  if (failed) {
    return (
      <div className="pos-stage-photo is-empty is-no-photo" aria-hidden>
        <ProductPhotoPlaceholder showLabel={false} />
        <span className="product-no-photo-label">No se pudo cargar la foto</span>
      </div>
    );
  }
  return (
    <div className="pos-stage-photo">
      <img className="pos-stage-photo-bg" src={url} alt="" aria-hidden onError={() => setFailed(true)} />
      <img className="pos-stage-photo-fg" src={url} alt="" onError={() => setFailed(true)} />
    </div>
  );
}

export function PosPage() {
  const { posId, branchId } = useAuth();
  const { online } = useNetworkStatus();
  const catalog = usePosCatalog(branchId);
  const offlineQueue = useOfflineSalesQueue(branchId);
  const {
    search: searchCatalog,
    findByCode,
    ready: catalogReady,
    syncing: catalogSyncing,
    loading: catalogLoading,
    stale: catalogStale,
    error: catalogError,
    meta: catalogMeta,
    products: catalogProducts,
    applyLocalSale,
    rememberProduct,
  } = catalog;
  const { printJob, setPrintJob, reminder: printReminder } = useSalePrint();
  const [code, setCode] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [stage, setStage] = useState<Product | null>(null);
  const [liveMsg, setLiveMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [stagePulse, setStagePulse] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [includeChangeTickets, setIncludeChangeTickets] = useState(true);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const barcodeRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const modalPanelRef = useRef<HTMLDivElement>(null);
  const confirmCancelRef = useRef<HTMLButtonElement>(null);
  const searchTitleId = useId();
  const confirmTitleId = useId();
  const confirmDescId = useId();

  const eligibleVoucherUnits = useMemo(
    () =>
      cart.reduce(
        (sum, c) => sum + (productAllowsVoucher(c.product) ? c.quantity : 0),
        0,
      ),
    [cart],
  );
  const canIncludeTickets = eligibleVoucherUnits > 0;

  const cartHasItems = cart.length > 0;

  /** Bloquea cambio de ruta (menú, atrás, logout→login) si hay prendas en el carrito. */
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      cartHasItems && currentLocation.pathname !== nextLocation.pathname,
  );
  const leaveOpen = blocker.state === 'blocked';

  useEffect(() => {
    if (!cartHasItems) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [cartHasItems]);

  const cancelLeave = useCallback(() => {
    if (blocker.state === 'blocked') blocker.reset();
    requestAnimationFrame(() => barcodeRef.current?.focus());
  }, [blocker]);

  const confirmLeave = useCallback(() => {
    // No vaciar el carrito antes: al pasar cartHasItems a false el blocker se resetea sin navegar.
    if (blocker.state === 'blocked') blocker.proceed();
  }, [blocker]);

  function focusBarcode() {
    requestAnimationFrame(() => barcodeRef.current?.focus());
  }

  function addProduct(product: Product) {
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.product.id === product.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = {
          ...copy[idx],
          quantity: copy[idx].quantity + 1,
          product: { ...copy[idx].product, ...product },
        };
        return copy;
      }
      return [...prev, { product, quantity: 1 }];
    });
    setStage(product);
    setStagePulse(true);
    setLiveMsg(`${product.name} agregado`);
    setCode('');
    if (barcodeRef.current) barcodeRef.current.value = '';
    focusBarcode();
  }

  useEffect(() => {
    if (!stagePulse) return;
    const t = window.setTimeout(() => setStagePulse(false), 220);
    return () => window.clearTimeout(t);
  }, [stagePulse]);

  async function addByCode(e?: FormEvent) {
    e?.preventDefault();
    // Pistola: Enter llega antes de que React flushee onChange → leer el DOM.
    const raw = (barcodeRef.current?.value ?? code).trim();
    if (!raw) return;

    // Offline: solo catálogo local.
    if (!online) {
      const cached = findByCode(raw);
      if (cached) {
        addProduct(fromCatalog(cached));
        return;
      }
      toast.error('Producto no encontrado en el catálogo de este equipo');
      setCode('');
      if (barcodeRef.current) barcodeRef.current.value = '';
      focusBarcode();
      return;
    }

    // Online: siempre /by-code (stock + foto de la sucursal activa), no el IndexedDB viejo.
    try {
      const data = await api<{ product: Product & Record<string, unknown> }>(
        `/api/products/by-code/${encodeURIComponent(raw)}`,
      );
      await rememberProduct(data.product as unknown as Record<string, unknown>);
      addProduct(data.product);
    } catch (err) {
      const cached = findByCode(raw);
      if (cached) {
        addProduct(fromCatalog(cached));
        toast.warn(
          'No se pudo consultar el servidor · se usó el catálogo local (el stock puede estar desactualizado)',
        );
        return;
      }
      toast.error(err instanceof Error ? err.message : 'Producto no encontrado');
      focusBarcode();
    }
  }

  const total = cart.reduce((sum, c) => sum + Number(c.product.sale_price) * c.quantity, 0);

  function bumpQty(id: string, delta: number) {
    setCart((prev) =>
      prev
        .map((c) => (c.product.id === id ? { ...c, quantity: c.quantity + delta } : c))
        .filter((c) => c.quantity > 0),
    );
    focusBarcode();
  }

  function clearCart() {
    setCart([]);
    setStage(null);
    setConfirmOpen(false);
    focusBarcode();
  }

  function openFinalizeConfirm() {
    if (!posId) {
      toast.error('Selecciona un POS para finalizar');
      return;
    }
    if (!cart.length) {
      toast.error('Agrega prendas antes de finalizar');
      return;
    }
    if (cart.some(lineLacksStock)) {
      toast.error('No hay unidades suficientes en esta sucursal');
      return;
    }
    if (!online && !catalogReady) {
      toast.error('Sin catálogo guardado. Conéctate una vez para poder vender offline.');
      return;
    }
    setIncludeChangeTickets(eligibleVoucherUnits > 0);
    setConfirmOpen(true);
  }

  function closeFinalizeConfirm() {
    if (busy) return;
    setConfirmOpen(false);
    focusBarcode();
  }

  async function confirmFinalize() {
    if (!posId || !cart.length || !branchId) return;
    if (cart.some(lineLacksStock)) {
      toast.error('No hay unidades suficientes en esta sucursal');
      setConfirmOpen(false);
      return;
    }
    const wantTickets = includeChangeTickets && canIncludeTickets;
    setBusy(true);
    try {
      if (!online) {
        const clientSaleId = crypto.randomUUID();
        const items = cart.map((c) => ({
          productId: c.product.id,
          quantity: c.quantity,
          unitPrice: Number(c.product.sale_price) || 0,
        }));
        const { pendingCount: pendingAfter } = await offlineQueue.enqueue({
          clientSaleId,
          branchId,
          posId,
          soldAt: new Date().toISOString(),
          items,
          notes: 'Venta offline',
        });
        await applyLocalSale(items);
        toast.success(
          pendingAfter > 1
            ? `Venta guardada en este equipo · ${pendingAfter} pendientes de sincronizar`
            : 'Venta guardada en este equipo · se enviará al volver la red',
        );
        setConfirmOpen(false);
        setCart([]);
        setStage(null);
        setLiveMsg('Venta guardada offline');
        focusBarcode();
        return;
      }

      const data = await api<{ sale: { id: string; receipt_number: string }; vouchers: unknown[] }>(
        '/api/sales',
        {
          method: 'POST',
          body: {
            posId,
            items: cart.map((c) => ({ productId: c.product.id, quantity: c.quantity })),
          },
        },
      );
      const detail = await api<{
        sale: SalePrintSale;
        items: SalePrintItem[];
        vouchers?: SalePrintVoucher[];
      }>(`/api/sales/${data.sale.id}`);
      const tickets = wantTickets
        ? buildChangeTickets(detail.sale, detail.items, detail.vouchers || [])
        : [];
      setPrintJob({
        sale: detail.sale,
        items: detail.items,
        changeTickets: tickets,
      });
      // Mantener cache local alineado tras venta online.
      await applyLocalSale(
        cart.map((c) => ({ productId: c.product.id, quantity: c.quantity })),
      );
      const parts = [`Venta ${data.sale.receipt_number} registrada`];
      if (wantTickets && tickets.length) {
        parts.push(`${tickets.length} ticket${tickets.length === 1 ? '' : 's'} de cambio`);
      }
      toast.success(parts.join(' · '));
      setConfirmOpen(false);
      setCart([]);
      setStage(null);
      setLiveMsg('Venta registrada');
      focusBarcode();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al finalizar la venta';
      toast.error(msg === 'Stock insuficiente' ? 'Stock insuficiente para completar la venta' : msg);
    } finally {
      setBusy(false);
    }
  }

  function openSearch() {
    setSearchOpen(true);
    setSearchQ('');
    setSearchResults([]);
  }

  function closeSearch() {
    setSearchOpen(false);
    setSearchQ('');
    setSearchResults([]);
    focusBarcode();
  }

  async function pickFromSearch(product: Product) {
    setSearchOpen(false);
    setSearchQ('');
    setSearchResults([]);
    if (online) {
      const key = (product.barcode || product.internal_code || '').trim();
      if (key) {
        try {
          const data = await api<{ product: Product & Record<string, unknown> }>(
            `/api/products/by-code/${encodeURIComponent(key)}`,
          );
          await rememberProduct(data.product as unknown as Record<string, unknown>);
          addProduct(data.product);
          return;
        } catch {
          /* caer a la fila de búsqueda */
        }
      }
    }
    addProduct(product);
  }

  // Tras sync del snapshot: alinear stock/foto del carrito y del stage.
  useEffect(() => {
    if (!catalogProducts.length) return;
    const byId = new Map(catalogProducts.map((p) => [p.id, p]));
    setCart((prev) => {
      let changed = false;
      const next = prev.map((line) => {
        const fresh = byId.get(line.product.id);
        if (!fresh) return line;
        const stock = fresh.stock;
        const photo = fresh.photo_url ?? null;
        if (Number(line.product.stock) === stock && (line.product.photo_url || null) === photo) {
          return line;
        }
        changed = true;
        return {
          ...line,
          product: {
            ...line.product,
            stock,
            photo_url: photo,
            name: fresh.name || line.product.name,
            sale_price: fresh.sale_price || line.product.sale_price,
          },
        };
      });
      return changed ? next : prev;
    });
    setStage((prev) => {
      if (!prev) return prev;
      const fresh = byId.get(prev.id);
      if (!fresh) return prev;
      const stock = fresh.stock;
      const photo = fresh.photo_url ?? null;
      if (Number(prev.stock) === stock && (prev.photo_url || null) === photo) return prev;
      return { ...prev, stock, photo_url: photo };
    });
  }, [catalogProducts]);

  useEffect(() => {
    barcodeRef.current?.focus();
  }, []);

  // El resync online lo hace usePosCatalog (montar / online / foco stale / intervalo).
  // No llamar refreshCatalog aquí: una identidad inestable de refresh provocaba loop
  // "Actualizando stock y fotos…".

  useEffect(() => {
    if (!searchOpen) return;
    const q = searchQ.trim();
    if (!q) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    const timer = window.setTimeout(() => {
      if (online) {
        void (async () => {
          try {
            const data = await api<{ products: Product[] }>(
              `/api/products?q=${encodeURIComponent(q)}&limit=30`,
            );
            if (!cancelled) {
              setSearchResults(data.products || []);
              setSearchLoading(false);
            }
          } catch {
            const local = searchCatalog(q, 30).map(fromCatalog);
            if (!cancelled) {
              setSearchResults(local);
              setSearchLoading(false);
            }
          }
        })();
        return;
      }
      const local = searchCatalog(q, 30).map(fromCatalog);
      if (!cancelled) {
        setSearchResults(local);
        setSearchLoading(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchOpen, searchQ, searchCatalog, online]);

  useEffect(() => {
    if (!searchOpen) return;
    const t = window.setTimeout(() => searchInputRef.current?.focus(), 40);

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setSearchOpen(false);
        setSearchQ('');
        setSearchResults([]);
        requestAnimationFrame(() => barcodeRef.current?.focus());
        return;
      }
      if (e.key !== 'Tab' || !modalPanelRef.current) return;
      const focusable = modalPanelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
    };
  }, [searchOpen]);

  useEffect(() => {
    if (!confirmOpen) return;
    const t = window.setTimeout(() => confirmCancelRef.current?.focus(), 40);
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!busy) {
          setConfirmOpen(false);
          requestAnimationFrame(() => barcodeRef.current?.focus());
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
    };
  }, [confirmOpen, busy]);

  function onSearchKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') e.preventDefault();
  }

  const modalBlocksScan = searchOpen || confirmOpen || leaveOpen;

  return (
    <div className="pos-layout">
      <div className="card pos-scan">
        <form onSubmit={addByCode} className="scan-row">
          <input
            id="barcode-input"
            ref={barcodeRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Código de barras o interno (LS…)"
            autoComplete="off"
            inputMode="text"
            autoFocus
            readOnly={modalBlocksScan}
            tabIndex={modalBlocksScan ? -1 : 0}
            aria-label="Código de barras o código interno"
          />
          <button className="btn" type="submit" disabled={!code.trim() || modalBlocksScan}>
            Sumar
          </button>
        </form>
        <button
          className="btn secondary pos-search-trigger"
          type="button"
          data-help="cta.caja.buscar"
          onClick={openSearch}
          disabled={modalBlocksScan}
        >
          Buscar
        </button>
        <p className="pos-catalog-meta muted" aria-live="polite">
          {catalogLoading
            ? 'Cargando catálogo…'
            : catalogSyncing
              ? 'Actualizando stock y fotos desde el servidor…'
              : catalogReady
                ? `${catalogMeta?.count ?? 0} prendas en este equipo${
                    !online ? ' · sin conexión' : catalogStale ? ' · stock local (puede estar viejo)' : ''
                  }${
                    offlineQueue.pendingCount
                      ? ` · ${offlineQueue.pendingCount} venta${
                          offlineQueue.pendingCount === 1 ? '' : 's'
                        } pendiente${offlineQueue.pendingCount === 1 ? '' : 's'}`
                      : ''
                  }${offlineQueue.syncing ? ' · enviando…' : ''}`
                : catalogError || 'Sin catálogo guardado'}
        </p>
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {liveMsg}
        </div>
      </div>

      <div
        className={`pos-stage${stagePulse ? ' is-pulse' : ''}${stage ? '' : ' is-empty'}`}
        aria-live="off"
      >
        {stage ? (
          <>
            <StagePhoto product={stage} />
            <div className="pos-stage-scrim" aria-hidden />
            <div className="pos-stage-meta">
              <div className="pos-stage-meta-stack">
                <strong className="pos-stage-name" title={stage.name}>
                  {stage.name}
                </strong>
                {(stage.size_label || stage.color) && (
                  <div className="pos-stage-attrs" aria-label="Talla y color">
                    {stage.size_label ? (
                      <span className="pos-attr pos-attr--size">
                        <span className="pos-attr-label">Talla</span>
                        <span className="pos-attr-value" title={stage.size_label}>
                          {stage.size_label}
                        </span>
                      </span>
                    ) : null}
                    {stage.color ? (
                      <span className="pos-attr pos-attr--color">
                        <span className="pos-attr-label">Color</span>
                        <span className="pos-attr-value pos-attr-color" title={stage.color}>
                          <ColorSwatch color={stage.color} size="lg" />
                          <span className="pos-attr-color-name">{stage.color}</span>
                        </span>
                      </span>
                    ) : null}
                  </div>
                )}
                <span className="pos-stage-price">{money(stage.sale_price)}</span>
              </div>
            </div>
          </>
        ) : (
          <div className="pos-stage-idle">
            <img
              className="pos-stage-idle-art"
              src="/brand/pos-stage-empty.png"
              alt=""
              aria-hidden
              draggable={false}
            />
            <p className="pos-stage-idle-copy">Los productos escaneados aparecerán aquí</p>
          </div>
        )}
      </div>

      <div className="card pos-ticket">
        <div className="section-title pos-ticket-head">
          <h3 style={{ margin: 0 }}>Esta venta</h3>
          {!!cart.length && (
            <button className="btn ghost" type="button" onClick={clearCart}>
              Vaciar
            </button>
          )}
        </div>

        <div className="pos-ticket-list">
          {!cart.length && <p className="muted">Sin prendas</p>}
          <ul className="pos-cart-list">
            {cart.map((c) => {
              const short = lineLacksStock(c);
              return (
                <li
                  className={`pos-cart-row${short ? ' is-stock-short' : ''}`}
                  key={c.product.id}
                >
                  <ProductThumb product={c.product} className="pos-cart-thumb" decorative />
                  <div className="pos-cart-info">
                    <strong className="pos-cart-name" title={c.product.name}>
                      {c.product.name}
                    </strong>
                    {(c.product.size_label || c.product.color) && (
                      <div className="pos-cart-attrs">
                        {c.product.size_label ? (
                          <span className="pos-cart-size" title={c.product.size_label}>
                            {c.product.size_label}
                          </span>
                        ) : null}
                        {c.product.color ? (
                          <span className="pos-cart-color" title={c.product.color}>
                            <ColorSwatch color={c.product.color} size="sm" />
                            <span className="pos-cart-color-name">{c.product.color}</span>
                          </span>
                        ) : null}
                      </div>
                    )}
                    <div className="meta">
                      {c.product.barcode &&
                      c.product.internal_code &&
                      c.product.barcode !== c.product.internal_code
                        ? `${c.product.barcode} · ${c.product.internal_code}`
                        : c.product.barcode || c.product.internal_code}
                    </div>
                    {short ? (
                      <span className="badge stock-short">Unidades insuficientes</span>
                    ) : null}
                    <div className="pos-cart-line-meta">
                      <span className="muted">{money(c.product.sale_price)} c/u</span>
                      <strong>{money(Number(c.product.sale_price) * c.quantity)}</strong>
                    </div>
                  </div>
                  <div className="pos-qty" role="group" aria-label={`Cantidad ${c.product.name}`}>
                    <button
                      className="btn secondary"
                      type="button"
                      onClick={() => bumpQty(c.product.id, -1)}
                      aria-label="Menos"
                    >
                      −
                    </button>
                    <span className="pos-qty-n" aria-live="polite">
                      {c.quantity}
                    </span>
                    <button
                      className="btn secondary"
                      type="button"
                      onClick={() => bumpQty(c.product.id, 1)}
                      aria-label="Más"
                    >
                      +
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="pos-ticket-footer desktop-only">
          <div className="pos-ticket-total-row">
            <span className="muted">Total</span>
            <div className="pos-total">{money(total)}</div>
          </div>
          <button
            className="btn block"
            type="button"
            data-help="cta.caja.finalizar"
            onClick={openFinalizeConfirm}
            disabled={busy || !cart.length}
          >
            {busy ? 'Procesando…' : 'Finalizar'}
          </button>
        </div>
      </div>

      <div className="pos-checkout-bar mobile-only">
        <div>
          <div className="label">Total</div>
          <div className="amount">{money(total)}</div>
        </div>
        <button
          className="btn"
          type="button"
          data-help="cta.caja.finalizar"
          onClick={openFinalizeConfirm}
          disabled={busy || !cart.length}
        >
          {busy ? '…' : 'Finalizar'}
        </button>
      </div>

      {searchOpen && (
        <div
          className="pos-modal open"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeSearch();
          }}
        >
          <ModalOverlayClose onClose={closeSearch}>
          <div
            className="pos-modal-panel"
            ref={modalPanelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={searchTitleId}
          >
            <div className="pos-modal-head">
              <h3 id={searchTitleId}>Buscar prenda</h3>
            </div>
            <div className="field" style={{ marginBottom: '0.75rem' }}>
              <label htmlFor="pos-search-input">Nombre, código o categoría</label>
              <input
                id="pos-search-input"
                ref={searchInputRef}
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder="Ej. jeans, LS-JEANS…"
                autoComplete="off"
              />
            </div>
            <div className="pos-result-list" role="listbox" aria-label="Resultados">
              {searchLoading && (
                <div className="pos-result-skel" aria-hidden>
                  <div className="skel-row" />
                  <div className="skel-row" />
                  <div className="skel-row" />
                </div>
              )}
              {!searchLoading && searchQ.trim() && !searchResults.length && (
                <p className="pos-result-empty muted">Sin resultados · revisa el texto o escanea</p>
              )}
              {!searchLoading &&
                searchResults.map((p) => {
                  const s = stockOf(p);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className="pos-result-row"
                      role="option"
                      onClick={() => pickFromSearch(p)}
                    >
                      <ProductThumb product={p} className="pos-result-thumb" decorative />
                      <div className="pos-result-info">
                        <strong>{p.name}</strong>
                        <span className="muted">
                          {p.category_name || 'Sin categoría'}
                          {p.internal_code ? ` · ${p.internal_code}` : ''}
                        </span>
                      </div>
                      <div className="pos-result-side">
                        <strong>{money(p.sale_price)}</strong>
                        {s !== null ? (
                          <span className={`badge ${s <= 0 ? 'warning' : 'brand'}`}>
                            {s <= 0 ? 'Sin unidades en sucursal' : `${s} un.`}
                          </span>
                        ) : (
                          <span className="muted" style={{ fontSize: '0.75rem' }}>
                            —
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
            </div>
          </div></ModalOverlayClose>
        </div>
      )}

      {confirmOpen && (
        <div
          className="pos-modal open confirm-dialog no-print"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeFinalizeConfirm();
          }}
        >
          <ModalOverlayClose onClose={closeFinalizeConfirm} disabled={busy}>
          <div
            className="pos-modal-panel confirm-dialog-panel pos-finalize-panel"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={confirmTitleId}
            aria-describedby={confirmDescId}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pos-modal-head">
              <h3 id={confirmTitleId}>{online ? 'Finalizar venta' : 'Guardar venta offline'}</h3>
            </div>

            <div id={confirmDescId} className="pos-finalize-body">
              <p className="pos-finalize-total">
                Total <strong>{money(total)}</strong>
              </p>
              <ul className="pos-finalize-list">
                {online ? (
                  <>
                    <li>Se rebajará del stock de la sucursal activa.</li>
                    <li>Se imprimirá el comprobante de venta.</li>
                  </>
                ) : (
                  <>
                    <li>Se guarda en este equipo y se envía al volver la red.</li>
                    <li>El stock local baja ahora; el servidor confirma al sincronizar.</li>
                    <li>La impresión queda para cuando haya conexión.</li>
                  </>
                )}
              </ul>

              {online ? (
                <>
                  <label
                    className={`sales-hist-check pos-finalize-check${canIncludeTickets ? '' : ' is-disabled'}`}
                    title={
                      canIncludeTickets
                        ? undefined
                        : 'Ninguna prenda de esta venta admite cambio o devolución'
                    }
                  >
                    <input
                      type="checkbox"
                      checked={includeChangeTickets && canIncludeTickets}
                      disabled={!canIncludeTickets || busy}
                      onChange={(e) => setIncludeChangeTickets(e.target.checked)}
                    />
                    <span>
                      Incluir tickets de cambio/devolución
                      {canIncludeTickets
                        ? ` (${eligibleVoucherUnits})`
                        : ' — sin prendas elegibles'}
                    </span>
                  </label>
                  {canIncludeTickets ? (
                    <p className="muted pos-finalize-hint">
                      Puedes desmarcar si no necesitas tickets desprendibles.
                    </p>
                  ) : (
                    <p className="muted pos-finalize-hint">
                      No hay prendas habilitadas para cambio o devolución en esta venta.
                    </p>
                  )}
                </>
              ) : (
                <p className="muted pos-finalize-hint">
                  Los tickets de cambio se podrán emitir después del sync, desde el historial.
                </p>
              )}
            </div>

            <div className="btn-row confirm-dialog-actions">
              <button
                ref={confirmCancelRef}
                type="button"
                className="btn secondary"
                onClick={closeFinalizeConfirm}
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => void confirmFinalize()}
                disabled={busy}
              >
                {busy ? 'Procesando…' : online ? 'Confirmar e imprimir' : 'Guardar en este equipo'}
              </button>
            </div>
          </div></ModalOverlayClose>
        </div>
      )}

      <ConfirmDialog
        open={leaveOpen}
        title="Salir de la venta"
        message="Tienes prendas en esta venta. Si sales ahora, se perderá lo que llevas en el carrito."
        cancelLabel="Seguir vendiendo"
        confirmLabel="Salir sin guardar"
        danger
        onCancel={cancelLeave}
        onConfirm={confirmLeave}
      />

      {printJob ? <SaleThermalPrint job={printJob} /> : null}
      {printReminder}
    </div>
  );
}
