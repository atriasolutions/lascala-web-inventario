import {
  type FormEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { BoutiqueLoader } from '../components/BoutiqueLoader';
import { InfiniteListFooter } from '../components/InfiniteListFooter';
import { ModalOverlayClose } from '../components/ModalOverlayClose';
import { PosModal } from '../components/PosModal';
import { SortableTh } from '../components/SortableTh';
import { useInfiniteList } from '../hooks/useInfiniteList';
import { api, mediaUrl, money, userFacingError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { sameSalePriceExact } from '../lib/exchangePrice';
import { loadListFilters, saveListFilters } from '../lib/listFiltersPersist';
import {
  nextMermaSort,
  nextVoucherSort,
  sortMermas,
  sortVouchers,
  type MermaSortKey,
  type SortDir,
  type VoucherSortKey,
} from '../lib/mermasListSort';
import { codesMatch, normalizeScanCode } from '../lib/scanCode';
import { withPagination } from '../lib/pagination';
import { toast } from '../lib/toast';

type Tab = 'mermas' | 'vouchers';
type MermaKind = 'discard' | 'supplier';
type VoucherOutcome = 'exchange' | 'cash_refund';
type VoucherDest = 'restock' | 'discard' | 'supplier';

type LookupProduct = {
  id: string;
  name: string;
  internal_code: string;
  barcode: string | null;
  brand?: string | null;
  size_label?: string | null;
  color?: string | null;
  sale_price?: string | number | null;
  photo_url?: string | null;
  stock: number | string;
  category_name?: string | null;
  tracks_stock?: boolean;
};

type TicketDetail = {
  id: string;
  voucher_number: string;
  status: string;
  issued_at: string;
  expires_at: string;
  expired: boolean;
  days_left: number;
  conditions: string | null;
  product: {
    id: string;
    name: string;
    internal_code: string;
    barcode: string | null;
    photo_url: string | null;
    sale_price: string;
    allows_exchange: boolean;
    allows_return: boolean;
    size_label?: string | null;
    color?: string | null;
  };
  sale: {
    id: string;
    receipt_number: string | null;
    sold_at: string | null;
    line_total: string | null;
    unit_price: string | null;
    quantity: number | null;
  } | null;
  warnPartyDress: boolean;
  canFulfill: boolean;
  blockedReason: string | null;
};

type SaleLookupInfo = {
  kind: 'sale';
  receiptNumber: string;
  needsProductScan: boolean;
  openCount: number;
  usedCount: number;
  totalCount: number;
};

type TicketLookupResponse = {
  voucher: TicketDetail | null;
  saleLookup?: SaleLookupInfo | null;
};

type Merma = {
  id: string;
  product_id: string;
  product_name: string;
  internal_code: string;
  barcode: string | null;
  quantity: number;
  reason: string;
  cost_impact: string | number | null;
  created_by_name: string | null;
  created_at: string;
};

type Voucher = {
  id: string;
  voucher_number: string;
  product_id: string;
  product_name: string;
  internal_code: string;
  status: 'open' | 'used' | 'expired' | 'cancelled' | string;
  issued_at: string;
  expires_at: string;
  conditions: string | null;
  sale_id: string | null;
  sale_receipt: string | null;
  created_by_name: string | null;
  days_left: number | string | null;
  allows_exchange: boolean;
  allows_return: boolean;
};

type MermaFilters = {
  dateFrom: string;
  dateTo: string;
  product: string;
  reason: string;
  user: string;
};

type VoucherFilters = {
  status: 'all' | 'open' | 'used' | 'expired' | 'cancelled';
  dateFrom: string;
  dateTo: string;
  voucher: string;
  product: string;
  sale: string;
};

type ConfirmState =
  | { kind: 'merma' }
  | { kind: 'fulfill' }
  | { kind: 'cancel'; voucher: Voucher }
  | null;

const DEFAULT_MERMA_FILTERS: MermaFilters = {
  dateFrom: '',
  dateTo: '',
  product: '',
  reason: '',
  user: '',
};
const DEFAULT_VOUCHER_FILTERS: VoucherFilters = {
  status: 'open',
  dateFrom: '',
  dateTo: '',
  voucher: '',
  product: '',
  sale: '',
};

/** Migra filtros viejos con `q` agrupado → campos separados. */
function normalizeMermaFilters(raw: Partial<MermaFilters> & { q?: string }): MermaFilters {
  const legacy = String(raw.q || '').trim();
  return {
    dateFrom: raw.dateFrom || '',
    dateTo: raw.dateTo || '',
    product: raw.product || (!raw.reason && !raw.user ? legacy : '') || '',
    reason: raw.reason || '',
    user: raw.user || '',
  };
}

function normalizeVoucherFilters(raw: Partial<VoucherFilters> & { q?: string }): VoucherFilters {
  const legacy = String(raw.q || '').trim();
  const hasSplit = Boolean(raw.voucher || raw.product || raw.sale);
  return {
    status: raw.status || 'open',
    dateFrom: raw.dateFrom || '',
    dateTo: raw.dateTo || '',
    voucher: raw.voucher || (!hasSplit ? legacy : '') || '',
    product: raw.product || '',
    sale: raw.sale || '',
  };
}

const MERMA_DESTINATIONS: { id: MermaKind; label: string; hint: string }[] = [
  { id: 'discard', label: 'Pérdida', hint: 'Sale de vitrina, no vuelve a sala' },
  { id: 'supplier', label: 'Devolver al proveedor', hint: 'Baja trazable hacia el proveedor' },
];

const VOUCHER_OUTCOMES: { id: VoucherOutcome; label: string }[] = [
  { id: 'exchange', label: 'Cambio' },
  { id: 'cash_refund', label: 'Devolución' },
];

const VOUCHER_DESTINATIONS: { id: VoucherDest; label: string }[] = [
  { id: 'restock', label: 'Volver a vitrina' },
  { id: 'discard', label: 'Pérdida' },
  { id: 'supplier', label: 'A proveedor' },
];

const MERMA_SORT_OPTIONS: { key: MermaSortKey; label: string }[] = [
  { key: 'date', label: 'Fecha' },
  { key: 'product', label: 'Producto' },
  { key: 'qty', label: 'Cantidad' },
  { key: 'reason', label: 'Motivo' },
  { key: 'user', label: 'Usuario' },
  { key: 'cost', label: 'Impacto' },
];

const VOUCHER_SORT_OPTIONS: { key: VoucherSortKey; label: string }[] = [
  { key: 'expires', label: 'Vence' },
  { key: 'issued', label: 'Emisión' },
  { key: 'number', label: 'N°' },
  { key: 'product', label: 'Producto' },
  { key: 'status', label: 'Estado' },
];

const VOUCHER_STATUS_CHIPS: { id: VoucherFilters['status']; label: string }[] = [
  { id: 'open', label: 'Vigentes' },
  { id: 'used', label: 'Usados' },
  { id: 'expired', label: 'Vencidos' },
  { id: 'cancelled', label: 'Anulados' },
  { id: 'all', label: 'Todos' },
];

function buildMermasQuery(f: MermaFilters, offset: number, limit: number) {
  const params = new URLSearchParams();
  if (f.dateFrom) params.set('dateFrom', f.dateFrom);
  if (f.dateTo) params.set('dateTo', f.dateTo);
  if (f.product.trim()) params.set('product', f.product.trim());
  if (f.reason.trim()) params.set('reason', f.reason.trim());
  if (f.user.trim()) params.set('user', f.user.trim());
  withPagination(params, offset, limit);
  return `/api/ops/mermas?${params.toString()}`;
}

function buildVouchersQuery(f: VoucherFilters, offset: number, limit: number) {
  const params = new URLSearchParams();
  if (f.status !== 'all') params.set('status', f.status);
  if (f.dateFrom) params.set('dateFrom', f.dateFrom);
  if (f.dateTo) params.set('dateTo', f.dateTo);
  if (f.voucher.trim()) params.set('voucher', f.voucher.trim());
  if (f.product.trim()) params.set('product', f.product.trim());
  if (f.sale.trim()) params.set('sale', f.sale.trim());
  withPagination(params, offset, limit);
  return `/api/ops/vouchers?${params.toString()}`;
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDateCompact(d: string) {
  const dt = new Date(d);
  return {
    day: dt.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' }),
    time: dt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
    full: fmtDateTime(d),
  };
}

function fmtDay(d: string) {
  return new Date(d.length <= 10 ? `${d}T12:00:00` : d).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function voucherStatusLabel(status: string) {
  switch (status) {
    case 'open':
      return 'Vigente';
    case 'used':
      return 'Usado';
    case 'expired':
      return 'Vencido';
    case 'cancelled':
      return 'Anulado';
    default:
      return status;
  }
}

function voucherBadgeClass(status: string) {
  switch (status) {
    case 'open':
      return 'badge success';
    case 'used':
      return 'badge brand';
    case 'expired':
      return 'badge warning';
    case 'cancelled':
      return 'badge danger';
    default:
      return 'badge';
  }
}

/** Un solo código: interno y barcode unificados no se listan dos veces. */
function displayProductCode(internal: string, barcode?: string | null) {
  const code = internal.trim();
  const bar = barcode?.trim() || '';
  if (!bar || codesMatch(code, bar)) return code || bar;
  return `${code} · ${bar}`;
}

function ProductFicha({
  name,
  code,
  meta,
  photoUrl,
  stock,
}: {
  name: string;
  code: string;
  meta?: string;
  photoUrl?: string | null;
  stock?: number | null;
}) {
  const src = mediaUrl(photoUrl) || '/brand/inventario-modelo.png';
  return (
    <div className="merma-ficha">
      <img className="merma-ficha-photo" src={src} alt="" />
      <div className="merma-ficha-body">
        <strong>{name}</strong>
        {meta ? <p className="merma-ficha-meta">{meta}</p> : null}
        {code ? <p className="muted merma-ficha-code">{code}</p> : null}
        {stock != null ? (
          <p className={stock <= 0 ? 'merma-stock-zero' : 'merma-stock-ok'}>Stock: {stock}</p>
        ) : null}
      </div>
    </div>
  );
}

function daysLeftLabel(daysLeft: number | string | null, status: string) {
  if (status !== 'open') return null;
  const n = Number(daysLeft);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return 'Vencido';
  if (n === 0) return 'Vence hoy';
  if (n === 1) return '1 día';
  return `${n} días`;
}

export function MermasPage() {
  const { branches, branchId } = useAuth();
  const activeBranch = branches.find((b) => b.id === branchId);
  const role = activeBranch?.role;
  const canSeeCost = role === 'owner' || role === 'branch_manager';

  const [tab, setTab] = useState<Tab>('vouchers');

  const [mermaFilters, setMermaFilters] = useState<MermaFilters>(() =>
    normalizeMermaFilters(loadListFilters('mermas', branchId, DEFAULT_MERMA_FILTERS)),
  );
  const [voucherFilters, setVoucherFilters] = useState<VoucherFilters>(() =>
    normalizeVoucherFilters(loadListFilters('vouchers', branchId, DEFAULT_VOUCHER_FILTERS)),
  );

  const [mermaSortKey, setMermaSortKey] = useState<MermaSortKey>('date');
  const [mermaSortDir, setMermaSortDir] = useState<SortDir>('desc');
  const [voucherSortKey, setVoucherSortKey] = useState<VoucherSortKey>('expires');
  const [voucherSortDir, setVoucherSortDir] = useState<SortDir>('asc');

  const [mermaSummary, setMermaSummary] = useState({
    count: 0,
    totalUnits: 0,
    totalCostImpact: null as number | null,
  });
  const [voucherSummary, setVoucherSummary] = useState({
    count: 0,
    openCount: 0,
    expiringSoon: 0,
  });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draftDateFrom, setDraftDateFrom] = useState('');
  const [draftDateTo, setDraftDateTo] = useState('');
  const [draftProduct, setDraftProduct] = useState('');
  const [draftReason, setDraftReason] = useState('');
  const [draftUser, setDraftUser] = useState('');
  const [draftVoucher, setDraftVoucher] = useState('');
  const [draftSale, setDraftSale] = useState('');
  const filtersTitleId = useId();
  const wizardTitleId = useId();
  const modalRef = useRef<HTMLDivElement>(null);
  const wizardRef = useRef<HTMLDivElement>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const mermaScanRef = useRef<HTMLInputElement>(null);
  const ticketScanRef = useRef<HTMLInputElement>(null);
  const garmentScanRef = useRef<HTMLInputElement>(null);
  const newScanRef = useRef<HTMLInputElement>(null);

  const [mermaCode, setMermaCode] = useState('');
  const [mermaProduct, setMermaProduct] = useState<LookupProduct | null>(null);
  const [mermaQty, setMermaQty] = useState('1');
  const [mermaKind, setMermaKind] = useState<MermaKind>('discard');
  const [mermaNotes, setMermaNotes] = useState('');
  const [mermaLooking, setMermaLooking] = useState(false);

  const [ticketNumber, setTicketNumber] = useState('');
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [pendingSaleLookup, setPendingSaleLookup] = useState<SaleLookupInfo | null>(null);
  const [ticketLooking, setTicketLooking] = useState(false);
  const [garmentCode, setGarmentCode] = useState('');
  const [garmentOk, setGarmentOk] = useState(false);
  const [outcome, setOutcome] = useState<VoucherOutcome | ''>('');
  const [destination, setDestination] = useState<VoucherDest | ''>('');
  const [newProduct, setNewProduct] = useState<LookupProduct | null>(null);
  const [newCode, setNewCode] = useState('');
  const [newLooking, setNewLooking] = useState(false);
  const [overrideNote, setOverrideNote] = useState('');

  const [saving, setSaving] = useState(false);

  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const mermasListFilters = useMemo(
    () => ({ ...mermaFilters, branchId: branchId || '' }),
    [mermaFilters, branchId],
  );
  const vouchersListFilters = useMemo(
    () => ({ ...voucherFilters, branchId: branchId || '' }),
    [voucherFilters, branchId],
  );

  useEffect(() => {
    setMermaFilters(normalizeMermaFilters(loadListFilters('mermas', branchId, DEFAULT_MERMA_FILTERS)));
    setVoucherFilters(
      normalizeVoucherFilters(loadListFilters('vouchers', branchId, DEFAULT_VOUCHER_FILTERS)),
    );
  }, [branchId]);

  useEffect(() => {
    saveListFilters('mermas', branchId, mermaFilters);
  }, [branchId, mermaFilters]);

  useEffect(() => {
    saveListFilters('vouchers', branchId, voucherFilters);
  }, [branchId, voucherFilters]);

  const fetchMermas = useCallback(async (f: MermaFilters & { branchId?: string }, offset: number, limit: number) => {
    const data = await api<{
      mermas: Merma[];
      hasMore: boolean;
      nextOffset?: number;
      summary?: { count: number; totalUnits: number; totalCostImpact: number | null };
    }>(buildMermasQuery(f, offset, limit));
    if (offset === 0 && data.summary) setMermaSummary(data.summary);
    return {
      items: data.mermas,
      hasMore: data.hasMore,
      nextOffset: data.nextOffset,
    };
  }, []);

  const fetchVouchers = useCallback(async (f: VoucherFilters & { branchId?: string }, offset: number, limit: number) => {
    const data = await api<{
      vouchers: Voucher[];
      hasMore: boolean;
      nextOffset?: number;
      summary?: { count: number; openCount: number; expiringSoon: number };
    }>(buildVouchersQuery(f, offset, limit));
    if (offset === 0 && data.summary) setVoucherSummary(data.summary);
    return {
      items: data.vouchers,
      hasMore: data.hasMore,
      nextOffset: data.nextOffset,
    };
  }, []);

  const mermasList = useInfiniteList({
    filters: mermasListFilters,
    fetchPage: fetchMermas,
    enabled: tab === 'mermas',
  });

  const vouchersList = useInfiniteList({
    filters: vouchersListFilters,
    fetchPage: fetchVouchers,
    enabled: tab === 'vouchers',
  });

  useEffect(() => {
    if (mermasList.error) toast.error(mermasList.error);
  }, [mermasList.error]);

  useEffect(() => {
    if (vouchersList.error) toast.error(vouchersList.error);
  }, [vouchersList.error]);

  const sortedMermas = useMemo(
    () => sortMermas(mermasList.items, mermaSortKey, mermaSortDir),
    [mermasList.items, mermaSortKey, mermaSortDir],
  );

  const sortedVouchers = useMemo(
    () => sortVouchers(vouchersList.items, voucherSortKey, voucherSortDir),
    [vouchersList.items, voucherSortKey, voucherSortDir],
  );

  const hasExtraMermaFilters = Boolean(
    mermaFilters.dateFrom ||
      mermaFilters.dateTo ||
      mermaFilters.product.trim() ||
      mermaFilters.reason.trim() ||
      mermaFilters.user.trim(),
  );
  const hasExtraVoucherFilters = Boolean(
    voucherFilters.dateFrom ||
      voucherFilters.dateTo ||
      voucherFilters.voucher.trim() ||
      voucherFilters.product.trim() ||
      voucherFilters.sale.trim() ||
      voucherFilters.status !== 'open',
  );

  const mermaChips = useMemo(() => {
    const chips: { key: string; label: string }[] = [];
    if (mermaFilters.dateFrom) chips.push({ key: 'from', label: `Desde ${fmtDay(mermaFilters.dateFrom)}` });
    if (mermaFilters.dateTo) chips.push({ key: 'to', label: `Hasta ${fmtDay(mermaFilters.dateTo)}` });
    if (mermaFilters.product.trim()) chips.push({ key: 'product', label: mermaFilters.product.trim() });
    if (mermaFilters.reason.trim()) chips.push({ key: 'reason', label: mermaFilters.reason.trim() });
    if (mermaFilters.user.trim()) chips.push({ key: 'user', label: mermaFilters.user.trim() });
    return chips;
  }, [mermaFilters]);

  const voucherChips = useMemo(() => {
    const chips: { key: string; label: string }[] = [];
    if (voucherFilters.dateFrom) {
      chips.push({ key: 'from', label: `Desde ${fmtDay(voucherFilters.dateFrom)}` });
    }
    if (voucherFilters.dateTo) chips.push({ key: 'to', label: `Hasta ${fmtDay(voucherFilters.dateTo)}` });
    if (voucherFilters.voucher.trim()) {
      chips.push({ key: 'voucher', label: voucherFilters.voucher.trim() });
    }
    if (voucherFilters.product.trim()) {
      chips.push({ key: 'product', label: voucherFilters.product.trim() });
    }
    if (voucherFilters.sale.trim()) chips.push({ key: 'sale', label: voucherFilters.sale.trim() });
    if (voucherFilters.status !== 'open') {
      const label = VOUCHER_STATUS_CHIPS.find((c) => c.id === voucherFilters.status)?.label;
      if (label) chips.push({ key: 'st', label });
    }
    return chips;
  }, [voucherFilters]);

  function openDrawer() {
    if (tab === 'mermas') {
      setDraftDateFrom(mermaFilters.dateFrom);
      setDraftDateTo(mermaFilters.dateTo);
      setDraftProduct(mermaFilters.product);
      setDraftReason(mermaFilters.reason);
      setDraftUser(mermaFilters.user);
    } else {
      setDraftDateFrom(voucherFilters.dateFrom);
      setDraftDateTo(voucherFilters.dateTo);
      setDraftVoucher(voucherFilters.voucher);
      setDraftProduct(voucherFilters.product);
      setDraftSale(voucherFilters.sale);
    }
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  function applyDrawer() {
    if (tab === 'mermas') {
      setMermaFilters({
        dateFrom: draftDateFrom,
        dateTo: draftDateTo,
        product: draftProduct,
        reason: draftReason,
        user: draftUser,
      });
    } else {
      setVoucherFilters((prev) => ({
        ...prev,
        dateFrom: draftDateFrom,
        dateTo: draftDateTo,
        voucher: draftVoucher,
        product: draftProduct,
        sale: draftSale,
      }));
    }
    setDrawerOpen(false);
  }

  function clearFilters() {
    if (tab === 'mermas') setMermaFilters(DEFAULT_MERMA_FILTERS);
    else setVoucherFilters(DEFAULT_VOUCHER_FILTERS);
  }

  useEffect(() => {
    if (!drawerOpen) return;
    const panel = modalRef.current;
    const t = window.setTimeout(() => {
      panel?.querySelector<HTMLElement>('input, button')?.focus();
    }, 40);
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDrawer();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
    };
  }, [drawerOpen]);

  function resetMermaWizard() {
    setMermaCode('');
    setMermaProduct(null);
    setMermaQty('1');
    setMermaKind('discard');
    setMermaNotes('');
  }

  function resetTicketWizard() {
    setTicketNumber('');
    setTicket(null);
    setPendingSaleLookup(null);
    setGarmentCode('');
    setGarmentOk(false);
    setOutcome('');
    setDestination('');
    setNewProduct(null);
    setNewCode('');
    setOverrideNote('');
  }

  function closeWizard() {
    setWizardOpen(false);
    resetMermaWizard();
    resetTicketWizard();
  }

  function openMermaWizard() {
    resetMermaWizard();
    resetTicketWizard();
    setTab('mermas');
    setWizardOpen(true);
  }

  function openCambioWizard() {
    resetMermaWizard();
    resetTicketWizard();
    setTab('vouchers');
    setWizardOpen(true);
  }

  useEffect(() => {
    closeWizard();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset al cambiar sucursal
  }, [branchId]);

  useEffect(() => {
    if (!wizardOpen) return;
    const t = window.setTimeout(() => {
      if (tab === 'mermas') mermaScanRef.current?.focus();
      else if (!ticket) ticketScanRef.current?.focus();
      else garmentScanRef.current?.focus();
    }, 40);
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (confirm) return;
      e.preventDefault();
      closeWizard();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
    };
  }, [wizardOpen, tab, ticket, confirm]);

  async function lookupProduct(raw: string): Promise<LookupProduct> {
    const code = normalizeScanCode(raw);
    try {
      const data = await api<{ product: LookupProduct }>(
        `/api/ops/mermas/lookup/${encodeURIComponent(code)}`,
      );
      return data.product;
    } catch {
      const data = await api<{ product: LookupProduct }>(
        `/api/products/by-code/${encodeURIComponent(code)}`,
      );
      return data.product;
    }
  }

  async function onScanMerma(e?: FormEvent) {
    e?.preventDefault();
    const raw = mermaScanRef.current?.value ?? mermaCode;
    const code = normalizeScanCode(raw);
    if (!code) return;
    setMermaLooking(true);
    try {
      const product = await lookupProduct(code);
      setMermaProduct(product);
      setMermaCode(code);
      const stock = Number(product.stock) || 0;
      setMermaQty(stock > 0 ? '1' : '0');
      if (stock <= 0) {
        toast.error('Sin stock en esta sucursal. No se puede dar de baja.');
      }
    } catch (err) {
      setMermaProduct(null);
      toast.error(userFacingError(err, 'Producto no encontrado'));
      mermaScanRef.current?.focus();
    } finally {
      setMermaLooking(false);
    }
  }

  function askRegisterMerma() {
    if (!mermaProduct) {
      toast.error('Pistolea el código de la prenda');
      return;
    }
    const stock = Number(mermaProduct.stock) || 0;
    if (stock <= 0) {
      toast.error('Sin stock en esta sucursal');
      return;
    }
    const n = Number(mermaQty);
    if (!Number.isInteger(n) || n < 1) {
      toast.error('La cantidad debe ser un entero mayor a 0');
      return;
    }
    if (n > stock) {
      toast.error(`No hay tanto stock en esta sucursal (disponible: ${stock})`);
      return;
    }
    setConfirm({ kind: 'merma' });
  }

  async function doRegisterMerma() {
    if (!mermaProduct) return;
    setActionBusy(true);
    setSaving(true);
    try {
      await api('/api/ops/mermas', {
        method: 'POST',
        body: {
          productId: mermaProduct.id,
          quantity: Number(mermaQty),
          kind: mermaKind,
          notes: mermaNotes.trim() || null,
        },
      });
      toast.success('Merma registrada');
      setConfirm(null);
      closeWizard();
      mermasList.reload();
    } catch (err) {
      toast.error(userFacingError(err, 'No se pudo registrar la merma'));
    } finally {
      setSaving(false);
      setActionBusy(false);
    }
  }

  async function fetchTicketByNumber(number: string, garment?: string) {
    const q = garment ? `?garment=${encodeURIComponent(garment)}` : '';
    return api<TicketLookupResponse>(
      `/api/ops/vouchers/by-number/${encodeURIComponent(number)}${q}`,
    );
  }

  function applyTicketLookup(data: TicketLookupResponse, typedNumber: string) {
    if (data.saleLookup?.needsProductScan && !data.voucher) {
      setPendingSaleLookup(data.saleLookup);
      setTicket(null);
      setTicketNumber(typedNumber);
      setGarmentOk(false);
      window.setTimeout(() => garmentScanRef.current?.focus(), 40);
      return 'pending';
    }
    if (!data.voucher) {
      setTicket(null);
      setPendingSaleLookup(null);
      toast.error('Ticket no encontrado');
      return 'empty';
    }
    setPendingSaleLookup(null);
    setTicket(data.voucher);
    setTicketNumber(data.voucher.voucher_number);
    if (data.voucher.blockedReason) {
      toast.error(data.voucher.blockedReason);
      return 'blocked';
    }
    window.setTimeout(() => garmentScanRef.current?.focus(), 40);
    return 'ok';
  }

  async function onLookupTicket(e?: FormEvent) {
    e?.preventDefault();
    const raw = (ticketScanRef.current?.value ?? ticketNumber).trim().toUpperCase();
    if (!raw) return;
    setTicketLooking(true);
    setGarmentOk(false);
    setGarmentCode('');
    setOutcome('');
    setDestination('');
    setNewProduct(null);
    setOverrideNote('');
    setPendingSaleLookup(null);
    setTicket(null);
    try {
      const data = await fetchTicketByNumber(raw);
      applyTicketLookup(data, raw);
    } catch (err) {
      setTicket(null);
      setPendingSaleLookup(null);
      toast.error(userFacingError(err, 'Ticket no encontrado'));
      ticketScanRef.current?.focus();
    } finally {
      setTicketLooking(false);
    }
  }

  async function onScanGarment(e?: FormEvent) {
    e?.preventDefault();
    const raw = garmentScanRef.current?.value ?? garmentCode;
    const code = normalizeScanCode(raw);
    if (!code) return;

    if (pendingSaleLookup && !ticket) {
      setTicketLooking(true);
      try {
        const data = await fetchTicketByNumber(pendingSaleLookup.receiptNumber, code);
        const outcome = applyTicketLookup(data, pendingSaleLookup.receiptNumber);
        if (outcome === 'ok' && data.voucher) {
          const match =
            codesMatch(code, data.voucher.product.internal_code) ||
            codesMatch(code, data.voucher.product.barcode);
          setGarmentCode(code);
          setGarmentOk(Boolean(match));
          if (!match) toast.error('El código no corresponde a la prenda de este ticket');
        }
      } catch (err) {
        setGarmentOk(false);
        toast.error(userFacingError(err, 'No se pudo elegir el ticket de esa prenda'));
      } finally {
        setTicketLooking(false);
      }
      return;
    }

    if (!ticket) return;
    const match =
      codesMatch(code, ticket.product.internal_code) || codesMatch(code, ticket.product.barcode);
    setGarmentCode(code);
    if (!match) {
      setGarmentOk(false);
      toast.error('El código no corresponde a la prenda de este ticket');
      return;
    }
    setGarmentOk(true);
  }

  async function onScanNewProduct(e?: FormEvent) {
    e?.preventDefault();
    const raw = newScanRef.current?.value ?? newCode;
    const code = normalizeScanCode(raw);
    if (!code) return;
    if (!ticket) return;
    setNewLooking(true);
    try {
      const product = await lookupProduct(code);
      if (product.id === ticket.product.id && destination === 'restock') {
        toast.error('Para un cambio, pistolea una prenda distinta de vitrina');
        setNewProduct(null);
        return;
      }
      const expectedPrice = ticket.sale?.unit_price ?? ticket.product.sale_price;
      if (!sameSalePriceExact(expectedPrice, product.sale_price)) {
        toast.error('Debe ser el mismo precio de venta (p. ej. otra talla)');
        setNewProduct(null);
        return;
      }
      setNewProduct(product);
      setNewCode(code);
    } catch (err) {
      setNewProduct(null);
      toast.error(userFacingError(err, 'Prenda nueva no encontrada'));
    } finally {
      setNewLooking(false);
    }
  }

  function askFulfill() {
    if (!ticket) return;
    if (!ticket.canFulfill || ticket.blockedReason) {
      toast.error(ticket.blockedReason || 'Este ticket no está disponible');
      return;
    }
    if (ticket.expired && !overrideNote.trim()) {
      toast.error('Indica el motivo para usar un ticket vencido');
      return;
    }
    if (!garmentOk || !garmentCode) {
      toast.error('Pistolea la prenda del ticket');
      return;
    }
    if (!outcome) {
      toast.error('Elige cambio o devolución');
      return;
    }
    if (!destination) {
      toast.error('Indica el destino de la prenda');
      return;
    }
    if (outcome === 'exchange' && !newProduct) {
      toast.error('Pistolea la prenda nueva para el cambio');
      return;
    }
    if (
      outcome === 'exchange' &&
      newProduct &&
      ticket &&
      !sameSalePriceExact(
        ticket.sale?.unit_price ?? ticket.product.sale_price,
        newProduct.sale_price,
      )
    ) {
      toast.error('Debe ser el mismo precio de venta (p. ej. otra talla)');
      return;
    }
    setConfirm({ kind: 'fulfill' });
  }

  async function doFulfill() {
    if (!ticket) return;
    setActionBusy(true);
    setSaving(true);
    try {
      await api(`/api/ops/vouchers/${ticket.id}/fulfill`, {
        method: 'POST',
        body: {
          scannedCode: garmentCode,
          outcome,
          destination,
          newProductId: outcome === 'exchange' ? newProduct?.id : null,
          cashAmount:
            outcome === 'cash_refund' ? Number(ticket.sale?.line_total || 0) : null,
          overrideExpired: ticket.expired,
          overrideNote: ticket.expired ? overrideNote.trim() : null,
        },
      });
      toast.success(outcome === 'exchange' ? 'Cambio registrado' : 'Devolución registrada');
      setConfirm(null);
      closeWizard();
      vouchersList.reload();
      mermasList.reload();
    } catch (err) {
      toast.error(userFacingError(err, 'No se pudo completar el ticket de cambio'));
    } finally {
      setSaving(false);
      setActionBusy(false);
    }
  }

  async function attendFromHistory(v: Voucher) {
    setTab('vouchers');
    resetMermaWizard();
    setTicketNumber(v.voucher_number);
    setGarmentCode('');
    setGarmentOk(false);
    setOutcome('');
    setDestination('');
    setNewProduct(null);
    setNewCode('');
    setOverrideNote('');
    setWizardOpen(true);
    setTicketLooking(true);
    try {
      const data = await api<TicketLookupResponse>(
        `/api/ops/vouchers/by-number/${encodeURIComponent(v.voucher_number)}`,
      );
      if (!data.voucher) {
        toast.error('Ticket no encontrado');
        return;
      }
      setTicket(data.voucher);
      if (data.voucher.blockedReason) toast.error(data.voucher.blockedReason);
    } catch (err) {
      toast.error(userFacingError(err, 'Ticket no encontrado'));
    } finally {
      setTicketLooking(false);
    }
  }

  async function doCancelVoucher() {
    if (!confirm || confirm.kind !== 'cancel') return;
    setActionBusy(true);
    try {
      await api(`/api/ops/vouchers/${confirm.voucher.id}/cancel`, {
        method: 'POST',
        body: {},
      });
      toast.success('Ticket anulado');
      setConfirm(null);
      vouchersList.reload();
    } catch (err) {
      toast.error(userFacingError(err, 'No se pudo anular el ticket'));
    } finally {
      setActionBusy(false);
    }
  }

  const list = tab === 'mermas' ? mermasList : vouchersList;
  const hasExtra = tab === 'mermas' ? hasExtraMermaFilters : hasExtraVoucherFilters;
  const summaryChips = tab === 'mermas' ? mermaChips : voucherChips;
  const showEmptyFigure =
    !list.loading &&
    ((tab === 'mermas' && mermasList.items.length === 0) ||
      (tab === 'vouchers' && vouchersList.items.length === 0));

  const mermaStock = mermaProduct ? Number(mermaProduct.stock) || 0 : 0;
  const mermaQtyN = Number(mermaQty);
  const mermaBlocked = !mermaProduct || mermaStock <= 0 || !Number.isInteger(mermaQtyN) || mermaQtyN < 1 || mermaQtyN > mermaStock;

  const confirmTitle =
    confirm?.kind === 'merma'
      ? 'Confirmar merma'
      : confirm?.kind === 'fulfill'
        ? outcome === 'exchange'
          ? 'Confirmar cambio'
          : 'Confirmar devolución'
        : confirm?.kind === 'cancel'
          ? 'Anular ticket'
          : '';

  const confirmMessage =
    confirm?.kind === 'merma' && mermaProduct
      ? `Se dará de baja ${mermaQty} ud. de «${mermaProduct.name}» (${MERMA_DESTINATIONS.find((d) => d.id === mermaKind)?.label}). Queda movimiento auditable.`
      : confirm?.kind === 'fulfill' && ticket
        ? `Ticket ${ticket.voucher_number}: ${outcome === 'exchange' ? 'cambio' : 'devolución'}. Destino: ${VOUCHER_DESTINATIONS.find((d) => d.id === destination)?.label || ''}.`
        : confirm?.kind === 'cancel'
          ? `Se anulará el ticket ${confirm.voucher.voucher_number}. No podrá usarse después.`
          : '';

  return (
    <div className="ing-list merma-list">
      <div className={`ing-list-workspace${showEmptyFigure ? ' has-empty-figure' : ''}`}>
        <div className="ing-list-main">
          <div className="section-title merma-topbar">
            <nav className="admin-tabs merma-tabs-inline" aria-label="Mermas y cambios">
              <button
                type="button"
                className={tab === 'vouchers' ? 'is-active' : undefined}
                onClick={() => setTab('vouchers')}
              >
                Cambio / devolución
              </button>
              <button
                type="button"
                className={tab === 'mermas' ? 'is-active' : undefined}
                onClick={() => setTab('mermas')}
              >
                Merma
              </button>
            </nav>
            {tab === 'mermas' ? (
              <button type="button" className="btn merma-register-btn" data-help="cta.mermas.registrar" onClick={openMermaWizard}>
                Registrar merma
              </button>
            ) : (
              <button type="button" className="btn merma-register-btn" data-help="cta.mermas.ticket" onClick={openCambioWizard}>
                Atender ticket
              </button>
            )}
          </div>


          {tab === 'mermas' ? (
            <div className="inv-stats merma-stats" aria-label="Resumen de mermas">
              <div className="inv-stat">
                <span className="inv-stat-label">Registros</span>
                <strong className="inv-stat-value">{mermaSummary.count}</strong>
                <span className="inv-stat-meta">Con filtros</span>
              </div>
              <div className="inv-stat">
                <span className="inv-stat-label">Unidades</span>
                <strong className="inv-stat-value merma-kpi-out">−{mermaSummary.totalUnits}</strong>
                <span className="inv-stat-meta">Baja de stock</span>
              </div>
              {canSeeCost && mermaSummary.totalCostImpact != null ? (
                <div className="inv-stat">
                  <span className="inv-stat-label">Impacto (Precio costo)</span>
                  <strong className="inv-stat-value">{money(mermaSummary.totalCostImpact)}</strong>
                  <span className="inv-stat-meta">Solo administración</span>
                </div>
              ) : (
                <div className="inv-stat">
                  <span className="inv-stat-label">Trazabilidad</span>
                  <strong className="inv-stat-value">OK</strong>
                  <span className="inv-stat-meta">Usuario + fecha</span>
                </div>
              )}
            </div>
          ) : (
            <div className="inv-stats merma-stats" aria-label="Resumen de vouchers">
              <div className="inv-stat">
                <span className="inv-stat-label">Listados</span>
                <strong className="inv-stat-value">{voucherSummary.count}</strong>
                <span className="inv-stat-meta">Con filtros</span>
              </div>
              <div className="inv-stat">
                <span className="inv-stat-label">Vigentes</span>
                <strong className="inv-stat-value">{voucherSummary.openCount}</strong>
                <span className="inv-stat-meta">Plazo típico 7 días</span>
              </div>
              <div className="inv-stat">
                <span className="inv-stat-label">Por vencer</span>
                <strong className="inv-stat-value merma-kpi-warn">{voucherSummary.expiringSoon}</strong>
                <span className="inv-stat-meta">≤ 3 días</span>
              </div>
            </div>
          )}

          <div className="ing-filters" role="toolbar" aria-label="Filtros">
            {tab === 'vouchers' &&
              VOUCHER_STATUS_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={`ing-chip${voucherFilters.status === chip.id ? ' is-active' : ''}`}
                  aria-pressed={voucherFilters.status === chip.id}
                  onClick={() => setVoucherFilters((prev) => ({ ...prev, status: chip.id }))}
                >
                  {chip.label}
                </button>
              ))}
            <button type="button" className="btn secondary ing-filters-btn" onClick={openDrawer}>
              Filtros
              {hasExtra ? (
                <span className="prod-filters-badge" aria-label="Filtros activos">
                  {summaryChips.length}
                </span>
              ) : null}
            </button>
            <div className="field merma-sort-select mobile-only">
              <label className="sr-only" htmlFor="merma-sort">
                Ordenar
              </label>
              {tab === 'mermas' ? (
                <select
                  id="merma-sort"
                  aria-label="Ordenar por"
                  value={`${mermaSortKey}:${mermaSortDir}`}
                  onChange={(e) => {
                    const [key, dir] = e.target.value.split(':') as [MermaSortKey, SortDir];
                    setMermaSortKey(key);
                    setMermaSortDir(dir);
                  }}
                >
                  {MERMA_SORT_OPTIONS.flatMap((o) => [
                    <option key={`${o.key}:asc`} value={`${o.key}:asc`}>
                      {o.label} ↑
                    </option>,
                    <option key={`${o.key}:desc`} value={`${o.key}:desc`}>
                      {o.label} ↓
                    </option>,
                  ])}
                </select>
              ) : (
                <select
                  id="merma-sort"
                  aria-label="Ordenar por"
                  value={`${voucherSortKey}:${voucherSortDir}`}
                  onChange={(e) => {
                    const [key, dir] = e.target.value.split(':') as [VoucherSortKey, SortDir];
                    setVoucherSortKey(key);
                    setVoucherSortDir(dir);
                  }}
                >
                  {VOUCHER_SORT_OPTIONS.flatMap((o) => [
                    <option key={`${o.key}:asc`} value={`${o.key}:asc`}>
                      {o.label} ↑
                    </option>,
                    <option key={`${o.key}:desc`} value={`${o.key}:desc`}>
                      {o.label} ↓
                    </option>,
                  ])}
                </select>
              )}
            </div>
          </div>
{list.error && <p className="error">{list.error}</p>}

          <div className="ing-list-scroll" ref={list.scrollRef}>
            {list.loading && (
              <BoutiqueLoader label="Cargando…" variant="block" />
            )}

            {tab === 'mermas' && !list.loading && !mermasList.items.length && (
              <div className="sales-empty">
                {hasExtraMermaFilters ? (
                  <>
                    <h3>Ninguna merma coincide</h3>
                    <p className="muted">Prueba otras fechas o búsqueda.</p>
                    <button
                      type="button"
                      className="btn secondary"
                      style={{ marginTop: '0.75rem' }}
                      onClick={clearFilters}
                    >
                      Limpiar filtros
                    </button>
                  </>
                ) : (
                  <>
                    <h3>Sin mermas registradas</h3>
                    <p className="muted">
                      Pistolea el código arriba para dar de baja una prenda.
                    </p>
                  </>
                )}
              </div>
            )}

            {tab === 'vouchers' && !list.loading && !vouchersList.items.length && (
              <div className="sales-empty">
                {hasExtraVoucherFilters ? (
                  <>
                    <h3>Ningún voucher coincide</h3>
                    <p className="muted">Prueba otro estado, fechas o búsqueda.</p>
                    <button
                      type="button"
                      className="btn secondary"
                      style={{ marginTop: '0.75rem' }}
                      onClick={clearFilters}
                    >
                      Limpiar filtros
                    </button>
                  </>
                ) : (
                  <>
                    <h3>Sin tickets de cambio</h3>
                    <p className="muted">
                      Se generan en la venta si la prenda admite cambio o devolución.
                    </p>
                    <Link to="/ventas" className="btn secondary desktop-only" style={{ marginTop: '0.75rem' }}>
                      Ir a historial de ventas
                    </Link>
                  </>
                )}
              </div>
            )}

            {tab === 'mermas' && !list.loading && sortedMermas.length > 0 && (
              <>
                <p className="merma-status muted">
                  {sortedMermas.length} merma{sortedMermas.length === 1 ? '' : 's'}
                </p>

                <div className="list-cards mobile-only merma-cards">
                  {sortedMermas.map((m) => (
                    <article key={m.id} className="list-card merma-card">
                      <div className="merma-card-head">
                        <span className="badge danger">Merma</span>
                        <span className="muted">{fmtDateTime(m.created_at)}</span>
                      </div>
                      <strong className="merma-card-product">{m.product_name}</strong>
                      <div className="meta">
                        {m.internal_code}
                        {m.created_by_name ? <span className="muted"> · {m.created_by_name}</span> : null}
                      </div>
                      <p className="merma-reason" title={m.reason}>
                        {m.reason}
                      </p>
                      <div className="merma-card-foot">
                        <strong className="merma-kpi-out">−{m.quantity}</strong>
                        {canSeeCost && m.cost_impact != null ? (
                          <span className="muted">Impacto (Precio costo) {money(m.cost_impact)}</span>
                        ) : (
                          <Link className="merma-origin-link" to="/movimientos">
                            Ver movimientos →
                          </Link>
                        )}
                      </div>
                    </article>
                  ))}
                </div>

                <div className="table-wrap desktop-only merma-table-wrap">
                  <table className="table merma-table">
                    <thead>
                      <tr>
                        <SortableTh
                          label="Fecha"
                          column="date"
                          sortKey={mermaSortKey}
                          sortDir={mermaSortDir}
                          onSort={(col) => {
                            const next = nextMermaSort(mermaSortKey, mermaSortDir, col);
                            setMermaSortKey(next.key);
                            setMermaSortDir(next.dir);
                          }}
                        />
                        <SortableTh
                          label="Producto"
                          column="product"
                          sortKey={mermaSortKey}
                          sortDir={mermaSortDir}
                          onSort={(col) => {
                            const next = nextMermaSort(mermaSortKey, mermaSortDir, col);
                            setMermaSortKey(next.key);
                            setMermaSortDir(next.dir);
                          }}
                        />
                        <SortableTh
                          label="Qty"
                          column="qty"
                          sortKey={mermaSortKey}
                          sortDir={mermaSortDir}
                          onSort={(col) => {
                            const next = nextMermaSort(mermaSortKey, mermaSortDir, col);
                            setMermaSortKey(next.key);
                            setMermaSortDir(next.dir);
                          }}
                          className="merma-col-num"
                        />
                        <SortableTh
                          label="Motivo"
                          column="reason"
                          sortKey={mermaSortKey}
                          sortDir={mermaSortDir}
                          onSort={(col) => {
                            const next = nextMermaSort(mermaSortKey, mermaSortDir, col);
                            setMermaSortKey(next.key);
                            setMermaSortDir(next.dir);
                          }}
                        />
                        <SortableTh
                          label="Usuario"
                          column="user"
                          sortKey={mermaSortKey}
                          sortDir={mermaSortDir}
                          onSort={(col) => {
                            const next = nextMermaSort(mermaSortKey, mermaSortDir, col);
                            setMermaSortKey(next.key);
                            setMermaSortDir(next.dir);
                          }}
                        />
                        {canSeeCost ? (
                          <SortableTh
                            label="Impacto"
                            column="cost"
                            sortKey={mermaSortKey}
                            sortDir={mermaSortDir}
                            onSort={(col) => {
                              const next = nextMermaSort(mermaSortKey, mermaSortDir, col);
                              setMermaSortKey(next.key);
                              setMermaSortDir(next.dir);
                            }}
                            className="merma-col-num"
                          />
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedMermas.map((m) => {
                        const when = fmtDateCompact(m.created_at);
                        return (
                          <tr key={m.id}>
                            <td title={when.full}>
                              <div className="merma-date-stack">
                                <span>{when.day}</span>
                                <span className="muted">{when.time}</span>
                              </div>
                            </td>
                            <td>
                              <div className="merma-product-stack">
                                <span title={m.product_name}>{m.product_name}</span>
                                <span className="muted">{m.internal_code}</span>
                              </div>
                            </td>
                            <td className="merma-col-num merma-kpi-out">−{m.quantity}</td>
                            <td title={m.reason}>
                              <span className="merma-reason-text">{m.reason}</span>
                            </td>
                            <td>{m.created_by_name || '—'}</td>
                            {canSeeCost ? (
                              <td className="merma-col-num">
                                {m.cost_impact != null ? money(m.cost_impact) : '—'}
                              </td>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <InfiniteListFooter
                  sentinelRef={mermasList.sentinelRef}
                  loadingMore={mermasList.loadingMore}
                  hasMore={mermasList.hasMore}
                  itemCount={mermasList.items.length}
                />
              </>
            )}

            {tab === 'vouchers' && !list.loading && sortedVouchers.length > 0 && (
              <>
                <p className="merma-status muted">
                  {sortedVouchers.length} voucher{sortedVouchers.length === 1 ? '' : 's'}
                </p>

                <div className="list-cards mobile-only merma-cards">
                  {sortedVouchers.map((v) => {
                    const left = daysLeftLabel(v.days_left, v.status);
                    return (
                      <article key={v.id} className="list-card merma-card">
                        <div className="merma-card-head">
                          <span className={voucherBadgeClass(v.status)}>
                            {voucherStatusLabel(v.status)}
                          </span>
                          <strong>{v.voucher_number}</strong>
                        </div>
                        <strong className="merma-card-product">{v.product_name}</strong>
                        <div className="meta">
                          {v.internal_code}
                          {v.sale_receipt ? (
                            <span className="muted"> · Venta {v.sale_receipt}</span>
                          ) : null}
                        </div>
                        <div className="merma-voucher-meta">
                          <span>Emisión {fmtDay(v.issued_at)}</span>
                          <span>Vence {fmtDay(v.expires_at)}</span>
                          {left ? <span className="merma-days-left">{left}</span> : null}
                        </div>
                        {v.status === 'open' || v.status === 'expired' ? (
                          <div className="merma-card-actions">
                            <button
                              type="button"
                              className="btn secondary"
                              onClick={() => void attendFromHistory(v)}
                            >
                              Atender
                            </button>
                            {v.status === 'open' ? (
                            <button
                              type="button"
                              className="btn ghost"
                              onClick={() => setConfirm({ kind: 'cancel', voucher: v })}
                            >
                              Anular
                            </button>
                            ) : null}
                          </div>
                        ) : v.sale_receipt ? (
                          <Link className="merma-origin-link desktop-only" to="/ventas">
                            Ver en historial de ventas →
                          </Link>
                        ) : null}
                      </article>
                    );
                  })}
                </div>

                <div className="table-wrap desktop-only merma-table-wrap">
                  <table className="table merma-table">
                    <thead>
                      <tr>
                        <SortableTh
                          label="N°"
                          column="number"
                          sortKey={voucherSortKey}
                          sortDir={voucherSortDir}
                          onSort={(col) => {
                            const next = nextVoucherSort(voucherSortKey, voucherSortDir, col);
                            setVoucherSortKey(next.key);
                            setVoucherSortDir(next.dir);
                          }}
                        />
                        <SortableTh
                          label="Producto"
                          column="product"
                          sortKey={voucherSortKey}
                          sortDir={voucherSortDir}
                          onSort={(col) => {
                            const next = nextVoucherSort(voucherSortKey, voucherSortDir, col);
                            setVoucherSortKey(next.key);
                            setVoucherSortDir(next.dir);
                          }}
                        />
                        <th>Venta</th>
                        <SortableTh
                          label="Vence"
                          column="expires"
                          sortKey={voucherSortKey}
                          sortDir={voucherSortDir}
                          onSort={(col) => {
                            const next = nextVoucherSort(voucherSortKey, voucherSortDir, col);
                            setVoucherSortKey(next.key);
                            setVoucherSortDir(next.dir);
                          }}
                        />
                        <SortableTh
                          label="Estado"
                          column="status"
                          sortKey={voucherSortKey}
                          sortDir={voucherSortDir}
                          onSort={(col) => {
                            const next = nextVoucherSort(voucherSortKey, voucherSortDir, col);
                            setVoucherSortKey(next.key);
                            setVoucherSortDir(next.dir);
                          }}
                        />
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedVouchers.map((v) => {
                        const left = daysLeftLabel(v.days_left, v.status);
                        return (
                          <tr key={v.id}>
                            <td>
                              <strong>{v.voucher_number}</strong>
                            </td>
                            <td>
                              <div className="merma-product-stack">
                                <span title={v.product_name}>{v.product_name}</span>
                                <span className="muted">{v.internal_code}</span>
                              </div>
                            </td>
                            <td>
                              {v.sale_receipt ? (
                                <Link className="merma-origin-link" to="/ventas">
                                  {v.sale_receipt}
                                </Link>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td>
                              <div className="merma-date-stack">
                                <span>{fmtDay(v.expires_at)}</span>
                                {left ? <span className="muted">{left}</span> : null}
                              </div>
                            </td>
                            <td>
                              <span className={voucherBadgeClass(v.status)}>
                                {voucherStatusLabel(v.status)}
                              </span>
                            </td>
                            <td>
                              {v.status === 'open' || v.status === 'expired' ? (
                                <div className="merma-row-actions">
                                  <button
                                    type="button"
                                    className="btn secondary"
                                    onClick={() => void attendFromHistory(v)}
                                  >
                                    Atender
                                  </button>
                                  {v.status === 'open' ? (
                                  <button
                                    type="button"
                                    className="btn ghost"
                                    onClick={() => setConfirm({ kind: 'cancel', voucher: v })}
                                  >
                                    Anular
                                  </button>
                                  ) : null}
                                </div>
                              ) : (
                                '—'
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <InfiniteListFooter
                  sentinelRef={vouchersList.sentinelRef}
                  loadingMore={vouchersList.loadingMore}
                  hasMore={vouchersList.hasMore}
                  itemCount={vouchersList.items.length}
                />
              </>
            )}
          </div>
        </div>

        {showEmptyFigure ? (
          <aside className="ing-list-figure merma-list-figure" aria-hidden="true">
            <img
              className="ing-list-figure-img"
              src="/brand/mermas-modelo.png"
              alt=""
            />
          </aside>
        ) : null}
      </div>

      {drawerOpen && (
        <PosModal
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDrawer();
          }}>
          <ModalOverlayClose onClose={closeDrawer}>
          <div
            className="pos-modal-panel ing-filters-sheet"
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={filtersTitleId}
          >
            <div className="pos-modal-head">
              <h3 id={filtersTitleId}>Filtros</h3>
            </div>
            <div className="ing-filters-sheet-body">
              <div className="ing-filter-fields">
                <div className="field">
                  <label htmlFor="merma-f-from">Fecha desde</label>
                  <input
                    id="merma-f-from"
                    type="date"
                    value={draftDateFrom}
                    onChange={(e) => setDraftDateFrom(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="merma-f-to">Fecha hasta</label>
                  <input
                    id="merma-f-to"
                    type="date"
                    value={draftDateTo}
                    onChange={(e) => setDraftDateTo(e.target.value)}
                  />
                </div>
                {tab === 'mermas' ? (
                  <>
                    <div className="field">
                      <label htmlFor="merma-f-product">Producto</label>
                      <input
                        id="merma-f-product"
                        value={draftProduct}
                        onChange={(e) => setDraftProduct(e.target.value)}
                        placeholder="Nombre o código"
                        autoComplete="off"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="merma-f-reason">Motivo</label>
                      <input
                        id="merma-f-reason"
                        value={draftReason}
                        onChange={(e) => setDraftReason(e.target.value)}
                        placeholder="Texto del motivo"
                        autoComplete="off"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="merma-f-user">Usuario</label>
                      <input
                        id="merma-f-user"
                        value={draftUser}
                        onChange={(e) => setDraftUser(e.target.value)}
                        placeholder="Nombre"
                        autoComplete="off"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="field">
                      <label htmlFor="merma-f-voucher">N° ticket</label>
                      <input
                        id="merma-f-voucher"
                        value={draftVoucher}
                        onChange={(e) => setDraftVoucher(e.target.value)}
                        placeholder="Ej. VC-000002"
                        autoComplete="off"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="merma-f-product">Producto</label>
                      <input
                        id="merma-f-product"
                        value={draftProduct}
                        onChange={(e) => setDraftProduct(e.target.value)}
                        placeholder="Nombre o código"
                        autoComplete="off"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="merma-f-sale">N° venta</label>
                      <input
                        id="merma-f-sale"
                        value={draftSale}
                        onChange={(e) => setDraftSale(e.target.value)}
                        placeholder="Ej. V-000003"
                        autoComplete="off"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="btn-row ing-filters-sheet-actions">
              <button type="button" className="btn secondary" onClick={closeDrawer}>
                Cancelar
              </button>
              <button type="button" className="btn" onClick={applyDrawer}>
                Aplicar
              </button>
            </div>
          </div></ModalOverlayClose>
        </PosModal>
      )}


      {wizardOpen ? (
        <PosModal
          className="no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget && !confirm) closeWizard();
          }}>
          <ModalOverlayClose onClose={closeWizard}>
          <div
            className="pos-modal-panel merma-form-sheet"
            ref={wizardRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={wizardTitleId}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pos-modal-head">
              <h3 id={wizardTitleId}>
                {tab === 'mermas' ? 'Registrar merma' : 'Atender ticket'}
              </h3>
            </div>
            <div className="merma-form-body">
          {tab === 'mermas' ? (
            <section className="merma-wizard" aria-label="Dar de baja">
              <form className="merma-scan-row" onSubmit={(e) => void onScanMerma(e)}>
                <label className="sr-only" htmlFor="merma-scan">
                  Código de la prenda
                </label>
                <input
                  id="merma-scan"
                  ref={mermaScanRef}
                  value={mermaCode}
                  onChange={(e) => setMermaCode(e.target.value)}
                  placeholder="Pistolea el código y pulsa Enter"
                  autoComplete="off"
                  inputMode="text"
                />
                <button type="submit" className="btn" disabled={mermaLooking}>
                  {mermaLooking ? 'Buscando…' : 'Buscar'}
                </button>
              </form>
              {mermaProduct ? (
                <div className="merma-wizard-body">
                  <ProductFicha
                    name={mermaProduct.name}
                    code={displayProductCode(mermaProduct.internal_code, mermaProduct.barcode)}
                    meta={[mermaProduct.size_label, mermaProduct.color].filter(Boolean).join(' · ')}
                    photoUrl={mermaProduct.photo_url}
                    stock={mermaStock}
                  />
                  {mermaStock <= 0 ? (
                    <p className="error merma-wizard-warn">Sin stock. No se puede dar de baja.</p>
                  ) : (
                    <div className="merma-wizard-actions-col">
                      <div className="field merma-qty-field">
                        <label htmlFor="merma-qty">Unidades a dar de baja</label>
                        <select
                          id="merma-qty"
                          value={mermaQty}
                          onChange={(e) => setMermaQty(e.target.value)}
                        >
                          {Array.from({ length: Math.max(1, mermaStock) }, (_, i) => i + 1).map(
                            (n) => (
                              <option key={n} value={String(n)}>
                                {n} {n === 1 ? 'unidad' : 'unidades'}
                              </option>
                            ),
                          )}
                        </select>
                        <span className="muted">Máximo en stock: {mermaStock}</span>
                      </div>
                      <div className="merma-choice" role="group" aria-label="Destino de la prenda">
                        {MERMA_DESTINATIONS.map((d) => (
                          <button
                            key={d.id}
                            type="button"
                            className={`merma-choice-btn${mermaKind === d.id ? ' is-active' : ''}`}
                            onClick={() => setMermaKind(d.id)}
                          >
                            <strong>{d.label}</strong>
                            <span>{d.hint}</span>
                          </button>
                        ))}
                      </div>
                      <div className="field">
                        <label htmlFor="merma-notes">Nota (opcional)</label>
                        <input
                          id="merma-notes"
                          value={mermaNotes}
                          onChange={(e) => setMermaNotes(e.target.value)}
                          placeholder="Detalle para la trazabilidad…"
                          maxLength={500}
                        />
                      </div>
                      <div className="merma-wizard-actions">
                        <button type="button" className="btn ghost" onClick={resetMermaWizard}>
                          Otra prenda
                        </button>
                        <button
                          type="button"
                          className="btn"
                          disabled={saving || mermaBlocked}
                          onClick={askRegisterMerma}
                        >
                          Dar de baja
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="muted merma-wizard-hint">Usa la pistola. Enter busca en esta sucursal.</p>
              )}
            </section>
          ) : (
            <section className="merma-wizard" aria-label="Ticket de cambio">
              <form className="merma-scan-row" onSubmit={(e) => void onLookupTicket(e)}>
                <label className="sr-only" htmlFor="ticket-scan">
                  Número de ticket
                </label>
                <input
                  id="ticket-scan"
                  ref={ticketScanRef}
                  value={ticketNumber}
                  onChange={(e) => setTicketNumber(e.target.value)}
                  placeholder="N° ticket (VC…) o boleta (V…)"
                  autoComplete="off"
                />
                <button type="submit" className="btn" disabled={ticketLooking}>
                  {ticketLooking ? 'Buscando…' : 'Buscar'}
                </button>
              </form>
              {!ticket && pendingSaleLookup?.needsProductScan ? (
                <>
                  <p className="muted merma-wizard-hint">
                    Hay {pendingSaleLookup.openCount} ticket
                    {pendingSaleLookup.openCount === 1 ? '' : 's'} vigente
                    {pendingSaleLookup.openCount === 1 ? '' : 's'} en la venta{' '}
                    {pendingSaleLookup.receiptNumber}. Pistolea la prenda para elegir el ticket.
                  </p>
                  <form className="merma-scan-row" onSubmit={(e) => void onScanGarment(e)}>
                    <label className="sr-only" htmlFor="garment-scan">
                      Código de la prenda del ticket
                    </label>
                    <input
                      id="garment-scan"
                      ref={garmentScanRef}
                      value={garmentCode}
                      onChange={(e) => {
                        setGarmentCode(e.target.value);
                        setGarmentOk(false);
                      }}
                      placeholder="Pistolea el código de barras de la prenda"
                      autoComplete="off"
                    />
                    <button type="submit" className="btn secondary" disabled={ticketLooking}>
                      {ticketLooking ? 'Buscando…' : 'Confirmar'}
                    </button>
                  </form>
                </>
              ) : !ticket ? (
                <p className="muted merma-wizard-hint">
                  Busca el ticket (VC…) o la boleta (V…). Si la venta tiene varias prendas, después
                  pistolea el código de esa prenda.
                </p>
              ) : (
                <>
                  <p className="merma-ticket-meta">
                    <span
                      className={voucherBadgeClass(
                        ticket.expired && ticket.status === 'open' ? 'expired' : ticket.status,
                      )}
                    >
                      {ticket.expired && ticket.canFulfill
                        ? 'Vencido'
                        : voucherStatusLabel(ticket.status)}
                    </span>
                    <span className="muted">
                      {ticket.expired ? 'Venció' : 'Vence'} {fmtDay(ticket.expires_at)}
                      {!ticket.expired && daysLeftLabel(ticket.days_left, ticket.status)
                        ? ` · ${daysLeftLabel(ticket.days_left, ticket.status)}`
                        : ''}
                    </span>
                    {ticket.sale?.id &&
                    ticket.sale.receipt_number &&
                    ticket.sale.receipt_number !== ticket.voucher_number ? (
                      <Link className="merma-ticket-sale desktop-only" to={`/ventas?sale=${ticket.sale.id}`}>
                        Venta {ticket.sale.receipt_number}
                      </Link>
                    ) : null}
                  </p>
                  {ticket.blockedReason ? (
                    <p className="error merma-wizard-warn">{ticket.blockedReason}</p>
                  ) : null}
                  {ticket.warnPartyDress ? (
                    <p className="merma-wizard-party" role="status">
                      Vestido de fiesta: por defecto no admite cambios. Puedes seguir si la dueña lo autoriza.
                    </p>
                  ) : null}
                  {ticket.expired && ticket.canFulfill ? (
                    <div className="field merma-override-field">
                      <p className="merma-wizard-warn-inline" role="status">
                        El plazo venció. Indica el motivo para seguir.
                      </p>
                      <label htmlFor="override-note">Motivo</label>
                      <input
                        id="override-note"
                        value={overrideNote}
                        onChange={(e) => setOverrideNote(e.target.value)}
                        placeholder="Por qué se atiende fuera de plazo…"
                        maxLength={500}
                      />
                    </div>
                  ) : null}
                  {ticket.canFulfill ? (
                    <>
                      <form className="merma-scan-row" onSubmit={(e) => void onScanGarment(e)}>
                        <label className="sr-only" htmlFor="garment-scan">
                          Código de la prenda del ticket
                        </label>
                        <input
                          id="garment-scan"
                          ref={garmentScanRef}
                          value={garmentCode}
                          onChange={(e) => {
                            setGarmentCode(e.target.value);
                            setGarmentOk(false);
                          }}
                          placeholder="Pistolea el código de barras de la prenda"
                          autoComplete="off"
                        />
                        <button type="submit" className="btn secondary">
                          Confirmar
                        </button>
                      </form>
                      {garmentOk ? (
                        <div className="merma-wizard-body">
                          <ProductFicha
                            name={ticket.product.name}
                            code={displayProductCode(
                              ticket.product.internal_code,
                              ticket.product.barcode,
                            )}
                            meta={[ticket.product.size_label, ticket.product.color]
                              .filter(Boolean)
                              .join(' · ')}
                            photoUrl={ticket.product.photo_url}
                          />
                          <div className="merma-wizard-actions-col">
                            <div
                              className="merma-choice merma-outcome"
                              role="group"
                              aria-label="Tipo de atención"
                            >
                              {VOUCHER_OUTCOMES.map((o) => (
                                <button
                                  key={o.id}
                                  type="button"
                                  className={`merma-choice-btn${outcome === o.id ? ' is-active' : ''}`}
                                  onClick={() => {
                                    setOutcome(o.id);
                                    if (o.id !== 'exchange') {
                                      setNewProduct(null);
                                      setNewCode('');
                                    }
                                  }}
                                >
                                  <strong>{o.label}</strong>
                                </button>
                              ))}
                            </div>
                            {outcome === 'cash_refund' && ticket.sale?.line_total ? (
                              <p className="muted merma-exchange-hint">
                                Monto de la línea: {money(ticket.sale.line_total)}
                              </p>
                            ) : null}
                            {outcome === 'exchange' ? (
                              <>
                                <p className="merma-exchange-hint">
                                  Mismo precio de venta — ideal para cambio de talla.
                                </p>
                                <form
                                  className="merma-scan-row"
                                  onSubmit={(e) => void onScanNewProduct(e)}
                                >
                                  <label className="sr-only" htmlFor="new-scan">
                                    Código de la prenda nueva
                                  </label>
                                  <input
                                    id="new-scan"
                                    ref={newScanRef}
                                    value={newCode}
                                    onChange={(e) => setNewCode(e.target.value)}
                                    placeholder="Pistolea otra prenda al mismo precio"
                                    autoComplete="off"
                                  />
                                  <button
                                    type="submit"
                                    className="btn secondary"
                                    disabled={newLooking}
                                  >
                                    {newLooking ? 'Buscando…' : 'Buscar'}
                                  </button>
                                </form>
                              </>
                            ) : null}
                            {newProduct ? (
                              <ProductFicha
                                name={newProduct.name}
                                code={displayProductCode(
                                  newProduct.internal_code,
                                  newProduct.barcode,
                                )}
                                meta={[newProduct.size_label, newProduct.color]
                                  .filter(Boolean)
                                  .join(' · ')}
                                photoUrl={newProduct.photo_url}
                                stock={Number(newProduct.stock) || 0}
                              />
                            ) : null}
                            <div className="field">
                              <label htmlFor="voucher-dest">Destino de la prenda devuelta</label>
                              <select
                                id="voucher-dest"
                                value={destination}
                                onChange={(e) =>
                                  setDestination((e.target.value || '') as VoucherDest | '')
                                }
                              >
                                <option value="">Elige destino…</option>
                                {VOUCHER_DESTINATIONS.map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="merma-wizard-actions">
                              <button type="button" className="btn ghost" onClick={resetTicketWizard}>
                                Otro ticket
                              </button>
                              <button type="button" className="btn" disabled={saving} onClick={askFulfill}>
                                Registrar
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="muted merma-wizard-hint">
                          La foto aparece al confirmar el código de esa prenda.
                        </p>
                      )}
                    </>
                  ) : null}
                </>
              )}
            </section>
          )}


            </div>
          </div></ModalOverlayClose>
        </PosModal>
      ) : null}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel={confirm?.kind === 'cancel' ? 'Anular' : 'Confirmar'}
        cancelLabel="Volver"
        danger={confirm?.kind === 'merma' || confirm?.kind === 'cancel'}
        onCancel={() => {
          if (!actionBusy) setConfirm(null);
        }}
        onConfirm={() => {
          if (actionBusy) return;
          if (confirm?.kind === 'merma') void doRegisterMerma();
          else if (confirm?.kind === 'fulfill') void doFulfill();
          else if (confirm?.kind === 'cancel') void doCancelVoucher();
        }}
      />
    </div>
  );
}
