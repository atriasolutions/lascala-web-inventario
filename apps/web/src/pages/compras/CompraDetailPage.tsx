import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import {
  purchaseRef,
  type Purchase,
  type PurchaseItem,
} from '../../lib/purchasesStatus';
import { useShellTitle } from '../../components/shellTitle';
import { PurchaseDocumentForm } from './PurchaseDocumentForm';
import {
  dateInputValue,
  moneyInput,
  toApiPayload,
  type DocType,
  type PurchaseFormValues,
} from './purchaseFormTypes';

function toFormValues(purchase: Purchase, items: PurchaseItem[]): PurchaseFormValues {
  const rawType = (purchase.document_type || 'factura').toLowerCase();
  const docType: DocType =
    rawType === 'boleta' || rawType === 'guia' || rawType === 'otro' || rawType === 'factura'
      ? rawType
      : 'otro';

  return {
    docType,
    invoice: purchase.invoice_number || '',
    supplierId: purchase.supplier_id || '',
    supplierName: purchase.supplier_name || '',
    purchasedAt: dateInputValue(purchase.purchased_at),
    notes: purchase.notes || '',
    destinationBranchId: purchase.destination_branch_id || '',
    lines: items.map((item) => ({
      key: item.id,
      description: item.description,
      quantity: String(item.quantity_ordered),
      unitCost: moneyInput(item.unit_cost),
      salePrice: moneyInput(item.suggested_sale_price ?? ''),
      saleTouched: true,
      photoUrl: item.photo_url || null,
    })),
  };
}

export function CompraDetailPage() {
  const { id } = useParams<{ id: string }>();
  const setShellTitle = useShellTitle();
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    const data = await api<{ purchase: Purchase; items: PurchaseItem[] }>(`/api/purchases/${id}`);
    setPurchase(data.purchase);
    setItems(data.items);
  }, [id]);

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
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const editable = purchase?.status === 'pending_reception';

  useEffect(() => {
    if (!purchase) {
      setShellTitle(null);
      return;
    }
    const ref = purchaseRef(purchase);
    setShellTitle(editable ? `Editar · ${ref}` : ref);
    return () => setShellTitle(null);
  }, [purchase, editable, setShellTitle]);

  const initial = useMemo(() => {
    if (!purchase) return undefined;
    return toFormValues(purchase, items);
  }, [purchase, items]);

  async function onSubmit(payload: ReturnType<typeof toApiPayload>) {
    if (!id) return;
    await api(`/api/purchases/${id}`, {
      method: 'PATCH',
      body: payload,
    });
  }

  if (loading) {
    return <p className="muted" style={{ padding: '1rem 0' }}>Cargando compra…</p>;
  }

  if (error || !purchase || !initial) {
    return (
      <div className="ing-empty">
        <p className="error">{error || 'Compra no encontrada'}</p>
        <Link to="/compras" className="btn secondary">
          Volver a compras
        </Link>
      </div>
    );
  }

  const banner = !editable ? (
    <div className="compras-locked-banner" role="status">
      <p>
        Esta compra ya no se puede editar porque la recepción ya comenzó o está cerrada.
      </p>
      <Link to={`/ingresos/${purchase.id}`} className="btn secondary">
        Ir a recepción
      </Link>
    </div>
  ) : null;

  return (
    <PurchaseDocumentForm
      key={`${purchase.id}-${purchase.status}-${items.length}-${purchase.invoice_number}`}
      mode={editable ? 'edit' : 'view'}
      initial={initial}
      backTo="/compras"
      backLabel="← Volver a compras"
      submitLabel="Guardar cambios"
      successToast="Compra actualizada"
      banner={banner}
      moodTitle={editable ? 'Edita antes de recibir' : 'Documento cerrado a edición'}
      moodCopy={
        editable
          ? 'Mientras esté pendiente de recepción puedes corregir documento y líneas.'
          : 'Consulta el documento aquí o continúa la recepción en Ingresos.'
      }
      onSubmit={editable ? onSubmit : undefined}
    />
  );
}
