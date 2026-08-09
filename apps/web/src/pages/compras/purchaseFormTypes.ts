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
  lines: LineDraft[];
};

export const DOC_TYPES: { id: DocType; label: string }[] = [
  { id: 'factura', label: 'Factura' },
  { id: 'boleta', label: 'Boleta' },
  { id: 'guia', label: 'Guía' },
  { id: 'otro', label: 'Otro' },
];

export function suggestSale(cost: string) {
  const n = Number(cost);
  if (!Number.isFinite(n) || n <= 0) return '';
  return String(Math.round(n * 2));
}

/** Enteros limpios para inputs (evita "1000.0"). */
export function moneyInput(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return String(Math.round(n));
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
  const cost = Number(ed.unitCost);
  if (!Number.isFinite(cost) || cost <= 0) return 'El precio de costo es obligatorio';
  const sale = Number(ed.salePrice);
  if (!Number.isFinite(sale) || sale <= 0) return 'El precio de venta sugerido es obligatorio';
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
  return {
    documentType: values.docType,
    invoiceNumber: values.invoice.trim(),
    supplierId: values.supplierId || null,
    purchasedAt: values.purchasedAt || null,
    notes: values.notes.trim() || null,
    items: values.lines.map((l) => ({
      description: l.description,
      quantityOrdered: Number(l.quantity),
      unitCost: Number(l.unitCost),
      suggestedSalePrice: Number(l.salePrice),
      photoUrl: l.photoUrl,
    })),
  };
}

export function dateInputValue(iso: string | null | undefined) {
  if (!iso) return '';
  return iso.slice(0, 10);
}
