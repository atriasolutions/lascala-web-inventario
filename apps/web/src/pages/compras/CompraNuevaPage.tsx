import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { PurchaseDocumentForm } from './PurchaseDocumentForm';
import { toApiPayload } from './purchaseFormTypes';

export function CompraNuevaPage() {
  const navigate = useNavigate();

  async function onSubmit(payload: ReturnType<typeof toApiPayload>) {
    const data = await api<{ purchase: { id: string } }>('/api/purchases', {
      method: 'POST',
      body: payload,
    });
    navigate(`/compras/${data.purchase.id}`);
  }

  return (
    <PurchaseDocumentForm
      mode="create"
      backTo="/compras"
      backLabel="← Volver a compras"
      submitLabel="Guardar compra"
      moodTitle="Compra registrada, recepción después"
      moodCopy="Primero arma el documento y las prendas en la lista. Después toca Guardar compra abajo. La recepción a stock se hace en Ingresos."
      onSubmit={onSubmit}
    />
  );
}
