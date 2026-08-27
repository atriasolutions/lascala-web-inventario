import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { ProductPhotoInput } from '../components/ProductPhotoInput';
import { ProductFichaFields } from '../components/ProductFichaFields';
import {
  ProductCodeEntry,
  type ProductCodeMode,
} from '../components/ProductCodeEntry';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ModalOverlayClose } from '../components/ModalOverlayClose';
import { IconPencil, IconTrash } from '../components/icons';
import { api, mediaUrl, money } from '../lib/api';
import { useAuth } from '../lib/auth';
import { isLeadRole, canRegisterProductCode, CODE_REGISTER_FORBIDDEN } from '../lib/roles';
import { chileMoneyFromNumber, parseChileMoney } from '../lib/chileMoney';
import { toast } from '../lib/toast';
import { printLabelJob } from '../services/printing';
import { fileToDataUrl } from './compras/purchaseFormTypes';

type ModalMode = 'create' | 'view' | 'edit';

type Product = {
  id: string;
  name: string;
  internal_code: string;
  barcode: string | null;
  brand: string | null;
  size_label: string | null;
  color: string | null;
  product_type: string | null;
  season: string | null;
  description: string | null;
  notes: string | null;
  exclusive_notes: string | null;
  sale_price: string;
  cost_price: string;
  photo_url: string | null;
  has_photo: boolean;
  category_id?: string | null;
  category_name?: string;
  stock?: number | string | null;
  low_stock_threshold?: number | string | null;
  allows_return: boolean;
  allows_exchange: boolean;
  tracks_stock: boolean;
  no_movement_alert_days?: number | string | null;
};

type Category = { id: string; name: string; allows_exchange_default?: boolean };

type FormState = {
  name: string;
  categoryId: string;
  salePrice: string;
  brand: string;
  sizeLabel: string;
  color: string;
  productType: string;
  season: string;
  description: string;
  notes: string;
  exclusiveNotes: string;
  barcode: string;
  photoUrl: string;
  allowsReturn: boolean;
  allowsExchange: boolean;
  tracksStock: boolean;
  lowStockThreshold: string;
  noMovementAlertDays: string;
};

type ReturnFilter = '' | '1' | '0';
type TracksFilter = '' | '1' | '0';

const emptyForm = (): FormState => ({
  name: '',
  categoryId: '',
  salePrice: '',
  brand: '',
  sizeLabel: '',
  color: '',
  productType: '',
  season: '',
  description: '',
  notes: '',
  exclusiveNotes: '',
  barcode: '',
  photoUrl: '',
  allowsReturn: true,
  allowsExchange: true,
  tracksStock: true,
  lowStockThreshold: '1',
  noMovementAlertDays: '',
});

function isLowStock(p: Product) {
  if (!p.tracks_stock) return false;
  if (p.stock == null || p.stock === '') return false;
  const qty = Number(p.stock);
  if (!Number.isFinite(qty)) return false;
  const threshold = Number(p.low_stock_threshold ?? 1);
  return qty <= (Number.isFinite(threshold) ? threshold : 1);
}

function buildProductsQuery(opts: {
  q: string;
  categoryId: string;
  lowStock: boolean;
  pendingPhoto: boolean;
  allowsReturn: ReturnFilter;
  tracksStock: TracksFilter;
}) {
  const params = new URLSearchParams();
  if (opts.q.trim()) params.set('q', opts.q.trim());
  if (opts.categoryId) params.set('categoryId', opts.categoryId);
  if (opts.lowStock) params.set('lowStock', '1');
  if (opts.pendingPhoto) params.set('pendingPhoto', '1');
  if (opts.allowsReturn) params.set('allowsReturn', opts.allowsReturn);
  if (opts.tracksStock) params.set('tracksStock', opts.tracksStock);
  const qs = params.toString();
  return qs ? `/api/products?${qs}` : '/api/products';
}

function yesNo(v: boolean) {
  return v ? 'Sí' : 'No';
}

/** Línea inequívoca para cards (nunca “Cambio y devolución” ambiguo). */
function PolicyLine({
  allowsExchange,
  allowsReturn,
  className = '',
}: {
  allowsExchange: boolean;
  allowsReturn: boolean;
  className?: string;
}) {
  return (
    <div className={`prod-policy-line ${className}`.trim()}>
      <span>
        Cambio: <strong>{yesNo(allowsExchange)}</strong>
      </span>
      <span className="prod-policy-sep" aria-hidden>
        ·
      </span>
      <span>
        Devolución: <strong>{yesNo(allowsReturn)}</strong>
      </span>
    </div>
  );
}

function YesNoToggle({
  label,
  value,
  onChange,
  id,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
  id: string;
}) {
  return (
    <div className="prod-yn" role="group" aria-labelledby={id}>
      <span className="prod-yn-label" id={id}>
        {label}
      </span>
      <div className="prod-yn-opts">
        <button
          type="button"
          className={`prod-yn-btn${value ? ' is-active' : ''}`}
          aria-pressed={value}
          onClick={() => onChange(true)}
        >
          Sí
        </button>
        <button
          type="button"
          className={`prod-yn-btn${!value ? ' is-active' : ''}`}
          aria-pressed={!value}
          onClick={() => onChange(false)}
        >
          No
        </button>
      </div>
    </div>
  );
}

/** Thumb de grilla: mediaUrl + fallback sin <img> roto. */
function ProductCardMedia({
  photoUrl,
  name,
  badges,
}: {
  photoUrl: string | null;
  name: string;
  badges: ReactNode;
}) {
  const resolved = mediaUrl(photoUrl);
  const [failed, setFailed] = useState(false);
  const showImg = Boolean(resolved) && !failed;

  useEffect(() => {
    setFailed(false);
  }, [resolved]);

  return (
    <div className="prod-card-media">
      {showImg ? (
        <img
          key={resolved}
          src={resolved}
          alt={name}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <ProductPhotoPlaceholder className="prod-card-placeholder" />
      )}
      <div className="prod-card-badges">{badges}</div>
    </div>
  );
}

export function ProductsPage() {
  const { branchId, branches } = useAuth();
  const role = branches.find((b) => b.id === branchId)?.role || '';
  const canEditSalePrice = isLeadRole(role);
  const canCreateProduct = canRegisterProductCode(role);
  const canArchiveProduct = isLeadRole(role);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState(false);
  const [allowsReturn, setAllowsReturn] = useState<ReturnFilter>('');
  const [tracksStockFilter, setTracksStockFilter] = useState<TracksFilter>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [formSnapshot, setFormSnapshot] = useState<FormState | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [codeMode, setCodeMode] = useState<ProductCodeMode>('auto');
  const [codeGenerating, setCodeGenerating] = useState(false);
  const [codeAvailability, setCodeAvailability] = useState<
    'idle' | 'checking' | 'ok' | 'taken' | 'error'
  >('idle');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [modalPhotoFailed, setModalPhotoFailed] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftCategoryId, setDraftCategoryId] = useState('');
  const [draftLowStock, setDraftLowStock] = useState(false);
  const [draftPendingPhoto, setDraftPendingPhoto] = useState(false);
  const [draftAllowsReturn, setDraftAllowsReturn] = useState<ReturnFilter>('');
  const [draftTracksStock, setDraftTracksStock] = useState<TracksFilter>('');
  const [labelQtyOpen, setLabelQtyOpen] = useState(false);
  const [labelCopies, setLabelCopies] = useState('1');
  const [labelQtyError, setLabelQtyError] = useState('');
  const [printBusy, setPrintBusy] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [priceAudit, setPriceAudit] = useState<{
    salePriceHistory: Array<{
      at: string;
      from: number;
      to: number;
      userName: string;
    }>;
    purchaseCosts: Array<{
      unit_cost: string;
      purchased_at: string | null;
      invoice_number: string | null;
      quantity: string;
    }>;
  } | null>(null);
  const [priceAuditLoading, setPriceAuditLoading] = useState(false);

  const modalTitleId = useId();
  const filtersTitleId = useId();
  const labelQtyTitleId = useId();
  const labelCopiesRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const filtersPanelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const blobRef = useRef<string | null>(null);

  const sheetFilterCount =
    (categoryId ? 1 : 0) +
    (lowStock ? 1 : 0) +
    (pendingPhoto ? 1 : 0) +
    (allowsReturn ? 1 : 0) +
    (tracksStockFilter ? 1 : 0);

  const filtersActive = Boolean(qDebounced || sheetFilterCount > 0);

  const filterSummary: { key: string; label: string }[] = [];
  if (categoryId) {
    const catName = categories.find((c) => c.id === categoryId)?.name || 'Categoría';
    filterSummary.push({ key: 'cat', label: catName });
  }
  if (lowStock) filterSummary.push({ key: 'low', label: 'Stock bajo' });
  if (pendingPhoto) filterSummary.push({ key: 'photo', label: 'Sin foto' });
  if (allowsReturn === '0') filterSummary.push({ key: 'ret0', label: 'Devolución: No' });
  if (allowsReturn === '1') filterSummary.push({ key: 'ret1', label: 'Devolución: Sí' });
  if (tracksStockFilter === '1') filterSummary.push({ key: 'tr1', label: 'Con control stock' });
  if (tracksStockFilter === '0') filterSummary.push({ key: 'tr0', label: 'Sin control stock' });

  useEffect(() => {
    const t = window.setTimeout(() => setQDebounced(q), 280);
    return () => window.clearTimeout(t);
  }, [q]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [p, c] = await Promise.all([
        api<{ products: Product[] }>(
          buildProductsQuery({
            q: qDebounced,
            categoryId,
            lowStock,
            pendingPhoto,
            allowsReturn,
            tracksStock: tracksStockFilter,
          }),
        ),
        api<{ categories: Category[] }>('/api/catalog/categories'),
      ]);
      setProducts(p.products);
      setCategories(c.categories);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on filter / sucursal
  }, [qDebounced, categoryId, lowStock, pendingPhoto, allowsReturn, tracksStockFilter, branchId]);

  useEffect(() => {
    if (!modalOpen) return;
    const t = window.setTimeout(() => nameRef.current?.focus(), 40);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestCloseModal();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focus solo al abrir
  }, [modalOpen, editing?.id]);

  useEffect(() => {
    setModalPhotoFailed(false);
  }, [form.photoUrl, photoPreview]);

  useEffect(() => {
    if (!filtersOpen) return;
    const panel = filtersPanelRef.current;
    const t = window.setTimeout(() => {
      panel?.querySelector<HTMLElement>('select, button, input')?.focus();
    }, 40);
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setFiltersOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
    };
  }, [filtersOpen]);

  function openFiltersSheet() {
    setDraftCategoryId(categoryId);
    setDraftLowStock(lowStock);
    setDraftPendingPhoto(pendingPhoto);
    setDraftAllowsReturn(allowsReturn);
    setDraftTracksStock(tracksStockFilter);
    setFiltersOpen(true);
  }

  function applyFiltersSheet() {
    setCategoryId(draftCategoryId);
    setLowStock(draftLowStock);
    setPendingPhoto(draftPendingPhoto);
    setAllowsReturn(draftAllowsReturn);
    setTracksStockFilter(draftTracksStock);
    setFiltersOpen(false);
  }

  function clearSheetDraftAndApply() {
    setDraftCategoryId('');
    setDraftLowStock(false);
    setDraftPendingPhoto(false);
    setDraftAllowsReturn('');
    setDraftTracksStock('');
    setCategoryId('');
    setLowStock(false);
    setPendingPhoto(false);
    setAllowsReturn('');
    setTracksStockFilter('');
    setFiltersOpen(false);
  }

  function revokeBlob() {
    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
      blobRef.current = null;
    }
  }

  function openCreate(trigger?: HTMLElement | null) {
    if (!canCreateProduct) {
      toast.warn(CODE_REGISTER_FORBIDDEN);
      return;
    }
    triggerRef.current = trigger ?? null;
    revokeBlob();
    setEditing(null);
    setModalMode('create');
    setFormSnapshot(null);
    setForm(emptyForm());
    setCodeMode('auto');
    setCodeAvailability('idle');
    setPhotoPreview(null);
    setModalPhotoFailed(false);
    setPhotoBusy(false);
    setFormError('');
    setModalOpen(true);
    void fetchNextCode();
  }

  async function fetchNextCode() {
    setCodeGenerating(true);
    setCodeAvailability('idle');
    try {
      const data = await api<{ nextBarcode: string }>('/api/products/next-barcode');
      const code = (data.nextBarcode || '').trim().toUpperCase();
      patchForm({ barcode: code });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo generar el código');
    } finally {
      setCodeGenerating(false);
    }
  }

  async function checkCreateBarcode() {
    const code = form.barcode.trim();
    if (!code || codeMode !== 'scan') {
      setCodeAvailability('idle');
      return;
    }
    setCodeAvailability('checking');
    try {
      const data = await api<{ available: boolean; barcode: string | null }>(
        `/api/products/barcode-available?code=${encodeURIComponent(code)}`,
      );
      if (data.barcode && data.barcode !== code) {
        patchForm({ barcode: data.barcode });
      }
      setCodeAvailability(data.available ? 'ok' : 'taken');
    } catch {
      setCodeAvailability('error');
    }
  }

  function openView(product: Product, trigger?: HTMLElement | null) {
    triggerRef.current = trigger ?? null;
    revokeBlob();
    setEditing(product);
    setModalMode('view');
    setFormSnapshot(null);
    setForm({
      name: product.name,
      categoryId: product.category_id || '',
      salePrice: chileMoneyFromNumber(product.sale_price),
      brand: product.brand || '',
      sizeLabel: product.size_label || '',
      color: product.color || '',
      productType: product.product_type || '',
      season: product.season || '',
      description: product.description || '',
      notes: product.notes || '',
      exclusiveNotes: product.exclusive_notes || '',
      barcode: product.barcode || product.internal_code || '',
      photoUrl: product.photo_url || '',
      allowsReturn: product.allows_return !== false,
      allowsExchange: product.allows_exchange !== false,
      tracksStock: product.tracks_stock !== false,
      lowStockThreshold: String(Number(product.low_stock_threshold ?? 1) || 1),
      noMovementAlertDays:
        product.no_movement_alert_days != null && product.no_movement_alert_days !== ''
          ? String(Number(product.no_movement_alert_days))
          : '',
    });
    setPhotoPreview(null);
    setModalPhotoFailed(false);
    setPhotoBusy(false);
    setFormError('');
    setPriceAudit(null);
    setModalOpen(true);
    if (isLeadRole(role)) {
      setPriceAuditLoading(true);
      void api<{
        salePriceHistory: Array<{
          at: string;
          from: number;
          to: number;
          userName: string;
        }>;
        purchaseCosts: Array<{
          unit_cost: string;
          purchased_at: string | null;
          invoice_number: string | null;
          quantity: string;
        }>;
      }>(`/api/products/${product.id}/price-history`)
        .then((data) => {
          setPriceAudit({
            salePriceHistory: data.salePriceHistory || [],
            purchaseCosts: data.purchaseCosts || [],
          });
        })
        .catch(() => {
          setPriceAudit(null);
        })
        .finally(() => setPriceAuditLoading(false));
    }
  }

  function enterEditMode() {
    setFormError('');
    setFormSnapshot(form);
    setModalMode('edit');
  }

  function cancelEditMode() {
    if (formSnapshot) setForm(formSnapshot);
    setFormSnapshot(null);
    setFormError('');
    setModalMode('view');
    revokeBlob();
    setPhotoPreview(null);
    setModalPhotoFailed(false);
  }

  function closeModal() {
    setCancelConfirm(false);
    setModalOpen(false);
    setEditing(null);
    setModalMode('create');
    setFormSnapshot(null);
    setArchiveConfirm(false);
    setArchiving(false);
    setForm(emptyForm());
    setFormError('');
    setSaving(false);
    setPhotoBusy(false);
    setLabelQtyOpen(false);
    setLabelQtyError('');
    setPrintBusy(false);
    setLabelCopies('1');
    setPriceAudit(null);
    setPriceAuditLoading(false);
    revokeBlob();
    setPhotoPreview(null);
    setModalPhotoFailed(false);
    const el = triggerRef.current;
    triggerRef.current = null;
    window.setTimeout(() => el?.focus(), 40);
  }

  function isFormDirty() {
    if (modalMode === 'view') return false;
    if (modalMode === 'create') {
      return (
        Boolean(form.name.trim()) ||
        Boolean(form.categoryId) ||
        Boolean(form.salePrice.trim()) ||
        Boolean(form.photoUrl || photoPreview) ||
        Boolean(form.barcode.trim())
      );
    }
    if (modalMode === 'edit' && formSnapshot) {
      return JSON.stringify(form) !== JSON.stringify(formSnapshot);
    }
    return false;
  }

  function requestCloseModal() {
    if (saving || photoBusy || printBusy || archiving) return;
    if (isFormDirty()) {
      setCancelConfirm(true);
      return;
    }
    closeModal();
  }

  async function archiveProduct() {
    if (!editing || !canArchiveProduct) return;
    setArchiving(true);
    setFormError('');
    try {
      await api(`/api/products/${editing.id}`, { method: 'DELETE' });
      toast.success('Prenda eliminada del catálogo');
      setProducts((prev) => prev.filter((p) => p.id !== editing.id));
      setArchiveConfirm(false);
      closeModal();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo eliminar la prenda';
      setFormError(msg);
      toast.error(msg);
      setArchiving(false);
    }
  }

  function clearFilters() {
    setQ('');
    setQDebounced('');
    setCategoryId('');
    setLowStock(false);
    setPendingPhoto(false);
    setAllowsReturn('');
    setTracksStockFilter('');
    setDraftCategoryId('');
    setDraftLowStock(false);
    setDraftPendingPhoto(false);
    setDraftAllowsReturn('');
    setDraftTracksStock('');
  }

  function patchForm(partial: Partial<FormState>) {
    setForm((prev) => {
      const next = { ...prev, ...partial };
      if (partial.categoryId !== undefined && !editing) {
        const cat = categories.find((c) => c.id === partial.categoryId);
        if (cat && cat.allows_exchange_default !== undefined) {
          next.allowsExchange = cat.allows_exchange_default;
          next.allowsReturn = cat.allows_exchange_default;
        }
      }
      return next;
    });
  }

  function openLabelQty() {
    const code = (editing?.internal_code || form.barcode).trim();
    if (!code) {
      toast.warn(
        'No hay código para imprimir. Guarda la prenda primero.',
      );
      return;
    }
    setLabelCopies('1');
    setLabelQtyError('');
    setLabelQtyOpen(true);
    window.setTimeout(() => {
      labelCopiesRef.current?.focus();
      labelCopiesRef.current?.select();
    }, 40);
  }

  function closeLabelQty() {
    if (printBusy) return;
    setLabelQtyOpen(false);
    setLabelQtyError('');
  }

  async function confirmLabelPrint() {
    const code = (editing?.internal_code || form.barcode).trim();
    if (!code) {
      setLabelQtyError('Falta el código de la prenda para la etiqueta.');
      return;
    }
    const raw = Number(labelCopies);
    const n = Math.floor(raw);
    if (!Number.isFinite(raw) || n < 1 || n > 100) {
      setLabelQtyError('Indica un número entre 1 y 100.');
      return;
    }
    const name = form.name.trim() || editing?.name || 'Prenda';
    setLabelQtyError('');
    setPrintBusy(true);
    try {
      const result = await printLabelJob(name, code, n);
      if (result.ok) {
        const via = `código ${code}`;
        toast.success(
          n === 1
            ? `Etiqueta (${via}) enviada a ${result.printer || 'la impresora'}`
            : `${n} etiquetas (${via}) enviadas a ${result.printer || 'la impresora'}`,
        );
        setLabelQtyOpen(false);
        return;
      }
      toast.error(result.reason || 'No se pudieron imprimir las etiquetas');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudieron imprimir las etiquetas');
    } finally {
      setPrintBusy(false);
    }
  }

  async function onPhoto(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFormError('La foto debe ser una imagen');
      return;
    }
    setPhotoBusy(true);
    setFormError('');
    setModalPhotoFailed(false);
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
      patchForm({ photoUrl: data.url });
      // Mantener preview local hasta que el <img> remoto cargue; si falla, blob sigue visible
      const remote = mediaUrl(data.url);
      if (remote) {
        const probe = new Image();
        probe.onload = () => {
          setPhotoPreview(null);
          revokeBlob();
        };
        probe.onerror = () => {
          /* dejamos el blob como preview fiable */
        };
        probe.src = remote;
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo subir la foto');
      setPhotoPreview(null);
      revokeBlob();
    } finally {
      setPhotoBusy(false);
    }
  }

  function clearPhoto() {
    revokeBlob();
    setPhotoPreview(null);
    setModalPhotoFailed(false);
    patchForm({ photoUrl: '' });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (modalMode === 'view') return;
    if (photoBusy) {
      setFormError('Espera a que termine de subir la foto');
      return;
    }
    setFormError('');
    setSaving(true);
    const sale = parseChileMoney(form.salePrice) ?? NaN;
    if (canEditSalePrice && (!Number.isFinite(sale) || sale < 0)) {
      setFormError('Ingresa un precio de venta válido');
      setSaving(false);
      return;
    }
    const photoUrl = form.photoUrl.trim();
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      categoryId: form.categoryId || null,
      brand: form.brand.trim() || null,
      sizeLabel: form.sizeLabel.trim() || null,
      color: form.color.trim() || null,
      productType: form.productType.trim() || null,
      season: form.season.trim() || null,
      description: form.description.trim() || null,
      notes: form.notes.trim() || null,
      exclusiveNotes: form.exclusiveNotes.trim() || null,
      allowsReturn: form.allowsReturn,
      allowsExchange: form.allowsExchange,
      tracksStock: form.tracksStock,
      lowStockThreshold: form.tracksStock
        ? Math.max(0, Math.round(Number(form.lowStockThreshold) || 1))
        : 1,
      noMovementAlertDays: form.tracksStock
        ? form.noMovementAlertDays.trim()
          ? Math.max(1, Math.round(Number(form.noMovementAlertDays)) || 30)
          : null
        : null,
    };
    if (canEditSalePrice) body.salePrice = sale;
    if (editing) {
      const originalPhoto = (editing.photo_url || '').trim();
      if (photoUrl && photoUrl !== originalPhoto) body.photoUrl = photoUrl;
      else if (!photoUrl && originalPhoto) body.photoUrl = null;
    } else if (photoUrl) {
      body.photoUrl = photoUrl;
    }
    if (!editing) {
      const code = form.barcode.trim().toUpperCase();
      if (codeMode === 'scan') {
        if (!code) {
          setFormError('Pistolea o ingresa un código, o elige Autogenerar');
          setSaving(false);
          return;
        }
        if (codeAvailability === 'taken') {
          setFormError('Ese código ya está en uso');
          setSaving(false);
          return;
        }
        body.barcode = code;
        body.codeMode = 'manual';
      } else {
        body.barcode = code || 'auto';
        body.codeMode = 'auto';
      }
    }
    try {
      if (editing) {
        await api(`/api/products/${editing.id}`, { method: 'PATCH', body });
        const local: Product = {
          ...editing,
          name: String(body.name),
          category_id: (body.categoryId as string) || null,
          brand: (body.brand as string | null) ?? null,
          size_label: (body.sizeLabel as string | null) ?? null,
          color: (body.color as string | null) ?? null,
          product_type: (body.productType as string | null) ?? null,
          season: (body.season as string | null) ?? null,
          description: (body.description as string | null) ?? null,
          notes: (body.notes as string | null) ?? null,
          exclusive_notes: (body.exclusiveNotes as string | null) ?? null,
          allows_return: Boolean(body.allowsReturn),
          allows_exchange: Boolean(body.allowsExchange),
          tracks_stock: Boolean(body.tracksStock),
          low_stock_threshold: body.lowStockThreshold as number,
          no_movement_alert_days: body.noMovementAlertDays as number | null,
        };
        if (body.salePrice !== undefined) local.sale_price = String(body.salePrice);
        if (body.photoUrl !== undefined) {
          local.photo_url = (body.photoUrl as string | null) || null;
          local.has_photo = Boolean(body.photoUrl);
        }
        setEditing(local);
        setProducts((prev) => prev.map((p) => (p.id === local.id ? { ...p, ...local } : p)));
        toast.success('Prenda actualizada');
        setFormSnapshot(null);
        setModalMode('view');
        setSaving(false);
        setPhotoPreview(null);
        revokeBlob();
      } else {
        await api('/api/products', { method: 'POST', body });
        toast.success('Prenda creada');
        closeModal();
        await load();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo guardar la prenda';
      setFormError(msg);
      toast.error(msg);
      setSaving(false);
    }
  }

  const noPhotoCount = products.filter((p) => !p.has_photo).length;
  const remotePhoto = form.photoUrl.trim() ? mediaUrl(form.photoUrl.trim()) : '';
  const photoSrc = photoPreview || (!modalPhotoFailed ? remotePhoto : '');
  const lastCost = editing ? Number(editing.cost_price) : 0;
  const showLastCost = editing && Number.isFinite(lastCost) && lastCost > 0;

  return (
    <div className="prod-page">
      <div className="prod-toolbar">
        <div className="field prod-search">
          <label className="sr-only" htmlFor="prod-filter-q">
            Buscar
          </label>
          <input
            id="prod-filter-q"
            type="search"
            placeholder="Nombre o código…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="prod-toolbar-actions">
          <button
            type="button"
            className={`btn secondary prod-filters-btn${sheetFilterCount > 0 ? ' has-count' : ''}`}
            onClick={openFiltersSheet}
            aria-expanded={filtersOpen}
            aria-controls="prod-filters-sheet"
          >
            Filtros
            {sheetFilterCount > 0 ? (
              <span className="prod-filters-badge" aria-label={`${sheetFilterCount} filtros activos`}>
                {sheetFilterCount}
              </span>
            ) : null}
          </button>
          {canCreateProduct ? (
            <button
              type="button"
              className="btn"
              data-help="cta.productos.nueva"
              onClick={(e) => openCreate(e.currentTarget)}
            >
              Nueva prenda
            </button>
          ) : null}
        </div>

        {/* Desktop: atajos visibles; mobile usa el sheet */}
        <div className="prod-filters prod-filters-desktop" role="toolbar" aria-label="Filtros rápidos">
          <div className="field prod-cat-select">
            <label className="sr-only" htmlFor="prod-filter-cat">
              Categoría
            </label>
            <select
              id="prod-filter-cat"
              aria-label="Categoría"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Todas las categorías</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className={`prod-chip${lowStock ? ' is-active' : ''}`}
            aria-pressed={lowStock}
            onClick={() => setLowStock((v) => !v)}
          >
            Stock bajo
          </button>
          <button
            type="button"
            className={`prod-chip${pendingPhoto ? ' is-active' : ''}`}
            aria-pressed={pendingPhoto}
            onClick={() => setPendingPhoto((v) => !v)}
          >
            Sin foto
          </button>
          <button
            type="button"
            className={`prod-chip${allowsReturn === '0' ? ' is-active' : ''}`}
            aria-pressed={allowsReturn === '0'}
            onClick={() => setAllowsReturn((v) => (v === '0' ? '' : '0'))}
          >
            Devolución: No
          </button>
          <button
            type="button"
            className={`prod-chip${allowsReturn === '1' ? ' is-active' : ''}`}
            aria-pressed={allowsReturn === '1'}
            onClick={() => setAllowsReturn((v) => (v === '1' ? '' : '1'))}
          >
            Devolución: Sí
          </button>
          <button
            type="button"
            className={`prod-chip${tracksStockFilter === '1' ? ' is-active' : ''}`}
            aria-pressed={tracksStockFilter === '1'}
            onClick={() => setTracksStockFilter((v) => (v === '1' ? '' : '1'))}
          >
            Con control stock
          </button>
          <button
            type="button"
            className={`prod-chip${tracksStockFilter === '0' ? ' is-active' : ''}`}
            aria-pressed={tracksStockFilter === '0'}
            onClick={() => setTracksStockFilter((v) => (v === '0' ? '' : '0'))}
          >
            Sin control stock
          </button>
        </div>
      </div>

      {sheetFilterCount > 0 && (
        <div className="prod-filter-summary" aria-label="Filtros activos">
          {filterSummary.map((c) => (
            <span key={c.key} className="prod-chip is-active prod-chip-static">
              {c.label}
            </span>
          ))}
          <button type="button" className="btn ghost prod-filter-clear" onClick={clearFilters}>
            Limpiar
          </button>
        </div>
      )}

      {!loading && !error && products.length > 0 && (
        <p className="prod-status muted">
          {products.length} prenda{products.length === 1 ? '' : 's'}
          {noPhotoCount > 0 ? ` · ${noPhotoCount} sin foto` : ''}
        </p>
      )}

      {error && <p className="error">{error}</p>}

      <div className="prod-scroll">
      {loading && (
        <div className="prod-grid prod-skeleton" aria-busy="true" aria-label="Cargando productos">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="prod-skel-card" aria-hidden>
              <div className="prod-skel-media" />
              <div className="prod-skel-line" />
              <div className="prod-skel-line short" />
            </div>
          ))}
        </div>
      )}

      {!loading && !products.length && !filtersActive && (
        <div className="sales-empty">
          <h3>Aún no hay prendas</h3>
          <p className="muted">
            {canCreateProduct
              ? 'Agrega la primera para armar el catálogo.'
              : 'Solo la administración puede dar de alta prendas nuevas.'}
          </p>
          {canCreateProduct ? (
            <button
              type="button"
              className="btn secondary"
              style={{ marginTop: '0.75rem' }}
              onClick={(e) => openCreate(e.currentTarget)}
            >
              Nueva prenda
            </button>
          ) : null}
        </div>
      )}

      {!loading && !products.length && filtersActive && (
        <div className="sales-empty">
          <h3>Ninguna prenda coincide</h3>
          <p className="muted">Prueba otra búsqueda o quita filtros.</p>
          <button
            type="button"
            className="btn secondary"
            style={{ marginTop: '0.75rem' }}
            onClick={clearFilters}
          >
            Limpiar filtros
          </button>
        </div>
      )}

      {!loading && products.length > 0 && (
        <div className="prod-grid">
          {products.map((p) => {
            const low = isLowStock(p);
            const outOfStock = low && Number(p.stock) === 0;
            return (
              <button
                key={p.id}
                type="button"
                className="prod-card"
                onClick={(e) => openView(p, e.currentTarget)}
              >
                <ProductCardMedia
                  photoUrl={p.photo_url}
                  name={p.name}
                  badges={
                    low ? (
                      <span className={`badge ${outOfStock ? 'danger' : 'warning'}`}>
                        {outOfStock ? 'Sin stock' : 'Stock bajo'}
                      </span>
                    ) : null
                  }
                />
                <div className="prod-card-body">
                  <strong className="prod-card-name" title={p.name}>{p.name}</strong>
                  <div className="prod-card-meta">
                    {p.barcode && p.internal_code && p.barcode !== p.internal_code
                      ? `${p.barcode} · ${p.internal_code}`
                      : p.barcode || p.internal_code}
                    {p.brand ? ` · ${p.brand}` : ''}
                    {p.size_label ? ` · ${p.size_label}` : ''}
                    {p.product_type ? ` · ${p.product_type}` : ''}
                  </div>
                  <PolicyLine
                    className="prod-card-policy"
                    allowsExchange={p.allows_exchange !== false}
                    allowsReturn={p.allows_return !== false}
                  />
                  <div className="prod-card-price">{money(p.sale_price)}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      </div>

      {modalOpen && (
        <div
          className="pos-modal open"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !labelQtyOpen) requestCloseModal();
          }}
        >
          <ModalOverlayClose onClose={requestCloseModal}>
          <div className="ing-line-modal-shell prod-modal-shell">
          <form
            className="pos-modal-panel ing-line-modal prod-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={modalTitleId}
            onClick={(e) => e.stopPropagation()}
            onSubmit={onSubmit}
          >
            <div className="pos-modal-head">
              <h3 id={modalTitleId}>
                {modalMode === 'create' ? 'Nueva prenda' : 'Ficha de prenda'}
              </h3>
            </div>

            <div className="prod-modal-body">
              <div className="prod-modal-photo">
                {photoSrc ? (
                  <img
                    key={photoSrc}
                    src={photoSrc}
                    alt=""
                    onError={() => {
                      if (photoPreview) return;
                      setModalPhotoFailed(true);
                    }}
                  />
                ) : (
                  <ProductPhotoPlaceholder className="prod-modal-photo-empty" />
                )}
                {modalMode === 'view' ? (
                  <div className="prod-modal-photo-actions">
                    <button
                      type="button"
                      className="prod-ficha-pencil"
                      aria-label="Editar foto"
                      onClick={enterEditMode}
                    >
                      <IconPencil size={15} />
                      <span>Foto</span>
                    </button>
                  </div>
                ) : (
                  <div className="prod-modal-photo-actions">
                    <ProductPhotoInput
                      hasPhoto={Boolean(photoSrc)}
                      busy={photoBusy}
                      disabled={saving}
                      onPick={(file) => void onPhoto(file)}
                    />
                    {photoSrc ? (
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={photoBusy || saving}
                        onClick={clearPhoto}
                      >
                        Quitar
                      </button>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="prod-modal-fields">
                <ProductFichaFields
                  idPrefix="prod-modal"
                  mode={modalMode === 'view' ? 'view' : 'edit'}
                  onEnterEdit={modalMode === 'view' ? enterEditMode : undefined}
                  canEditField={(key) => (key === 'salePrice' ? canEditSalePrice : true)}
                  values={{
                    name: form.name,
                    categoryId: form.categoryId,
                    brand: form.brand,
                    productType: form.productType,
                    sizeLabel: form.sizeLabel,
                    color: form.color,
                    season: form.season,
                    description: form.description,
                  }}
                  onChange={patchForm}
                  categories={categories}
                  disabled={saving || photoBusy}
                  nameRef={nameRef}
                  code={
                    editing
                      ? { locked: true, value: editing.internal_code || form.barcode }
                      : {
                          locked: false,
                          value: form.barcode,
                          onChange: (barcode) => {
                            patchForm({ barcode });
                            setCodeAvailability('idle');
                          },
                          helper: '',
                          slot: (
                            <ProductCodeEntry
                              id="prod-modal-code"
                              value={form.barcode}
                              mode={codeMode}
                              onModeChange={(m) => {
                                setCodeMode(m);
                                setCodeAvailability('idle');
                                if (m === 'scan') patchForm({ barcode: '' });
                              }}
                              onChange={(barcode) => {
                                patchForm({ barcode });
                                setCodeAvailability('idle');
                              }}
                              onAutogenerate={fetchNextCode}
                              disabled={saving || photoBusy}
                              generating={codeGenerating}
                              availability={codeAvailability}
                              onBlurCheck={() => void checkCreateBarcode()}
                            />
                          ),
                        }
                  }
                  costPrice={showLastCost ? lastCost : null}
                  salePrice={
                    canEditSalePrice
                      ? {
                          mode: 'edit',
                          value: form.salePrice,
                          onChange: (salePrice) => patchForm({ salePrice }),
                        }
                      : {
                          mode: 'locked',
                          display: (() => {
                            const n = parseChileMoney(form.salePrice);
                            return n != null ? money(n) : '—';
                          })(),
                          amount: parseChileMoney(form.salePrice) ?? undefined,
                          hint: 'El precio de venta lo define Administrador/a o Encargado/a.',
                        }
                  }
                  extraAfterIdentity={
                    <>
                      {showLastCost ? (
                        <p className="ing-hint prod-cost-hint">
                          Último Precio costo (desde ingreso): {money(lastCost)}. Se define al
                          ingresar mercadería, no en el catálogo.
                        </p>
                      ) : (
                        <p className="ing-hint prod-cost-hint">
                          El Precio costo se registra en Ingresos, no en la ficha del catálogo.
                        </p>
                      )}
                      {editing && isLeadRole(role) ? (
                        <div className="prod-price-audit">
                          {priceAuditLoading ? (
                            <p className="muted">Cargando historial de precios…</p>
                          ) : null}
                          {priceAudit?.purchaseCosts?.length ? (
                            <div className="prod-price-audit-block">
                              <h4 className="prod-section-title" style={{ fontSize: '0.85rem' }}>
                                Precio costo en compras
                              </h4>
                              <ul className="prod-price-audit-list">
                                {priceAudit.purchaseCosts.slice(0, 5).map((row, i) => (
                                  <li key={`${row.purchased_at}-${i}`}>
                                    <strong>{money(row.unit_cost)}</strong>
                                    <span className="muted">
                                      {row.purchased_at
                                        ? new Date(row.purchased_at).toLocaleDateString('es-CL', {
                                            day: '2-digit',
                                            month: 'short',
                                            year: 'numeric',
                                          })
                                        : 'Sin fecha'}
                                      {row.invoice_number ? ` · Doc. ${row.invoice_number}` : ''}
                                      {row.quantity ? ` · ${row.quantity} un.` : ''}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {priceAudit?.salePriceHistory?.length ? (
                            <div className="prod-price-audit-block">
                              <h4 className="prod-section-title" style={{ fontSize: '0.85rem' }}>
                                Historial precio de venta
                              </h4>
                              <ul className="prod-price-audit-list">
                                {priceAudit.salePriceHistory.slice(0, 8).map((row, i) => (
                                  <li key={`${row.at}-${i}`}>
                                    <strong>
                                      {money(row.from)} → {money(row.to)}
                                    </strong>
                                    <span className="muted">
                                      {new Date(row.at).toLocaleString('es-CL', {
                                        day: '2-digit',
                                        month: 'short',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                      {row.userName ? ` · ${row.userName}` : ''}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : editing && !priceAuditLoading ? (
                            <p className="ing-hint">
                              Aún no hay cambios de precio de venta registrados en esta ficha.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  }
                  extraAfterCode={
                    editing ? (
                      <button
                        type="button"
                        className="btn prod-print-labels-btn"
                        onClick={openLabelQty}
                        disabled={saving || photoBusy || printBusy}
                      >
                        Imprimir etiquetas
                      </button>
                    ) : null
                  }
                />

                <section className="prod-section">
                  <div className="prod-ficha-label-row">
                    <h4 className="prod-section-title" style={{ border: 'none', padding: 0 }}>
                      Políticas
                    </h4>
                    {modalMode === 'view' ? (
                      <button
                        type="button"
                        className="prod-ficha-pencil"
                        aria-label="Editar políticas"
                        onClick={enterEditMode}
                      >
                        <IconPencil size={15} />
                      </button>
                    ) : null}
                  </div>
                  {modalMode === 'view' ? (
                    <p className="prod-ficha-value">
                      Cambio: {form.allowsExchange ? 'Sí' : 'No'} · Devolución:{' '}
                      {form.allowsReturn ? 'Sí' : 'No'}
                    </p>
                  ) : (
                    <div className="prod-yn-stack">
                      <YesNoToggle
                        id="prod-yn-exchange"
                        label="Cambio"
                        value={form.allowsExchange}
                        onChange={(v) => patchForm({ allowsExchange: v })}
                      />
                      <YesNoToggle
                        id="prod-yn-return"
                        label="Devolución"
                        value={form.allowsReturn}
                        onChange={(v) => patchForm({ allowsReturn: v })}
                      />
                    </div>
                  )}
                </section>

                <section className="prod-section">
                  <div className="prod-ficha-label-row">
                    <h4 className="prod-section-title" style={{ border: 'none', padding: 0 }}>
                      Inventario
                    </h4>
                    {modalMode === 'view' ? (
                      <button
                        type="button"
                        className="prod-ficha-pencil"
                        aria-label="Editar inventario"
                        onClick={enterEditMode}
                      >
                        <IconPencil size={15} />
                      </button>
                    ) : null}
                  </div>
                  {modalMode === 'view' ? (
                    <p className="prod-ficha-value">
                      {form.tracksStock
                        ? `Con control · mín. ${form.lowStockThreshold || '1'}${
                            form.noMovementAlertDays.trim()
                              ? ` · alerta ${form.noMovementAlertDays} días`
                              : ''
                          }`
                        : 'Sin control de stock'}
                    </p>
                  ) : (
                    <>
                      <YesNoToggle
                        id="prod-yn-tracks"
                        label="Control de stock"
                        value={form.tracksStock}
                        onChange={(v) => patchForm({ tracksStock: v })}
                      />
                      {form.tracksStock && (
                        <div className="prod-section-grid prod-stock-fields">
                          <div className="field">
                            <label htmlFor="prod-modal-low">Stock mínimo</label>
                            <input
                              id="prod-modal-low"
                              type="number"
                              min={0}
                              step={1}
                              inputMode="numeric"
                              value={form.lowStockThreshold}
                              onChange={(e) => patchForm({ lowStockThreshold: e.target.value })}
                            />
                          </div>
                          <div className="field">
                            <label htmlFor="prod-modal-nomov">Alerta sin mov. (días)</label>
                            <input
                              id="prod-modal-nomov"
                              type="number"
                              min={1}
                              step={1}
                              inputMode="numeric"
                              value={form.noMovementAlertDays}
                              onChange={(e) => patchForm({ noMovementAlertDays: e.target.value })}
                              placeholder="Org. default"
                            />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </section>

                <section className="prod-section">
                  <div className="prod-ficha-label-row">
                    <h4 className="prod-section-title" style={{ border: 'none', padding: 0 }}>
                      Notas
                    </h4>
                    {modalMode === 'view' ? (
                      <button
                        type="button"
                        className="prod-ficha-pencil"
                        aria-label="Editar notas"
                        onClick={enterEditMode}
                      >
                        <IconPencil size={15} />
                      </button>
                    ) : null}
                  </div>
                  {modalMode === 'view' ? (
                    <div className="prod-ficha-value prod-ficha-notes-view">
                      <p>
                        <span className="muted">Notas · </span>
                        {form.notes.trim() || '—'}
                      </p>
                      <p>
                        <span className="muted">Exclusivas · </span>
                        {form.exclusiveNotes.trim() || '—'}
                      </p>
                    </div>
                  ) : (
                    <div className="prod-section-grid">
                      <div className="field prod-span-2">
                        <label htmlFor="prod-modal-notes">Notas</label>
                        <textarea
                          id="prod-modal-notes"
                          rows={2}
                          value={form.notes}
                          onChange={(e) => patchForm({ notes: e.target.value })}
                        />
                      </div>
                      <div className="field prod-span-2">
                        <label htmlFor="prod-modal-excl">Notas exclusivas</label>
                        <textarea
                          id="prod-modal-excl"
                          rows={2}
                          value={form.exclusiveNotes}
                          onChange={(e) => patchForm({ exclusiveNotes: e.target.value })}
                          placeholder="Solo para equipo interno"
                        />
                      </div>
                    </div>
                  )}
                </section>
              </div>
            </div>

            {formError && <p className="error">{formError}</p>}

            <div className="btn-row ing-line-modal-actions prod-modal-actions">
              {modalMode === 'create' ? (
                <>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={requestCloseModal}
                    disabled={saving || printBusy}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="btn" disabled={saving || photoBusy || printBusy}>
                    {saving ? 'Guardando…' : 'Agregar'}
                  </button>
                </>
              ) : modalMode === 'edit' ? (
                <>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={cancelEditMode}
                    disabled={saving || photoBusy || printBusy}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="btn" disabled={saving || photoBusy || printBusy}>
                    {saving ? 'Guardando…' : 'Guardar'}
                  </button>
                </>
              ) : (
                <>
                  {canArchiveProduct ? (
                    <button
                      type="button"
                      className="btn ghost prod-archive-btn"
                      onClick={() => setArchiveConfirm(true)}
                      disabled={printBusy || archiving}
                    >
                      <IconTrash size={15} />
                      Eliminar
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={requestCloseModal}
                    disabled={printBusy || archiving}
                  >
                    Cerrar
                  </button>
                </>
              )}
            </div>
          </form>
          </div></ModalOverlayClose>
        </div>
      )}

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
          closeModal();
        }}
      />

      <ConfirmDialog
        open={archiveConfirm}
        title="Eliminar prenda"
        message="La prenda dejará de verse en el catálogo, inventario y búsquedas. El historial de ventas e ingresos se conserva. Esta acción no borra el registro del sistema."
        confirmLabel={archiving ? 'Eliminando…' : 'Eliminar del catálogo'}
        cancelLabel="Cancelar"
        danger
        onCancel={() => !archiving && setArchiveConfirm(false)}
        onConfirm={() => void archiveProduct()}
      />

      {labelQtyOpen && (
        <div
          className="pos-modal open confirm-dialog no-print"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeLabelQty();
          }}
        >
          <ModalOverlayClose onClose={closeLabelQty} disabled={printBusy}>
          <div
            className="pos-modal-panel confirm-dialog-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelQtyTitleId}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pos-modal-head">
              <h3 id={labelQtyTitleId}>Imprimir etiquetas</h3>
            </div>
            <p className="confirm-dialog-message">
              ¿Cuántas etiquetas quieres imprimir? (máximo 100)
            </p>
            <div className="field">
              <label htmlFor="prod-label-copies">Cantidad</label>
              <input
                id="prod-label-copies"
                ref={labelCopiesRef}
                type="number"
                min={1}
                max={100}
                step={1}
                inputMode="numeric"
                value={labelCopies}
                disabled={printBusy}
                onChange={(e) => {
                  setLabelCopies(e.target.value);
                  setLabelQtyError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void confirmLabelPrint();
                  }
                }}
              />
            </div>
            {labelQtyError ? <p className="error">{labelQtyError}</p> : null}
            <div className="btn-row confirm-dialog-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={closeLabelQty}
                disabled={printBusy}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => void confirmLabelPrint()}
                disabled={printBusy}
              >
                {printBusy ? 'Imprimiendo…' : 'Imprimir'}
              </button>
            </div>
          </div></ModalOverlayClose>
        </div>
      )}

      {filtersOpen && (
        <div
          className="pos-modal open"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setFiltersOpen(false);
          }}
        >
          <ModalOverlayClose onClose={() => setFiltersOpen(false)}>
          <div
            id="prod-filters-sheet"
            className="pos-modal-panel prod-filters-sheet"
            ref={filtersPanelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={filtersTitleId}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pos-modal-head">
              <h3 id={filtersTitleId}>Filtros</h3>
            </div>

            <div className="prod-filter-fields">
              <div className="field">
                <label htmlFor="prod-sheet-cat">Categoría</label>
                <select
                  id="prod-sheet-cat"
                  value={draftCategoryId}
                  onChange={(e) => setDraftCategoryId(e.target.value)}
                >
                  <option value="">Todas las categorías</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="prod-filter-group">
                <p className="prod-filter-group-label">Catálogo</p>
                <div className="prod-toggle-row">
                  <button
                    type="button"
                    className={`prod-chip${draftLowStock ? ' is-active' : ''}`}
                    aria-pressed={draftLowStock}
                    onClick={() => setDraftLowStock((v) => !v)}
                  >
                    Stock bajo
                  </button>
                  <button
                    type="button"
                    className={`prod-chip${draftPendingPhoto ? ' is-active' : ''}`}
                    aria-pressed={draftPendingPhoto}
                    onClick={() => setDraftPendingPhoto((v) => !v)}
                  >
                    Sin foto
                  </button>
                </div>
              </div>

              <div className="prod-filter-group">
                <p className="prod-filter-group-label">Devolución</p>
                <div className="prod-yn-opts prod-yn-opts-wide" role="group" aria-label="Filtro devolución">
                  <button
                    type="button"
                    className={`prod-yn-btn${draftAllowsReturn === '' ? ' is-active' : ''}`}
                    aria-pressed={draftAllowsReturn === ''}
                    onClick={() => setDraftAllowsReturn('')}
                  >
                    Todas
                  </button>
                  <button
                    type="button"
                    className={`prod-yn-btn${draftAllowsReturn === '1' ? ' is-active' : ''}`}
                    aria-pressed={draftAllowsReturn === '1'}
                    onClick={() => setDraftAllowsReturn('1')}
                  >
                    Sí
                  </button>
                  <button
                    type="button"
                    className={`prod-yn-btn${draftAllowsReturn === '0' ? ' is-active' : ''}`}
                    aria-pressed={draftAllowsReturn === '0'}
                    onClick={() => setDraftAllowsReturn('0')}
                  >
                    No
                  </button>
                </div>
              </div>

              <div className="prod-filter-group">
                <p className="prod-filter-group-label">Control de stock</p>
                <div className="prod-yn-opts prod-yn-opts-wide" role="group" aria-label="Filtro control stock">
                  <button
                    type="button"
                    className={`prod-yn-btn${draftTracksStock === '' ? ' is-active' : ''}`}
                    aria-pressed={draftTracksStock === ''}
                    onClick={() => setDraftTracksStock('')}
                  >
                    Todas
                  </button>
                  <button
                    type="button"
                    className={`prod-yn-btn${draftTracksStock === '1' ? ' is-active' : ''}`}
                    aria-pressed={draftTracksStock === '1'}
                    onClick={() => setDraftTracksStock('1')}
                  >
                    Con control
                  </button>
                  <button
                    type="button"
                    className={`prod-yn-btn${draftTracksStock === '0' ? ' is-active' : ''}`}
                    aria-pressed={draftTracksStock === '0'}
                    onClick={() => setDraftTracksStock('0')}
                  >
                    Sin control
                  </button>
                </div>
              </div>
            </div>

            <div className="btn-row prod-filters-sheet-actions">
              <button type="button" className="btn secondary" onClick={clearSheetDraftAndApply}>
                Limpiar
              </button>
              <button type="button" className="btn" onClick={applyFiltersSheet}>
                Aplicar
              </button>
            </div>
          </div>
          </ModalOverlayClose>
        </div>
      )}
    </div>
  );
}
