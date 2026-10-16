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
import { ChileMoneyInput } from '../components/ChileMoneyInput';
import { ColorSwatch } from '../components/ColorSwatch';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ModalOverlayClose } from '../components/ModalOverlayClose';
import { PaymentMethodSwitch } from '../components/PaymentMethodSwitch';
import { PosModal } from '../components/PosModal';
import { DepositThermalPrint, type DepositPrintSlip } from '../components/DepositThermalPrint';
import { ProductPhotoPlaceholder } from '../components/ProductPhotoPlaceholder';
import { useBlocker } from 'react-router-dom';
import { usePosCatalog } from '../hooks/usePosCatalog';
import { api, mediaUrl, money } from '../lib/api';
import { formatDay } from '../lib/civilDate';
import { useAuth } from '../lib/auth';
import { parseChileMoney } from '../lib/chileMoney';
import { useNetworkStatus } from '../lib/networkStatus';
import type { PaymentMethod } from '../lib/paymentMethod';
import { useMountedReceiptPrint } from '../lib/useSalePrint';
import type { PosCatalogProduct } from '../lib/posCatalogCache';
import { toast } from '../lib/toast';

type Product = {
  id: string;
  name: string;
  internal_code: string;
  barcode?: string | null;
  sale_price: string;
  stock?: number | string;
  photo_url?: string | null;
  category_name?: string | null;
  size_label?: string | null;
  color?: string | null;
  tracks_stock?: boolean;
};

type CartLine = { product: Product; quantity: number };

type DepositRow = {
  id: string;
  deposit_number: string;
  status: 'open' | 'completed' | 'cancelled';
  customer_name?: string | null;
  subtotal: string | number;
  paid_amount: string | number;
  paid_pct?: number;
  created_at: string;
  sale_receipt_number?: string | null;
  created_by_name?: string | null;
};

type DepositDetail = {
  deposit: DepositRow & { notes?: string | null };
  items: Array<{
    id: string;
    product_id: string;
    quantity: number;
    unit_price: string;
    line_total: string;
    product_name: string;
    internal_code: string;
    barcode?: string | null;
    size_label?: string | null;
    color?: string | null;
    photo_url?: string | null;
  }>;
  payments: Array<{
    id: string;
    kind: 'initial' | 'complete';
    amount: string;
    payment_method: string;
    created_at: string;
  }>;
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
    barcode: p.barcode,
    tracks_stock: p.tracks_stock,
  };
}

function stockOf(p: Product): number | null {
  if (p.tracks_stock === false) return null;
  if (p.stock === undefined || p.stock === null || p.stock === '') return null;
  const n = Number(p.stock);
  return Number.isFinite(n) ? n : null;
}

/** null = se puede sumar. Mensaje si la cantidad supera el stock de la sucursal. */
function stockLimitMessage(product: Product, nextQty: number): string | null {
  if (product.tracks_stock === false) {
    return `${product.name} no controla stock de vitrina`;
  }
  const stock = stockOf(product);
  if (stock == null) return null;
  if (stock <= 0 || nextQty > stock) {
    if (stock <= 0) return `No hay unidades de ${product.name} en esta sucursal`;
    return stock === 1
      ? `Solo hay 1 unidad de ${product.name} en esta sucursal`
      : `Solo hay ${stock} unidades de ${product.name} en esta sucursal`;
  }
  return null;
}

function canOfferInDeposit(p: Product): boolean {
  if (p.tracks_stock === false) return false;
  const stock = stockOf(p);
  return stock != null && stock > 0;
}

function userFacingError(err: unknown, fallback: string) {
  return err instanceof Error && err.message.trim() ? err.message : fallback;
}

function ProductThumb({
  product,
  className,
  decorative = false,
}: {
  product: Pick<Product, 'name' | 'photo_url'>;
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

/** Misma foto hero que Ventas (fondo blur + imagen contain). */
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

export function AbonosPage() {
  const { posId, branchId, branches, user } = useAuth();
  const { online } = useNetworkStatus();
  const catalog = usePosCatalog(branchId);
  const {
    search: searchCatalog,
    findByCode,
    ready: catalogReady,
    syncing: catalogSyncing,
    loading: catalogLoading,
    stale: catalogStale,
    error: catalogError,
    meta: catalogMeta,
    rememberProduct,
  } = catalog;

  const [tab, setTab] = useState<'nuevo' | 'listado'>('nuevo');
  const [code, setCode] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [stage, setStage] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);
  const listScanRef = useRef<HTMLInputElement>(null);
  const [listScan, setListScan] = useState('');

  /** Datos del comprador / abono: solo al Finalizar (como Ventas). */
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [initialAmount, setInitialAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [cashTendered, setCashTendered] = useState('');
  const confirmTitleId = useId();
  const confirmDescId = useId();

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTitleId = useId();

  const [list, setList] = useState<DepositRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'open' | 'completed' | 'cancelled' | 'all'>(
    'open',
  );
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [numberQ, setNumberQ] = useState('');
  const [customerQ, setCustomerQ] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const [draftNumber, setDraftNumber] = useState('');
  const [draftCustomer, setDraftCustomer] = useState('');
  const filtersTitleId = useId();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DepositDetail | null>(null);
  const [completePay, setCompletePay] = useState<PaymentMethod>('cash');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [printDeposit, setPrintDeposit] = useState<DepositPrintSlip | null>(null);
  const { reminder: printReminder } = useMountedReceiptPrint(Boolean(printDeposit), () =>
    setPrintDeposit(null),
  );

  const subtotal = useMemo(
    () =>
      cart.reduce(
        (sum, l) => sum + (Number(l.product.sale_price) || 0) * l.quantity,
        0,
      ),
    [cart],
  );
  const initialN = parseChileMoney(initialAmount);
  const nameOk = customerName.trim().length >= 2;
  const abonoExceeds =
    initialN != null && subtotal > 0 && initialN > subtotal;
  const abonoEqualsTotal =
    initialN != null && subtotal > 0 && initialN === subtotal;
  const abonoTooLow = initialN == null || initialN <= 0;
  const cashPaid = parseChileMoney(cashTendered);
  const cashShortfall =
    paymentMethod === 'cash' && cashPaid != null && initialN != null
      ? Math.max(0, initialN - cashPaid)
      : null;
  const cashChange =
    paymentMethod === 'cash' && cashPaid != null && initialN != null
      ? Math.max(0, cashPaid - initialN)
      : null;
  const cashInsufficient =
    paymentMethod === 'cash' &&
    (cashPaid == null || initialN == null || cashPaid < initialN);
  const canSubmitDeposit =
    Boolean(posId) &&
    cart.length > 0 &&
    nameOk &&
    !abonoTooLow &&
    !abonoExceeds &&
    !abonoEqualsTotal &&
    !cashInsufficient;

  const focusScan = useCallback(() => {
    requestAnimationFrame(() => scanRef.current?.focus());
  }, []);

  const extraFilterCount = [dateFrom, dateTo, numberQ, customerQ].filter(Boolean).length;

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const params = new URLSearchParams({ status: statusFilter, limit: '80' });
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (numberQ.trim()) params.set('number', numberQ.trim());
      if (customerQ.trim()) params.set('customer', customerQ.trim());
      const data = await api<{ deposits: DepositRow[] }>(`/api/deposits?${params}`);
      setList(data.deposits || []);
    } catch (err) {
      toast.error(userFacingError(err, 'No se pudo cargar abonos'));
    } finally {
      setListLoading(false);
    }
  }, [statusFilter, dateFrom, dateTo, numberQ, customerQ]);

  useEffect(() => {
    if (tab === 'listado') void loadList();
  }, [tab, loadList]);

  useEffect(() => {
    if (tab !== 'listado' || selectedId) return;
    const t = window.setTimeout(() => listScanRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [tab, selectedId]);

  async function onListScan(e: FormEvent) {
    e.preventDefault();
    const raw = (listScanRef.current?.value ?? listScan).trim().toUpperCase().replace(/\s+/g, '');
    if (!raw) return;
    setListScan('');
    if (listScanRef.current) listScanRef.current.value = '';
    setNumberQ(raw);
    try {
      const data = await api<{ deposits: DepositRow[] }>(
        `/api/deposits?number=${encodeURIComponent(raw)}&status=all&limit=20`,
      );
      const exact = (data.deposits || []).filter(
        (d) => d.deposit_number.trim().toUpperCase() === raw,
      );
      if (exact.length === 1) {
        await openDetail(exact[0].id);
        return;
      }
      toast.error(`No encontramos el abono ${raw}`);
    } catch (err) {
      toast.error(userFacingError(err, 'No se pudo buscar el abono'));
    }
  }

  function workplaceMeta() {
    const branch = branches.find((b) => b.id === branchId);
    const pos = branch?.pos_terminals?.find((p) => p.id === posId);
    return {
      branchName: branch?.name || null,
      posName: pos?.name || null,
      sellerName: user?.fullName || null,
    };
  }

  useEffect(() => {
    if (tab === 'nuevo' && posId) focusScan();
  }, [tab, posId, focusScan]);

  function addProduct(product: Product) {
    const existing = cart.find((c) => c.product.id === product.id);
    const nextQty = (existing?.quantity ?? 0) + 1;
    const limit = stockLimitMessage(product, nextQty);
    if (limit) {
      toast.error(limit);
      focusScan();
      return;
    }
    setStage(product);
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
    setCode('');
    if (scanRef.current) scanRef.current.value = '';
    focusScan();
  }

  async function onScan(e?: FormEvent) {
    e?.preventDefault();
    const raw = (scanRef.current?.value ?? code).trim();
    if (!raw) return;

    if (!online) {
      const cached = findByCode(raw);
      if (cached) {
        addProduct(fromCatalog(cached));
        return;
      }
      toast.error('Producto no encontrado en el catálogo de este equipo');
      setCode('');
      if (scanRef.current) scanRef.current.value = '';
      focusScan();
      return;
    }

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
      toast.error(userFacingError(err, 'Producto no encontrado'));
      focusScan();
    }
  }

  function bump(id: string, delta: number) {
    if (delta > 0) {
      const line = cart.find((c) => c.product.id === id);
      if (line) {
        const limit = stockLimitMessage(line.product, line.quantity + delta);
        if (limit) {
          toast.error(limit);
          return;
        }
      }
    }
    setCart((prev) =>
      prev
        .map((c) => (c.product.id === id ? { ...c, quantity: c.quantity + delta } : c))
        .filter((c) => c.quantity > 0),
    );
  }

  function clearCart() {
    setCart([]);
    setStage(null);
    focusScan();
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
    focusScan();
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
              setSearchResults((data.products || []).filter(canOfferInDeposit));
              setSearchLoading(false);
            }
          } catch {
            const local = searchCatalog(q, 30).map(fromCatalog).filter(canOfferInDeposit);
            if (!cancelled) {
              setSearchResults(local);
              setSearchLoading(false);
            }
          }
        })();
        return;
      }
      const local = searchCatalog(q, 30).map(fromCatalog).filter(canOfferInDeposit);
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
        closeSearch();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir
  }, [searchOpen]);

  function onSearchKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && searchResults[0]) {
      e.preventDefault();
      void pickFromSearch(searchResults[0]);
    }
  }

  function openFilters() {
    setDraftFrom(dateFrom);
    setDraftTo(dateTo);
    setDraftNumber(numberQ);
    setDraftCustomer(customerQ);
    setFiltersOpen(true);
  }

  function applyFilters() {
    setDateFrom(draftFrom);
    setDateTo(draftTo);
    setNumberQ(draftNumber.trim());
    setCustomerQ(draftCustomer.trim());
    setFiltersOpen(false);
  }

  function clearExtraFilters() {
    setDateFrom('');
    setDateTo('');
    setNumberQ('');
    setCustomerQ('');
    setDraftFrom('');
    setDraftTo('');
    setDraftNumber('');
    setDraftCustomer('');
    setFiltersOpen(false);
  }

  function openFinalizeConfirm() {
    if (!posId || !cart.length) return;
    const over = cart.find((c) => stockLimitMessage(c.product, c.quantity));
    if (over) {
      toast.error(stockLimitMessage(over.product, over.quantity) || 'No hay unidades suficientes');
      return;
    }
    setConfirmOpen(true);
  }

  function closeFinalizeConfirm() {
    if (busy) return;
    setConfirmOpen(false);
  }

  function resetFinalizeForm() {
    setCustomerName('');
    setNotes('');
    setInitialAmount('');
    setPaymentMethod('cash');
    setCashTendered('');
  }

  async function createDeposit() {
    if (!posId || !canSubmitDeposit || initialN == null) {
      if (!nameOk) toast.error('Indica el nombre de quien reserva');
      else if (abonoTooLow) toast.error('Indica el monto del abono');
      else if (abonoExceeds)
        toast.error('El abono no puede ser mayor al total de las prendas');
      else if (abonoEqualsTotal)
        toast.error('Si paga el total, registra una venta en Caja');
      else if (cashInsufficient) toast.error('El efectivo recibido no alcanza para el abono');
      return;
    }
    const over = cart.find((c) => stockLimitMessage(c.product, c.quantity));
    if (over) {
      toast.error(stockLimitMessage(over.product, over.quantity) || 'No hay unidades suficientes');
      return;
    }
    const name = customerName.trim();
    setBusy(true);
    try {
      const data = await api<{
        deposit: DepositRow;
      }>('/api/deposits', {
        method: 'POST',
        body: {
          posId,
          customerName: name,
          notes: notes.trim() || null,
          initialAmount: initialN,
          paymentMethod,
          items: cart.map((c) => ({
            productId: c.product.id,
            quantity: c.quantity,
          })),
        },
      });
      toast.success(`Abono ${data.deposit.deposit_number} creado · stock retenido`);
      setPrintDeposit({
        number: data.deposit.deposit_number,
        customerName: name,
        paid: Number(data.deposit.paid_amount),
        total: Number(data.deposit.subtotal),
        paymentMethod,
        createdAt: data.deposit.created_at || new Date().toISOString(),
        ...workplaceMeta(),
        items: cart.map((c) => ({
          name: c.product.name,
          code: c.product.internal_code,
          size: c.product.size_label,
          quantity: c.quantity,
          lineTotal: Math.round(Number(c.product.sale_price) || 0) * c.quantity,
        })),
      });
      setConfirmOpen(false);
      setCart([]);
      setStage(null);
      resetFinalizeForm();
      setTab('listado');
      setStatusFilter('open');
    } catch (err) {
      toast.error(userFacingError(err, 'No se pudo crear el abono'));
    } finally {
      setBusy(false);
    }
  }

  async function openDetail(id: string) {
    setSelectedId(id);
    try {
      const data = await api<DepositDetail>(`/api/deposits/${id}`);
      setDetail(data);
    } catch (err) {
      toast.error(userFacingError(err, 'No se pudo abrir el abono'));
      setSelectedId(null);
    }
  }

  async function completeSelected() {
    if (!detail || detail.deposit.status !== 'open') return;
    const remaining =
      Math.round(Number(detail.deposit.subtotal)) - Math.round(Number(detail.deposit.paid_amount));
    setBusy(true);
    try {
      const data = await api<{
        deposit: DepositRow;
        sale: { receipt_number: string };
      }>(`/api/deposits/${detail.deposit.id}/complete`, {
        method: 'POST',
        body: { paymentMethod: completePay, amount: remaining },
      });
      toast.success(
        `Abono completado · venta ${data.sale.receipt_number} · faltante ${money(remaining)}`,
      );
      setDetail(null);
      setSelectedId(null);
      void loadList();
    } catch (err) {
      toast.error(userFacingError(err, 'No se pudo completar el abono'));
    } finally {
      setBusy(false);
    }
  }

  async function cancelSelected() {
    if (!detail || detail.deposit.status !== 'open') return;
    setBusy(true);
    try {
      await api(`/api/deposits/${detail.deposit.id}/cancel`, { method: 'POST', body: {} });
      toast.success('Abono anulado · stock liberado');
      setConfirmCancel(false);
      setDetail(null);
      setSelectedId(null);
      void loadList();
    } catch (err) {
      toast.error(userFacingError(err, 'No se pudo anular el abono'));
    } finally {
      setBusy(false);
    }
  }

  const remainingSelected = detail
    ? Math.max(
        0,
        Math.round(Number(detail.deposit.subtotal)) - Math.round(Number(detail.deposit.paid_amount)),
      )
    : 0;

  const cartHasItems = cart.length > 0;
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      cartHasItems && currentLocation.pathname !== nextLocation.pathname,
  );
  const [tabLeave, setTabLeave] = useState(false);
  const leaveOpen = blocker.state === 'blocked' || tabLeave;

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
    setTabLeave(false);
    focusScan();
  }, [blocker, focusScan]);

  const confirmLeave = useCallback(() => {
    if (tabLeave) {
      setCart([]);
      setStage(null);
      setTabLeave(false);
      setTab('listado');
      return;
    }
    if (blocker.state === 'blocked') blocker.proceed();
  }, [blocker, tabLeave]);

  function requestListado() {
    if (tab === 'listado') return;
    if (cartHasItems) {
      setTabLeave(true);
      return;
    }
    setTab('listado');
  }

  const modalBlocksScan = searchOpen || confirmOpen || leaveOpen;

  useEffect(() => {
    if (!confirmOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault();
        closeFinalizeConfirm();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [confirmOpen, busy]);

  return (
    <div className="ing-list abonos-page">
      <div className="section-title">
        <nav className="admin-tabs" aria-label="Abonos" data-help="nav.abonos">
          <button
            type="button"
            className={tab === 'nuevo' ? 'is-active' : undefined}
            onClick={() => setTab('nuevo')}
          >
            Nuevo
          </button>
          <button
            type="button"
            className={tab === 'listado' ? 'is-active' : undefined}
            onClick={requestListado}
          >
            Listado
          </button>
        </nav>
      </div>

      {tab === 'nuevo' ? (
        <>
          {!posId ? (
            <p className="error abonos-pos-warn">
              Selecciona una caja POS en la barra para registrar abonos.
            </p>
          ) : null}

          {/* Mismo grid que Ventas: scan | ticket / stage | ticket.
              Antes `.pos-scan` con grid-area:scan fuera de `.pos-layout` flotaba suelto. */}
          <div className="pos-layout abonos-pos-layout">
            <div className="card pos-scan">
              <form onSubmit={(e) => void onScan(e)} className="scan-row">
                <input
                  id="abono-scan"
                  ref={scanRef}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Código de barras o interno (LS…)"
                  autoComplete="off"
                  inputMode="text"
                  autoFocus
                  readOnly={modalBlocksScan || !posId}
                  tabIndex={modalBlocksScan || !posId ? -1 : 0}
                  disabled={busy || !posId}
                  aria-label="Código de barras o código interno"
                />
                <button
                  className="btn"
                  type="submit"
                  disabled={busy || !posId || !code.trim() || modalBlocksScan}
                >
                  Sumar
                </button>
              </form>
              <button
                className="btn secondary pos-search-trigger"
                type="button"
                onClick={openSearch}
                disabled={busy || !posId || modalBlocksScan}
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
                          !online
                            ? ' · sin conexión'
                            : catalogStale
                              ? ' · stock local (puede estar viejo)'
                              : ''
                        }`
                      : catalogError || 'Sin catálogo guardado'}
              </p>
            </div>

            <div className={`pos-stage${stage ? '' : ' is-empty'}`} aria-live="off">
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
                  <p className="pos-stage-idle-copy">
                    Pistolea o busca prendas. El stock se retiene al crear el abono.
                  </p>
                </div>
              )}
            </div>

            <div className="card pos-ticket abonos-ticket">
              <div className="section-title pos-ticket-head">
                <h3 style={{ margin: 0 }}>Este abono</h3>
                {cart.length > 0 ? (
                  <button className="btn ghost" type="button" onClick={clearCart} disabled={busy}>
                    Vaciar
                  </button>
                ) : null}
              </div>

              <div className="pos-ticket-list">
                {!cart.length ? (
                  <p className="muted">Sin prendas todavía</p>
                ) : null}
                <ul className="pos-cart-list" aria-label="Prendas del abono">
                  {cart.map((line) => {
                    const lineTotal =
                      (Number(line.product.sale_price) || 0) * line.quantity;
                    const available = stockOf(line.product);
                    const atMax = available != null && line.quantity >= available;
                    const limitMsg =
                      atMax && available != null
                        ? available === 1
                          ? 'Solo hay 1 unidad en esta sucursal'
                          : `Solo hay ${available} unidades en esta sucursal`
                        : undefined;
                    return (
                      <li className="pos-cart-row" key={line.product.id}>
                        <ProductThumb
                          product={line.product}
                          className="pos-cart-thumb"
                          decorative
                        />
                        <div className="pos-cart-info">
                          <strong className="pos-cart-name" title={line.product.name}>
                            {line.product.name}
                          </strong>
                          {(line.product.size_label || line.product.color) && (
                            <div className="pos-cart-attrs">
                              {line.product.size_label ? (
                                <span
                                  className="pos-cart-size"
                                  title={line.product.size_label}
                                >
                                  {line.product.size_label}
                                </span>
                              ) : null}
                              {line.product.color ? (
                                <span className="pos-cart-color" title={line.product.color}>
                                  <ColorSwatch color={line.product.color} size="sm" />
                                  <span className="pos-cart-color-name">
                                    {line.product.color}
                                  </span>
                                </span>
                              ) : null}
                            </div>
                          )}
                          <div className="meta">
                            {line.product.barcode &&
                            line.product.internal_code &&
                            line.product.barcode !== line.product.internal_code
                              ? `${line.product.barcode} · ${line.product.internal_code}`
                              : line.product.barcode || line.product.internal_code}
                          </div>
                          {available != null ? (
                            <div className="meta">Disponible: {available}</div>
                          ) : null}
                        </div>
                        <div className="pos-cart-footer">
                          <div className="pos-cart-line-meta">
                            <span className="muted">
                              {money(line.product.sale_price)} c/u
                            </span>
                            <strong>{money(lineTotal)}</strong>
                          </div>
                          <div
                            className="pos-qty"
                            role="group"
                            aria-label={`Cantidad ${line.product.name}`}
                          >
                            <button
                              className="btn secondary"
                              type="button"
                              onClick={() => bump(line.product.id, -1)}
                              aria-label="Menos"
                              disabled={busy}
                            >
                              −
                            </button>
                            <span className="pos-qty-n" aria-live="polite">
                              {line.quantity}
                            </span>
                            <button
                              className="btn secondary"
                              type="button"
                              onClick={() => bump(line.product.id, 1)}
                              aria-label="Más"
                              title={limitMsg}
                              disabled={busy || atMax}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="pos-ticket-footer desktop-only">
                <div className="pos-ticket-total-row">
                  <span className="muted">Total</span>
                  <div className="pos-total">{money(subtotal)}</div>
                </div>
                <button
                  type="button"
                  className="btn block"
                  disabled={busy || !posId || !cart.length}
                  onClick={openFinalizeConfirm}
                >
                  {busy ? 'Procesando…' : 'Finalizar'}
                </button>
              </div>
            </div>

            <div className="pos-checkout-bar mobile-only">
              <div>
                <div className="label">Total</div>
                <div className="amount">{money(subtotal)}</div>
              </div>
              <button
                type="button"
                className="btn"
                disabled={busy || !posId || !cart.length}
                onClick={openFinalizeConfirm}
              >
                {busy ? 'Procesando…' : 'Finalizar'}
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="ing-list-main">
          <form className="merma-scan-row abonos-list-scan" onSubmit={(e) => void onListScan(e)}>
            <label className="sr-only" htmlFor="abono-list-scan">
              Folio del abono
            </label>
            <input
              id="abono-list-scan"
              ref={listScanRef}
              value={listScan}
              onChange={(e) => setListScan(e.target.value)}
              placeholder="Pistolea el folio (AB…)"
              autoComplete="off"
              inputMode="text"
            />
            <button type="submit" className="btn">
              Buscar
            </button>
          </form>
          <div className="ing-filters" role="toolbar" aria-label="Filtros de abonos">
            {(
              [
                ['open', 'Abiertos'],
                ['completed', 'Completados'],
                ['cancelled', 'Anulados'],
                ['all', 'Todos'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`ing-chip${statusFilter === id ? ' is-active' : ''}`}
                aria-pressed={statusFilter === id}
                onClick={() => setStatusFilter(id)}
              >
                {label}
              </button>
            ))}
            <button type="button" className="btn secondary ing-filters-btn" onClick={openFilters}>
              Filtros
              {extraFilterCount > 0 ? (
                <span className="prod-filters-badge" aria-label="Filtros activos">
                  {extraFilterCount}
                </span>
              ) : null}
            </button>
          </div>
          {extraFilterCount > 0 ? (
            <p className="ing-filter-summary muted">
              {[
                numberQ ? `Folio ${numberQ}` : '',
                customerQ ? customerQ : '',
                dateFrom ? `Desde ${formatDay(dateFrom)}` : '',
                dateTo ? `Hasta ${formatDay(dateTo)}` : '',
              ]
                .filter(Boolean)
                .join(' · ')}
              {' · '}
              <button type="button" className="btn ghost" onClick={clearExtraFilters}>
                Limpiar
              </button>
            </p>
          ) : null}

          {listLoading ? <p className="muted">Cargando…</p> : null}
          {!listLoading && !list.length ? (
            <p className="muted">No hay abonos con estos filtros.</p>
          ) : null}

          <div className="ing-list-scroll abonos-list">
            <div className="list-cards mobile-only">
              {list.map((d) => {
                const pct = depositPct(d);
                return (
                  <button
                    key={d.id}
                    type="button"
                    className="list-card sales-card"
                    onClick={() => void openDetail(d.id)}
                  >
                    <div className="row">
                      <strong>{d.deposit_number}</strong>
                      <span className={depositBadgeClass(d.status)}>{depositStatusLabel(d.status)}</span>
                    </div>
                    <div className="meta">{d.customer_name || 'Sin nombre'}</div>
                    <div className="meta">
                      Abonado {money(d.paid_amount)} de {money(d.subtotal)} · {pct}%
                    </div>
                    <div className="meta">
                      {fmtDepositDate(d.created_at)}
                      {d.created_by_name ? ` · ${d.created_by_name}` : ''}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="table-wrap desktop-only">
              <table className="table sales-table abonos-table">
                <thead>
                  <tr>
                    <th>Folio</th>
                    <th>Quien reserva</th>
                    <th>Abonado</th>
                    <th>Total</th>
                    <th>%</th>
                    <th>Estado</th>
                    <th>Fecha</th>
                    <th>Registró</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((d) => (
                    <tr key={d.id} className="sales-row">
                      <td>
                        <button type="button" className="btn ghost" onClick={() => void openDetail(d.id)}>
                          <strong>{d.deposit_number}</strong>
                        </button>
                      </td>
                      <td>{d.customer_name || '—'}</td>
                      <td className="sales-num">{money(d.paid_amount)}</td>
                      <td className="sales-num">{money(d.subtotal)}</td>
                      <td>{depositPct(d)}%</td>
                      <td>
                        <span className={depositBadgeClass(d.status)}>{depositStatusLabel(d.status)}</span>
                      </td>
                      <td>{fmtDepositDate(d.created_at)}</td>
                      <td>{d.created_by_name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {filtersOpen ? (
        <PosModal
          onClick={(e) => {
            if (e.target === e.currentTarget) setFiltersOpen(false);
          }}
        >
          <ModalOverlayClose onClose={() => setFiltersOpen(false)}>
            <div
              className="pos-modal-panel ing-filters-sheet"
              role="dialog"
              aria-modal="true"
              aria-labelledby={filtersTitleId}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="pos-modal-head">
                <h3 id={filtersTitleId}>Filtros</h3>
              </div>
              <div className="ing-filters-sheet-body">
                <div className="ing-filter-fields">
                  <div className="field">
                    <label htmlFor="abono-f-number">Folio</label>
                    <input
                      id="abono-f-number"
                      value={draftNumber}
                      onChange={(e) => setDraftNumber(e.target.value)}
                      placeholder="Ej. AB000002"
                      autoComplete="off"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="abono-f-customer">Quien reserva</label>
                    <input
                      id="abono-f-customer"
                      value={draftCustomer}
                      onChange={(e) => setDraftCustomer(e.target.value)}
                      placeholder="Nombre"
                      autoComplete="off"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="abono-f-from">Fecha desde</label>
                    <input
                      id="abono-f-from"
                      type="date"
                      value={draftFrom}
                      onChange={(e) => setDraftFrom(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="abono-f-to">Fecha hasta</label>
                    <input
                      id="abono-f-to"
                      type="date"
                      value={draftTo}
                      onChange={(e) => setDraftTo(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="btn-row ing-filters-sheet-actions">
                <button type="button" className="btn secondary" onClick={() => setFiltersOpen(false)}>
                  Cancelar
                </button>
                <button type="button" className="btn" onClick={applyFilters}>
                  Aplicar
                </button>
              </div>
            </div>
          </ModalOverlayClose>
        </PosModal>
      ) : null}

      {searchOpen ? (
        <PosModal
          onClick={(e) => {
            if (e.target === e.currentTarget) closeSearch();
          }}
        >
          <ModalOverlayClose onClose={closeSearch}>
            <div
              className="pos-modal-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby={searchTitleId}
            >
              <div className="pos-modal-head">
                <h3 id={searchTitleId}>Buscar prenda</h3>
              </div>
              <div className="field" style={{ marginBottom: '0.75rem' }}>
                <label htmlFor="abono-search-input">Nombre, código o categoría</label>
                <input
                  id="abono-search-input"
                  ref={searchInputRef}
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  onKeyDown={onSearchKeyDown}
                  placeholder="Ej. jeans, LS-JEANS…"
                  autoComplete="off"
                />
              </div>
              <div className="pos-result-list" role="listbox" aria-label="Resultados">
                {searchLoading ? (
                  <div className="pos-result-skel" aria-hidden>
                    <div className="skel-row" />
                    <div className="skel-row" />
                    <div className="skel-row" />
                  </div>
                ) : null}
                {!searchLoading && searchQ.trim() && !searchResults.length ? (
                  <p className="pos-result-empty muted">
                    Sin unidades disponibles en esta sucursal
                  </p>
                ) : null}
                {!searchLoading &&
                  searchResults.map((p) => {
                    const s = stockOf(p);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className="pos-result-row"
                        role="option"
                        onClick={() => void pickFromSearch(p)}
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
            </div>
          </ModalOverlayClose>
        </PosModal>
      ) : null}

      {confirmOpen ? (
        <PosModal
          className="confirm-dialog no-print"
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
                <h3 id={confirmTitleId}>Finalizar abono</h3>
              </div>

              <div id={confirmDescId} className="pos-finalize-body">
                <p className="pos-finalize-total">
                  Total prendas <strong>{money(subtotal)}</strong>
                </p>

                <div className="field">
                  <label htmlFor="abono-customer">
                    Nombre de quien reserva <span className="req" aria-hidden>*</span>
                  </label>
                  <input
                    id="abono-customer"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    disabled={busy}
                    required
                    autoComplete="name"
                    placeholder="Nombre y apellido"
                    aria-required="true"
                  />
                </div>

                <div className="field">
                  <label htmlFor="abono-initial">Monto del abono</label>
                  <ChileMoneyInput
                    id="abono-initial"
                    value={initialAmount}
                    onChange={setInitialAmount}
                    placeholder="0"
                    disabled={busy}
                  />
                  {abonoExceeds ? (
                    <span className="error" role="alert">
                      El abono no puede superar el total ({money(subtotal)}).
                    </span>
                  ) : null}
                  {abonoEqualsTotal ? (
                    <span className="error" role="alert">
                      Si paga el total, registra una venta en Caja.
                    </span>
                  ) : null}
                  {!abonoExceeds &&
                  !abonoEqualsTotal &&
                  initialN != null &&
                  initialN > 0 &&
                  initialN < subtotal ? (
                    <span className="ing-hint">
                      Faltante {money(subtotal - initialN)}
                    </span>
                  ) : null}
                </div>

                <PaymentMethodSwitch
                  value={paymentMethod}
                  onChange={(m) => {
                    setPaymentMethod(m);
                    setCashTendered('');
                  }}
                  disabled={busy}
                  label="Medio de pago del abono"
                  className="pos-finalize-payment"
                />

                {paymentMethod === 'cash' ? (
                  <div className="pos-finalize-cash">
                    <div className="field">
                      <label htmlFor="abono-cash-tendered">Con cuánto paga</label>
                      <ChileMoneyInput
                        id="abono-cash-tendered"
                        value={cashTendered}
                        onChange={setCashTendered}
                        placeholder="0"
                        disabled={busy}
                        aria-describedby="abono-cash-feedback"
                      />
                    </div>
                    <p
                      id="abono-cash-feedback"
                      className={`pos-finalize-cash-feedback${
                        cashPaid == null
                          ? ' is-muted'
                          : cashShortfall && cashShortfall > 0
                            ? ' is-short'
                            : ' is-ok'
                      }`}
                      aria-live="polite"
                    >
                      {cashPaid == null ? (
                        'Ingresa el monto recibido'
                      ) : cashShortfall && cashShortfall > 0 ? (
                        <>
                          Faltan <strong>{money(cashShortfall)}</strong>
                        </>
                      ) : cashChange && cashChange > 0 ? (
                        <>
                          Vuelto <strong>{money(cashChange)}</strong>
                        </>
                      ) : (
                        <strong>Pago exacto</strong>
                      )}
                    </p>
                  </div>
                ) : null}

                <div className="field">
                  <label htmlFor="abono-notes">Notas</label>
                  <textarea
                    id="abono-notes"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={busy}
                    placeholder="Opcional"
                  />
                </div>

                <ul className="pos-finalize-list">
                  <li>Se retendrá el stock de estas prendas en la sucursal activa.</li>
                  <li>Se imprimirá el comprobante de abono (AB…).</li>
                </ul>
              </div>

              <div className="btn-row confirm-dialog-actions">
                <button
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
                  disabled={busy || !canSubmitDeposit}
                  onClick={() => void createDeposit()}
                >
                  {busy ? 'Guardando…' : 'Crear abono y retener stock'}
                </button>
              </div>
            </div>
          </ModalOverlayClose>
        </PosModal>
      ) : null}

      {detail && selectedId ? (
        <PosModal
          className="no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setDetail(null);
          }}
        >
          <ModalOverlayClose onClose={() => !busy && setDetail(null)}>
            <div
              className="pos-modal-panel abonos-detail-panel"
              role="dialog"
              aria-modal="true"
              aria-label={`Abono ${detail.deposit.deposit_number}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="pos-modal-head">
                <h3>{detail.deposit.deposit_number}</h3>
              </div>
              <p className="muted">
                {detail.deposit.customer_name || 'Sin nombre'} · pagado{' '}
                {money(detail.deposit.paid_amount)} de {money(detail.deposit.subtotal)}
                {detail.deposit.status === 'open'
                  ? ` · faltan ${money(remainingSelected)}`
                  : ''}
              </p>
              <ul className="pos-cart-list abonos-detail-items">
                {detail.items.map((it) => (
                  <li key={it.id} className="pos-cart-row">
                    <ProductThumb
                      product={{ name: it.product_name, photo_url: it.photo_url }}
                      className="pos-cart-thumb"
                      decorative
                    />
                    <div className="pos-cart-info">
                      <strong className="pos-cart-name">{it.product_name}</strong>
                      {(it.size_label || it.color) && (
                        <div className="pos-cart-attrs">
                          {it.size_label ? (
                            <span className="pos-cart-size">{it.size_label}</span>
                          ) : null}
                          {it.color ? (
                            <span className="pos-cart-color" title={it.color}>
                              <ColorSwatch color={it.color} size="sm" />
                              <span className="pos-cart-color-name">{it.color}</span>
                            </span>
                          ) : null}
                        </div>
                      )}
                      <div className="meta">
                        {it.internal_code} · {it.quantity} × {money(it.unit_price)}
                      </div>
                    </div>
                    <div className="pos-cart-footer">
                      <div className="pos-cart-line-meta">
                        <strong>{money(it.line_total)}</strong>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              {detail.deposit.status === 'open' ? (
                <>
                  <PaymentMethodSwitch
                    value={completePay}
                    onChange={setCompletePay}
                    disabled={busy}
                    label="Pago del faltante"
                  />
                  <div className="btn-row" style={{ marginTop: '0.75rem' }}>
                    <button
                      type="button"
                      className="btn secondary"
                      disabled={busy}
                      onClick={() => setConfirmCancel(true)}
                    >
                      Anular
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={busy || remainingSelected <= 0}
                      onClick={() => void completeSelected()}
                    >
                      Completar ({money(remainingSelected)})
                    </button>
                  </div>
                </>
              ) : (
                <button type="button" className="btn secondary" onClick={() => setDetail(null)}>
                  Cerrar
                </button>
              )}
              <div className="btn-row" style={{ marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() =>
                    setPrintDeposit({
                      number: detail.deposit.deposit_number,
                      customerName: detail.deposit.customer_name || null,
                      paid: Number(detail.deposit.paid_amount),
                      total: Number(detail.deposit.subtotal),
                      paymentMethod: detail.payments[0]?.payment_method || 'cash',
                      createdAt: detail.deposit.created_at,
                      sellerName: detail.deposit.created_by_name || workplaceMeta().sellerName,
                      branchName: workplaceMeta().branchName,
                      posName: workplaceMeta().posName,
                      reprint: true,
                      items: detail.items.map((it) => ({
                        name: it.product_name,
                        code: it.internal_code,
                        size: it.size_label,
                        quantity: it.quantity,
                        lineTotal: Number(it.line_total),
                      })),
                    })
                  }
                >
                  Reimprimir comprobante
                </button>
              </div>
            </div>
          </ModalOverlayClose>
        </PosModal>
      ) : null}

      <ConfirmDialog
        open={leaveOpen}
        title="Salir del abono"
        message="Tienes prendas en este abono. Si sales ahora, se perderá lo que llevas."
        cancelLabel="Seguir en el abono"
        confirmLabel="Salir sin guardar"
        danger
        onCancel={cancelLeave}
        onConfirm={confirmLeave}
      />

      <ConfirmDialog
        open={confirmCancel}
        title="Anular abono"
        message="Se libera el stock retenido. El dinero del abono inicial no se registra como devolución automática: gestiona la caja aparte si corresponde."
        cancelLabel="Seguir"
        confirmLabel={busy ? 'Anulando…' : 'Anular abono'}
        danger
        onCancel={() => !busy && setConfirmCancel(false)}
        onConfirm={() => void cancelSelected()}
      />

      {printDeposit ? <DepositThermalPrint slip={printDeposit} /> : null}
      {printReminder}
    </div>
  );
}

function depositPct(d: DepositRow) {
  return (
    d.paid_pct ??
    (Number(d.subtotal) > 0 ? Math.round((Number(d.paid_amount) / Number(d.subtotal)) * 100) : 0)
  );
}

function depositStatusLabel(status: DepositRow['status']) {
  if (status === 'completed') return 'Completado';
  if (status === 'cancelled') return 'Anulado';
  return 'Abierto';
}

function depositBadgeClass(status: DepositRow['status']) {
  if (status === 'completed') return 'badge success';
  if (status === 'cancelled') return 'badge';
  return 'badge warning';
}

function fmtDepositDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('es-CL', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
