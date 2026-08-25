import {
  type FormEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { NoBarcodeModal } from '../../components/NoBarcodeModal';
import { ModalOverlayClose } from '../../components/ModalOverlayClose';
import { PrintReminderModal } from '../../components/PrintReminderModal';
import { ProductPhotoPlaceholder } from '../../components/ProductPhotoPlaceholder';
import { useShellTitle } from '../../components/shellTitle';
import { ThermalBarcode } from '../../components/ThermalBarcode';
import { api, mediaUrl, money } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { canRegisterProductCode, CODE_REGISTER_FORBIDDEN } from '../../lib/roles';
import { useToast } from '../../lib/toast';
import { printLabelJob } from '../../services/printing';
import {
  lineFloorSalePrice,
  purchaseRef,
  statusBadgeClass,
  statusLabel,
  type Purchase,
  type PurchaseItem,
} from '../../lib/purchasesStatus';

type LineDraft = PurchaseItem & {
  draftReceived: number;
};

type ProductHit = {
  id: string;
  name: string;
  barcode: string | null;
  internal_code: string;
  cost_price: string;
  sale_price: string;
  photo_url?: string | null;
  size_label?: string | null;
  color?: string | null;
};

type StageItem = {
  name: string;
  photo_url?: string | null;
  size_label?: string | null;
  color?: string | null;
  qty: number;
  ordered: number;
};

type LinkModal =
  | { kind: 'create'; barcode: string }
  | { kind: 'link'; barcode: string; product: ProductHit };

type CategoryOption = { id: string; name: string };

function lineDisplayName(line: PurchaseItem) {
  return line.product_name?.trim() || line.description;
}

function LineThumb({
  name,
  photoUrl,
  className,
  onExpand,
}: {
  name: string;
  photoUrl?: string | null;
  className: string;
  onExpand?: (photoUrl: string, name: string) => void;
}) {
  if (photoUrl) {
    const expandable = Boolean(onExpand);
    return (
      <div
        className={`${className}${expandable ? ' is-expandable' : ''}`}
        role={expandable ? 'button' : undefined}
        tabIndex={expandable ? 0 : undefined}
        aria-label={expandable ? `Ver foto de ${name}` : undefined}
        onClick={expandable ? () => onExpand?.(photoUrl, name) : undefined}
        onKeyDown={
          expandable
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onExpand?.(photoUrl, name);
                }
              }
            : undefined
        }
      >
        <img src={mediaUrl(photoUrl)} alt={name} />
        {expandable ? <span className="ing-photo-expand" aria-hidden>Ampliar</span> : null}
      </div>
    );
  }
  return (
    <div className={`${className} is-empty`} aria-hidden>
      <ProductPhotoPlaceholder />
    </div>
  );
}

export function IngresoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const setShellTitle = useShellTitle();
  const { branches, branchId } = useAuth();
  const role = branches.find((b) => b.id === branchId)?.role || '';
  const canCreateProduct = canRegisterProductCode(role);
  const scanRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const createTitleId = useId();
  const noBarcodeTitleId = useId();

  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [liveMsg, setLiveMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState('');
  const [modal, setModal] = useState<LinkModal | null>(null);
  const [stage, setStage] = useState<StageItem | null>(null);
  const [stagePulse, setStagePulse] = useState(false);
  const [noBarcodeOpen, setNoBarcodeOpen] = useState(false);
  const [suggestedBarcode, setSuggestedBarcode] = useState('LS000001');
  const [noBarcodeBusy, setNoBarcodeBusy] = useState(false);
  const [printLabel, setPrintLabel] = useState<{ name: string; code: string; copies: number } | null>(
    null,
  );
  const [labelReminderOpen, setLabelReminderOpen] = useState(false);
  const [pendingLabel, setPendingLabel] = useState<{
    name: string;
    code: string;
    copies: number;
  } | null>(null);
  const [photoPreview, setPhotoPreview] = useState<{ url: string; name: string } | null>(null);

  // Modal form (crear/vincular por escáner)
  const [pickLineId, setPickLineId] = useState('');
  const [newName, setNewName] = useState('');
  const [receiveQty, setReceiveQty] = useState(1);
  const [labelCopies, setLabelCopies] = useState(1);
  const [modalError, setModalError] = useState('');
  const [printBusy, setPrintBusy] = useState(false);

  const focusScan = useCallback(() => {
    requestAnimationFrame(() => scanRef.current?.focus());
  }, []);

  const openPhotoPreview = useCallback((photoUrl: string, name: string) => {
    setPhotoPreview({ url: photoUrl, name });
  }, []);

  const closePhotoPreview = useCallback(() => {
    setPhotoPreview(null);
    focusScan();
  }, [focusScan]);

  const load = useCallback(async () => {
    if (!id) return;
    const data = await api<{ purchase: Purchase; items: PurchaseItem[] }>(`/api/purchases/${id}`);
    setPurchase(data.purchase);
    setLines(
      data.items.map((i) => ({
        ...i,
        draftReceived: Number(i.quantity_received),
      })),
    );
  }, [id]);

  useEffect(() => {
    if (!purchase) {
      setShellTitle(null);
      return;
    }
    setShellTitle(purchaseRef(purchase));
    return () => setShellTitle(null);
  }, [purchase, setShellTitle]);

  useEffect(() => {
    let cancelled = false;
    void api<{ categories: CategoryOption[] }>('/api/catalog/categories')
      .then((data) => {
        if (!cancelled) setCategories(data.categories || []);
      })
      .catch(() => {
        /* opcional en recepción */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load()
      .then(() => {
        if (!cancelled) setError('');
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          focusScan();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [load, focusScan]);

  useEffect(() => {
    if (!stagePulse) return;
    const t = window.setTimeout(() => setStagePulse(false), 220);
    return () => window.clearTimeout(t);
  }, [stagePulse]);

  useEffect(() => {
    if (!printLabel) return;
    const t = window.setTimeout(() => {
      window.print();
      setPrintLabel(null);
    }, 100);
    return () => window.clearTimeout(t);
  }, [printLabel]);

  async function requestLabelPrint(name: string, code: string, copies = 1) {
    if (printBusy) return;
    const n = Math.max(1, Math.min(999, Math.floor(Number(copies) || 1)));
    const label = { name, code, copies: n };
    setPrintBusy(true);
    try {
      const result = await printLabelJob(name, code, n);
      if (result.ok) {
        toast.success(
          n === 1
            ? `Etiqueta enviada a ${result.printer}`
            : `${n} etiquetas enviadas a ${result.printer}`,
        );
        return;
      }
      if (
        result.reason &&
        !result.reason.includes('deshabilitado') &&
        !result.reason.includes('Preferencia')
      ) {
        toast.warn(`${result.reason} · Se abrirá el diálogo del navegador`);
      }
      setPendingLabel(label);
      setLabelReminderOpen(true);
    } finally {
      setPrintBusy(false);
    }
  }

  function confirmLabelPrint() {
    if (!pendingLabel) return;
    setLabelReminderOpen(false);
    setPrintLabel(pendingLabel);
    setPendingLabel(null);
  }

  function cancelLabelPrint() {
    setLabelReminderOpen(false);
    setPendingLabel(null);
  }

  const pendingLines = useMemo(
    () => lines.filter((l) => l.draftReceived < Number(l.quantity_ordered)),
    [lines],
  );

  const unlinkedPending = useMemo(
    () => pendingLines.filter((l) => !l.product_id),
    [pendingLines],
  );

  const canReceive = useMemo(() => {
    if (!purchase || purchase.status === 'received' || purchase.status === 'cancelled') return false;
    return lines.some(
      (l) =>
        Boolean(l.product_id) &&
        l.draftReceived !== Number(l.quantity_received) &&
        l.draftReceived >= Number(l.quantity_received) &&
        l.draftReceived <= Number(l.quantity_ordered),
    );
  }, [lines, purchase]);

  const receivedSummary = useMemo(() => {
    const ordered = lines.reduce((s, l) => s + Number(l.quantity_ordered), 0);
    const received = lines.reduce((s, l) => s + l.draftReceived, 0);
    return { ordered, received };
  }, [lines]);

  function pulseStage(next: StageItem) {
    setStage(next);
    setStagePulse(true);
  }

  function bumpLine(lineId: string, delta: number) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l;
        const next = Math.max(
          Number(l.quantity_received),
          Math.min(Number(l.quantity_ordered), l.draftReceived + delta),
        );
        return { ...l, draftReceived: next };
      }),
    );
  }

  function openCreateModal(barcode: string) {
    const first = unlinkedPending[0];
    const pend = first
      ? Math.max(1, Number(first.quantity_ordered) - first.draftReceived)
      : 1;
    setPickLineId(first?.id || '');
    setNewName(first?.description || '');
    setReceiveQty(pend);
    setLabelCopies(pend);
    setModalError('');
    setModal({ kind: 'create', barcode });
  }

  function openLinkModal(barcode: string, product: ProductHit) {
    const first = unlinkedPending[0];
    const pend = first
      ? Math.max(1, Number(first.quantity_ordered) - first.draftReceived)
      : 1;
    setPickLineId(first?.id || '');
    setNewName('');
    setReceiveQty(pend);
    setLabelCopies(pend);
    setModalError('');
    setModal({ kind: 'link', barcode, product });
  }

  function closeModal() {
    setModal(null);
    setModalError('');
    focusScan();
  }

  useEffect(() => {
    if (!modal) return;
    const panel = modalRef.current;
    const t = window.setTimeout(() => {
      const first = panel?.querySelector<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      first?.focus();
    }, 40);

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- closeModal stable enough via focusScan
  }, [modal]);

  useEffect(() => {
    if (!modal || !pickLineId) return;
    const line = lines.find((l) => l.id === pickLineId);
    if (!line) return;
    if (modal.kind === 'create') setNewName(line.description);
    const pend = Math.max(1, Number(line.quantity_ordered) - line.draftReceived);
    setReceiveQty(pend);
    setLabelCopies(pend);
  }, [pickLineId, modal?.kind]);

  useEffect(() => {
    if (!noBarcodeOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeNoBarcode();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [noBarcodeOpen, focusScan]);

  useEffect(() => {
    if (!photoPreview) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePhotoPreview();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [photoPreview, closePhotoPreview]);

  async function onScan(e?: FormEvent) {
    e?.preventDefault();
    const raw = (scanRef.current?.value ?? code).trim();
    if (!raw) return;
    setError('');
    setSuccess('');
    try {
      const data = await api<{ product: ProductHit }>(
        `/api/products/by-code/${encodeURIComponent(raw)}`,
      );
      const product = data.product;
      const linked = lines.find(
        (l) => l.product_id === product.id && l.draftReceived < Number(l.quantity_ordered),
      );
      if (linked) {
        const nextQty = Math.min(Number(linked.quantity_ordered), linked.draftReceived + 1);
        bumpLine(linked.id, 1);
        pulseStage({
          name: product.name,
          photo_url: product.photo_url ?? linked.photo_url,
          size_label: product.size_label ?? linked.size_label,
          color: product.color ?? linked.color,
          qty: nextQty,
          ordered: Number(linked.quantity_ordered),
        });
        toast.success(
          `Prenda encontrada · ${product.name} · ${nextQty}/${linked.quantity_ordered}`,
        );
        setLiveMsg(`Prenda encontrada: ${product.name}`);
        setCode('');
        focusScan();
        return;
      }
      if (unlinkedPending.length >= 1) {
        openLinkModal(raw, product);
        setLiveMsg('Elige la línea y la cantidad recibida');
        setCode('');
        return;
      }
      setError('No hay líneas pendientes para esta prenda');
      setLiveMsg('No hay líneas pendientes');
      setCode('');
      focusScan();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      if (/no encontrado/i.test(msg) || /404/.test(msg)) {
        if (!unlinkedPending.length) {
          setError('Código no registrado y no hay líneas sin vincular');
          setLiveMsg('Código no registrado');
          setCode('');
          focusScan();
          return;
        }
        if (!canCreateProduct) {
          toast.error(CODE_REGISTER_FORBIDDEN);
          setError(CODE_REGISTER_FORBIDDEN);
          setLiveMsg('Código no registrado');
          setCode('');
          focusScan();
          return;
        }
        openCreateModal(raw);
        setLiveMsg('Código no registrado');
        setCode('');
        return;
      }
      setError(msg);
      setCode('');
      focusScan();
    }
  }

  async function openNoBarcode() {
    setNoBarcodeBusy(true);
    try {
      if (canCreateProduct) {
        const data = await api<{ nextBarcode: string }>('/api/products/next-barcode');
        setSuggestedBarcode(data.nextBarcode);
      }
      setNoBarcodeOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo abrir el asistente');
    } finally {
      setNoBarcodeBusy(false);
    }
  }

  function closeNoBarcode() {
    setNoBarcodeOpen(false);
    focusScan();
  }

  async function createFromNoBarcode(payload: {
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
    quantityReceived: number;
    labelCopies: number;
  }) {
    if (!id) return;
    const line = lines.find((l) => l.id === payload.purchaseItemId);
    if (!line) throw new Error('Línea no encontrada');
    const pending = Math.max(0, Number(line.quantity_ordered) - line.draftReceived);
    const add = Math.min(pending, Math.max(1, payload.quantityReceived));
    const nextQty = line.draftReceived + add;
    await api(`/api/purchases/${id}/receive`, {
      method: 'POST',
      body: {
        items: [
          {
            purchaseItemId: line.id,
            quantityReceived: nextQty,
            createProduct: {
              barcode: payload.barcode,
              name: payload.name,
              categoryId: payload.categoryId,
              brand: payload.brand,
              sizeLabel: payload.sizeLabel,
              color: payload.color,
              productType: payload.productType,
              season: payload.season,
              description: payload.description,
            },
          },
        ],
      },
    });
    pulseStage({
      name: payload.name,
      photo_url: null,
      size_label: payload.sizeLabel,
      color: payload.color,
      qty: nextQty,
      ordered: Number(line.quantity_ordered),
    });
    toast.success(
      `Prenda creada y recibida (${add} ud. · ${nextQty}/${line.quantity_ordered})`,
    );
    setLiveMsg(`Prenda creada · ${nextQty}/${line.quantity_ordered}`);
    setSuccess('Stock actualizado. La foto se agrega después en Productos.');
    closeNoBarcode();
    await load();
    // Impresión no bloquea: respeta N etiquetas en segundo plano
    void requestLabelPrint(payload.name, payload.barcode, payload.labelCopies);
  }

  async function linkExistingFromNoBarcode(payload: {
    purchaseItemId: string;
    product: {
      id: string;
      name: string;
      barcode: string | null;
      internal_code: string;
      photo_url?: string | null;
      size_label?: string | null;
      color?: string | null;
    };
    quantityReceived: number;
    labelCopies: number;
  }) {
    if (!id) return;
    const line = lines.find((l) => l.id === payload.purchaseItemId);
    if (!line) throw new Error('Línea no encontrada');
    await api(`/api/purchases/${id}/items/${line.id}`, {
      method: 'PATCH',
      body: { productId: payload.product.id },
    });
    const pending = Math.max(0, Number(line.quantity_ordered) - line.draftReceived);
    const add = Math.min(pending, Math.max(1, payload.quantityReceived));
    const nextQty = line.draftReceived + add;
    setLines((prev) =>
      prev.map((l) =>
        l.id === line.id
          ? {
              ...l,
              product_id: payload.product.id,
              product_name: payload.product.name,
              photo_url: payload.product.photo_url ?? l.photo_url,
              size_label: payload.product.size_label ?? l.size_label,
              color: payload.product.color ?? l.color,
              draftReceived: nextQty,
            }
          : l,
      ),
    );
    pulseStage({
      name: payload.product.name,
      photo_url: payload.product.photo_url,
      size_label: payload.product.size_label,
      color: payload.product.color,
      qty: nextQty,
      ordered: Number(line.quantity_ordered),
    });
    toast.success(
      `Prenda vinculada (${add} ud. en borrador) · confirma recepción para sumar al stock`,
    );
    setLiveMsg(`Vinculada · confirma recepción · ${nextQty}/${line.quantity_ordered}`);
    closeNoBarcode();
    const code = payload.product.barcode || payload.product.internal_code;
    if (code) {
      void requestLabelPrint(payload.product.name, code, payload.labelCopies);
    }
  }

  async function confirmReceive() {
    if (!id) return;
    const payload = lines
      .filter((l) => l.draftReceived !== Number(l.quantity_received))
      .map((l) => ({
        purchaseItemId: l.id,
        quantityReceived: l.draftReceived,
        productId: l.product_id,
      }));

    if (!payload.length) {
      setError('No hay cambios para confirmar');
      return;
    }
    if (payload.some((p) => !p.productId && p.quantityReceived > 0)) {
      setError('Hay líneas sin producto: vincula o crea con el escáner');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await api(`/api/purchases/${id}/receive`, {
        method: 'POST',
        body: { items: payload },
      });
      toast.success('Recepción confirmada');
      navigate('/ingresos');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al recepcionar');
    } finally {
      setBusy(false);
    }
  }

  async function submitCreateModal() {
    if (!id || !modal || modal.kind !== 'create') return;
    const line = lines.find((l) => l.id === pickLineId);
    if (!line) {
      setModalError('Elige una línea');
      return;
    }
    const pending = Math.max(0, Number(line.quantity_ordered) - line.draftReceived);
    const qty = Math.floor(Number(receiveQty));
    if (!Number.isFinite(qty) || qty < 1) {
      setModalError('Indica la cantidad recibida');
      return;
    }
    if (qty > pending) {
      setModalError(`Solo quedan ${pending} pendiente${pending === 1 ? '' : 's'}`);
      return;
    }
    const nextQty = line.draftReceived + qty;
    setBusy(true);
    setModalError('');
    try {
      await api(`/api/purchases/${id}/receive`, {
        method: 'POST',
        body: {
          items: [
            {
              purchaseItemId: line.id,
              quantityReceived: nextQty,
              createProduct: {
                barcode: modal.barcode,
                name: newName.trim() || line.description,
              },
            },
          ],
        },
      });
      pulseStage({
        name: newName.trim() || line.description,
        photo_url: null,
        size_label: line.size_label,
        color: line.color,
        qty: nextQty,
        ordered: Number(line.quantity_ordered),
      });
      toast.success(`Prenda creada y recibida (${qty} ud. · ${nextQty}/${line.quantity_ordered})`);
      setLiveMsg(`Prenda creada · ${nextQty}/${line.quantity_ordered}`);
      setSuccess('Stock actualizado. La foto se agrega después en Productos.');
      const printName = newName.trim() || line.description;
      const copies = Math.max(1, Math.floor(Number(labelCopies) || 1));
      closeModal();
      await load();
      void requestLabelPrint(printName, modal.barcode, copies);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Error al crear');
    } finally {
      setBusy(false);
    }
  }

  async function submitLinkModal() {
    if (!id || !modal || modal.kind !== 'link') return;
    const line = lines.find((l) => l.id === pickLineId);
    if (!line) {
      setModalError('Elige una línea');
      return;
    }
    const pending = Math.max(0, Number(line.quantity_ordered) - line.draftReceived);
    const qty = Math.floor(Number(receiveQty));
    if (!Number.isFinite(qty) || qty < 1) {
      setModalError('Indica la cantidad recibida');
      return;
    }
    if (qty > pending) {
      setModalError(`Solo quedan ${pending} pendiente${pending === 1 ? '' : 's'}`);
      return;
    }
    setBusy(true);
    setModalError('');
    try {
      await api(`/api/purchases/${id}/items/${line.id}`, {
        method: 'PATCH',
        body: { productId: modal.product.id },
      });
      const nextQty = line.draftReceived + qty;
      setLines((prev) =>
        prev.map((l) =>
          l.id === line.id
            ? {
                ...l,
                product_id: modal.product.id,
                product_name: modal.product.name,
                photo_url: modal.product.photo_url ?? l.photo_url,
                size_label: modal.product.size_label ?? l.size_label,
                color: modal.product.color ?? l.color,
                draftReceived: nextQty,
              }
            : l,
        ),
      );
      pulseStage({
        name: modal.product.name,
        photo_url: modal.product.photo_url,
        size_label: modal.product.size_label,
        color: modal.product.color,
        qty: nextQty,
        ordered: Number(line.quantity_ordered),
      });
      toast.success(
        `Prenda vinculada (${qty} ud. en borrador) · confirma recepción para sumar al stock`,
      );
      setLiveMsg(`Vinculada · confirma recepción · ${nextQty}/${line.quantity_ordered}`);
      closeModal();
      focusScan();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Error al vincular');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="ing-detail">
        <div className="ing-skel" aria-busy="true">
          <div className="ing-skel-row" />
          <div className="ing-skel-row" />
        </div>
      </div>
    );
  }

  if (!purchase) {
    return (
      <div className="ing-detail">
        <p className="error">{error || 'Recepción no encontrada'}</p>
        <Link to="/ingresos" className="btn secondary">
          Volver
        </Link>
      </div>
    );
  }

  const locked = purchase.status === 'received' || purchase.status === 'cancelled';
  const selectedLine = lines.find((l) => l.id === pickLineId);
  const modalSaleDisplay = selectedLine ? lineFloorSalePrice(selectedLine) : 0;
  const modalPending = selectedLine
    ? Math.max(0, Number(selectedLine.quantity_ordered) - selectedLine.draftReceived)
    : 0;
  const stageDetail = [stage?.size_label, stage?.color].filter(Boolean).join(' · ');

  return (
    <div className="ing-detail">
      <Link
        to="/ingresos"
        className="btn ghost no-print"
        style={{ marginBottom: '0.35rem', display: 'inline-flex' }}
      >
        ← Ingresos
      </Link>

      <div className="section-title no-print">
        <div className="page-intro" style={{ marginBottom: 0 }}>
          <p className="ing-doc-ref" aria-label="Documento">
            {purchaseRef(purchase)}
          </p>
          <p>
            <span className={statusBadgeClass(purchase.status)}>{statusLabel(purchase.status)}</span>
            {' · '}
            {receivedSummary.received} de {receivedSummary.ordered} recibidas
          </p>
        </div>
      </div>

      {!locked && (
        <div className="ing-receive-layout">
          <div className={`pos-stage${stagePulse ? ' is-pulse' : ''}`} aria-live="off">
            {stage ? (
              <>
                <LineThumb
                  name={stage.name}
                  photoUrl={stage.photo_url}
                  className="pos-stage-photo"
                  onExpand={openPhotoPreview}
                />
                <div className="pos-stage-meta">
                  <strong className="pos-stage-name">{stage.name}</strong>
                  {stageDetail ? <span className="pos-stage-detail">{stageDetail}</span> : null}
                  <span className="ing-stage-qty">
                    {stage.qty} / {stage.ordered}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="pos-stage-photo is-empty" aria-hidden>
                  <span className="pos-mono">L'S</span>
                </div>
                <div className="pos-stage-meta">
                  <p className="pos-stage-idle muted">La prenda escaneada aparecerá aquí</p>
                </div>
              </>
            )}
          </div>

          <div className="card pos-scan ing-scan">
            <form onSubmit={onScan}>
              <div className="field">
                <label htmlFor="ing-scan-input">Escanear código</label>
                <div className="ing-scan-row scan-row">
                  <input
                    id="ing-scan-input"
                    ref={scanRef}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    autoComplete="off"
                    inputMode="none"
                    placeholder="Código de barras"
                  />
                  <button className="btn" type="submit">
                    Buscar
                  </button>
                </div>
              </div>
              <p className="ing-hint">Escanea el código. La foto confirma la prenda.</p>
            </form>
            <button
              type="button"
              className="btn secondary pos-search-trigger"
              onClick={() => void openNoBarcode()}
              disabled={noBarcodeBusy}
            >
              {noBarcodeBusy ? 'Generando…' : 'Sin código de barras'}
            </button>
          </div>

          <div className="card ing-lines" aria-label="Líneas del ingreso">
            <div className="section-title">
              <h3 style={{ margin: 0 }}>Líneas</h3>
            </div>
            <ul className="ing-line-list">
              {lines.map((line) => {
                const pending = line.draftReceived < Number(line.quantity_ordered);
                const name = lineDisplayName(line);
                const detail = [line.size_label, line.color].filter(Boolean).join(' · ');
                return (
                  <li key={line.id} className="ing-line-row">
                    <LineThumb
                      name={name}
                      photoUrl={line.photo_url}
                      className="ing-line-thumb"
                      onExpand={openPhotoPreview}
                    />
                    <div className="ing-line-info">
                      <strong>{name}</strong>
                      {detail ? <div className="meta">{detail}</div> : null}
                      <div className="meta">
                        Recibido {line.draftReceived}/{line.quantity_ordered}
                        {Number(line.quantity_ordered) - line.draftReceived > 0
                          ? ` · Pendiente ${Number(line.quantity_ordered) - line.draftReceived}`
                          : ''}
                        {lineFloorSalePrice(line) > 0
                          ? ` · P. venta ${money(lineFloorSalePrice(line))}`
                          : ''}
                      </div>
                      <span className={`ing-line-status badge${line.product_id ? ' success' : ' warning'}`}>
                        {line.product_id ? 'Vinculado' : 'Sin vincular'}
                      </span>
                      {!line.product_id && (
                        <p className="ing-hint">Escanea un código para vincular o crear esta línea</p>
                      )}
                    </div>
                    {!locked && pending && line.product_id ? (
                      <div className="pos-qty" role="group" aria-label={`Cantidad ${name}`}>
                        <button
                          type="button"
                          className="btn secondary"
                          aria-label="Menos"
                          onClick={() => bumpLine(line.id, -1)}
                          disabled={line.draftReceived <= Number(line.quantity_received)}
                        >
                          −
                        </button>
                        <span className="pos-qty-n" aria-live="polite">
                          {line.draftReceived}
                        </span>
                        <button
                          type="button"
                          className="btn secondary"
                          aria-label="Más"
                          onClick={() => bumpLine(line.id, 1)}
                          disabled={line.draftReceived >= Number(line.quantity_ordered)}
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <span className="pos-qty-n muted">{line.draftReceived}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {locked && (
        <div className="ing-lines" aria-label="Líneas del ingreso">
          <ul className="ing-line-list">
            {lines.map((line) => {
              const name = lineDisplayName(line);
              return (
                <li key={line.id} className="ing-line-row">
                  <LineThumb
                    name={name}
                    photoUrl={line.photo_url}
                    className="ing-line-thumb"
                    onExpand={openPhotoPreview}
                  />
                  <div className="ing-line-info">
                    <strong>{name}</strong>
                    <div className="meta">
                      Recibido {line.draftReceived}/{line.quantity_ordered}
                      {lineFloorSalePrice(line) > 0
                        ? ` · P. venta ${money(lineFloorSalePrice(line))}`
                        : ''}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {error && <p className="error no-print">{error}</p>}
      {success && <p className="ing-success no-print">{success}</p>}
      <p className="sr-only" aria-live="polite">
        {liveMsg}
      </p>
      {!locked && (
        <div className="ing-sticky-bar no-print">
          <button
            className="btn block"
            type="button"
            disabled={busy || !canReceive}
            onClick={confirmReceive}
          >
            {busy ? 'Confirmando…' : 'Confirmar recepción'}
          </button>
        </div>
      )}

      <NoBarcodeModal
        open={noBarcodeOpen}
        titleId={noBarcodeTitleId}
        lines={unlinkedPending}
        categories={categories}
        suggestedBarcode={suggestedBarcode}
        canCreateProduct={canCreateProduct}
        onClose={closeNoBarcode}
        onCreateAndReceive={createFromNoBarcode}
        onLinkExisting={linkExistingFromNoBarcode}
        onPrintLabel={(labelName, code, copies) => requestLabelPrint(labelName, code, copies)}
      />

      {modal && (
        <div
          className="pos-modal open no-print"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <ModalOverlayClose onClose={closeModal}>
          <div className="ing-line-modal-shell">
          <div
            className="pos-modal-panel ing-line-modal ing-link-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={createTitleId}
            ref={modalRef}
          >
            <div className="pos-modal-head">
              <h3 id={createTitleId}>
                {modal.kind === 'create' ? 'Crear prenda y vincular' : 'Vincular prenda existente'}
              </h3>
            </div>

            <div className="ing-line-modal-body">
              <p className="ing-barcode-fixed">Código: {modal.barcode}</p>
              <p className="ing-hint">
                Es el código de la etiqueta y de la pistola. Elige la línea de este ingreso.
              </p>

              <div className="ing-line-picks" role="radiogroup" aria-label="Líneas pendientes">
                {unlinkedPending.map((l) => (
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
                      {Number(l.quantity_ordered) - l.draftReceived}
                      {lineFloorSalePrice(l) > 0
                        ? ` · P. venta ${money(lineFloorSalePrice(l))}`
                        : ''}
                    </span>
                  </button>
                ))}
              </div>

              {modal.kind === 'create' && (
                <>
                  <div className="field">
                    <label htmlFor="ing-new-name">Nombre</label>
                    <input
                      id="ing-new-name"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="ing-sale">Precio de venta</label>
                    <input
                      id="ing-sale"
                      value={modalSaleDisplay > 0 ? money(modalSaleDisplay) : '—'}
                      disabled
                      readOnly
                      aria-readonly="true"
                    />
                    <span className="ing-hint">Fijado en la compra · no editable en recepción</span>
                  </div>
                </>
              )}

              {modal.kind === 'link' && (
                <p className="meta">
                  Prenda: <strong>{modal.product.name}</strong> · {modal.product.internal_code}
                </p>
              )}

              <div className="ing-nb-grid" style={{ marginTop: '0.65rem' }}>
                <div className="field">
                  <label htmlFor="ing-modal-qty">Cantidad recibida</label>
                  <input
                    id="ing-modal-qty"
                    type="number"
                    min={1}
                    max={Math.max(1, modalPending)}
                    value={receiveQty}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setReceiveQty(v);
                      if (Number.isFinite(v) && v >= 1) setLabelCopies(v);
                    }}
                  />
                  <span className="ing-hint">Pendiente en la línea: {modalPending}</span>
                </div>
                <div className="field">
                  <label htmlFor="ing-modal-labels">Imprimir N etiquetas</label>
                  <input
                    id="ing-modal-labels"
                    type="number"
                    min={1}
                    max={999}
                    value={labelCopies}
                    onChange={(e) => setLabelCopies(Number(e.target.value))}
                  />
                </div>
              </div>

              {modal.kind === 'create' ? (
                <p className="ing-hint">La foto se agrega después en Productos</p>
              ) : null}

              {modalError && <p className="error">{modalError}</p>}
            </div>

            <div className="btn-row ing-line-modal-actions">
              <button type="button" className="btn secondary" onClick={closeModal} disabled={busy}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy || !pickLineId}
                onClick={() => (modal.kind === 'create' ? submitCreateModal() : submitLinkModal())}
              >
                {modal.kind === 'create' ? 'Crear y recepcionar' : 'Vincular y recibir'}
              </button>
            </div>
          </div>
          </div></ModalOverlayClose>
        </div>
      )}

      {photoPreview && (
        <div
          className="ing-photo-lightbox no-print"
          role="dialog"
          aria-modal="true"
          aria-label={`Foto de ${photoPreview.name}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) closePhotoPreview();
          }}
        >
          <ModalOverlayClose onClose={closePhotoPreview}>
          <div className="ing-photo-lightbox-panel">
            <div className="ing-photo-lightbox-head">
              <h3>{photoPreview.name}</h3>
            </div>
            <img
              src={mediaUrl(photoPreview.url)}
              alt={photoPreview.name}
              className="ing-photo-lightbox-img"
            />
          </div></ModalOverlayClose>
        </div>
      )}

      {printLabel &&
        Array.from({ length: printLabel.copies }, (_, i) => (
          <div key={`lbl-${i}`} className="ing-label-print" aria-hidden>
            <p className="ing-label-name" title={printLabel.name}>
              {printLabel.name}
            </p>
            <ThermalBarcode value={printLabel.code} compact className="ing-label-barcode" />
            <p className="ing-label-code">{printLabel.code}</p>
          </div>
        ))}

      <PrintReminderModal
        open={labelReminderOpen}
        profile="labels"
        onConfirm={confirmLabelPrint}
        onCancel={cancelLabelPrint}
      />
    </div>
  );
}
