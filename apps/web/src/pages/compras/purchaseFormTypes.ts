import { chileMoneyFromNumber, parseChileMoney } from '../../lib/chileMoney';
import { packComprobante } from '../../lib/comprobanteEmbed';

export type DocType = 'factura' | 'boleta' | 'guia' | 'otro';

export type LineDraft = {
  key: string;
  description: string;
  quantity: string;
  unitCost: string;
  salePrice: string;
  saleTouched: boolean;
  photoUrl: string | null;
};

export type LineEditor = LineDraft & { photoBusy: boolean };

export type Supplier = { id: string; name: string };

export type PurchaseFormValues = {
  docType: DocType;
  invoice: string;
  supplierId: string;
  supplierName?: string;
  purchasedAt: string;
  notes: string;
  /** Sucursal donde se recibirá la mercadería */
  destinationBranchId: string;
  /** URL subida; se embebe en notes al guardar (sin columna nueva). */
  attachmentUrl: string;
  lines: LineDraft[];
};

export const DOC_TYPES: { id: DocType; label: string }[] = [
  { id: 'factura', label: 'Factura' },
  { id: 'boleta', label: 'Boleta' },
  { id: 'guia', label: 'Guía' },
  { id: 'otro', label: 'Otro' },
];

export function suggestSale(cost: string) {
  const n = parseChileMoney(cost);
  if (n == null || n <= 0) return '';
  return chileMoneyFromNumber(Math.round(n * 2));
}

/** Enteros con miles Chile para inputs. */
export function moneyInput(value: string | number | null | undefined) {
  return chileMoneyFromNumber(value);
}

export function blankEditor(key?: string): LineEditor {
  return {
    key: key || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    description: '',
    quantity: '1',
    unitCost: '',
    salePrice: '',
    saleTouched: false,
    photoUrl: null,
    photoBusy: false,
  };
}

export function toEditor(line: LineDraft): LineEditor {
  return { ...line, photoBusy: false };
}

export function validateEditor(ed: LineEditor): string | null {
  if (!ed.description.trim()) return 'Ingresa la descripción de la prenda';
  const qty = Number(ed.quantity);
  if (!Number.isFinite(qty) || qty < 1) return 'La cantidad debe ser al menos 1';
  const cost = parseChileMoney(ed.unitCost);
  if (cost == null || cost <= 0) return 'El precio de costo es obligatorio';
  const sale = parseChileMoney(ed.salePrice);
  if (sale == null || sale <= 0) return 'El precio de venta sugerido es obligatorio';
  if (ed.photoBusy) return 'Espera a que termine de subir la foto';
  return null;
}

export async function fileToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const max = 960;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la foto');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.82);
}

export function toApiPayload(values: PurchaseFormValues) {
  const notesPacked = packComprobante(values.notes, values.attachmentUrl);
  return {
    documentType: values.docType,
    invoiceNumber: values.invoice.trim(),
    supplierId: values.supplierId || null,
    purchasedAt: values.purchasedAt || null,
    notes: notesPacked || null,
    destinationBranchId: values.destinationBranchId || undefined,
    items: values.lines.map((l) => ({
      description: l.description,
      quantityOrdered: Number(l.quantity),
      unitCost: parseChileMoney(l.unitCost) ?? 0,
      suggestedSalePrice: parseChileMoney(l.salePrice) ?? 0,
      photoUrl: l.photoUrl,
    })),
  };
}

export function dateInputValue(iso: string | null | undefined) {
  if (!iso) return '';
  return iso.slice(0, 10);
}
