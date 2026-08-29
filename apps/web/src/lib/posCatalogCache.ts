/**
 * Cache IndexedDB: snapshot POS + cola de ventas offline (Fase B/C).
 * Scoped por branchId — no mezclar sucursales.
 */

import { expandProductCodeVariants } from './scanCode';
import type { PaymentMethod } from './paymentMethod';

const DB_NAME = 'lscala-pos-v3';
const DB_VERSION = 1;
const SNAP_STORE = 'snapshots';
const SALES_STORE = 'offline_sales';

export const OFFLINE_SALES_EVENT = 'lscala:offline-sales';

export type PosCatalogProduct = {
  id: string;
  name: string;
  internal_code: string;
  barcode: string | null;
  sale_price: string;
  brand?: string | null;
  size_label?: string | null;
  color?: string | null;
  allows_exchange?: boolean;
  allows_return?: boolean;
  tracks_stock?: boolean;
  status?: string;
  updated_at?: string;
  stock: number;
  photo_url?: string | null;
  category_name?: string | null;
};

export type PosCatalogSnapshot = {
  branchId: string;
  organizationId: string;
  generatedAt: string;
  count: number;
  products: PosCatalogProduct[];
};

/** Nombres/códigos de pruebas de piso que no deben contaminar Caja. */
const DUMMY_NAME_RE = /\bqa\b|partial|created|exclusive test|^shape$/i;

export function isPosCatalogSellable(p: Pick<PosCatalogProduct, 'name' | 'status'>): boolean {
  const status = (p.status || '').toLowerCase();
  if (['archived', 'merma', 'returned_to_supplier', 'sold'].includes(status)) return false;
  const name = (p.name || '').trim();
  if (!name) return false;
  return !DUMMY_NAME_RE.test(name);
}

export function filterPosCatalogProducts(products: PosCatalogProduct[]): PosCatalogProduct[] {
  return products.filter(isPosCatalogSellable);
}

export type OfflineSaleItem = {
  productId: string;
  quantity: number;
  unitPrice?: number;
};

export type OfflineSaleDraft = {
  clientSaleId: string;
  branchId: string;
  posId: string;
  soldAt: string;
  items: OfflineSaleItem[];
  notes?: string;
  paymentMethod?: PaymentMethod;
};

export type OfflineSaleRecord = OfflineSaleDraft & {
  status: 'pending' | 'error';
  createdAt: string;
  attemptCount: number;
  lastError?: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('No se pudo abrir IndexedDB'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SNAP_STORE)) {
        db.createObjectStore(SNAP_STORE, { keyPath: 'branchId' });
      }
      if (!db.objectStoreNames.contains(SALES_STORE)) {
        const sales = db.createObjectStore(SALES_STORE, { keyPath: 'clientSaleId' });
        sales.createIndex('by_branch_created', ['branchId', 'createdAt'], { unique: false });
      }
    };
  });
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Error IndexedDB'));
  });
}

function notifyOfflineSalesChanged() {
  window.dispatchEvent(new CustomEvent(OFFLINE_SALES_EVENT));
}

export async function savePosSnapshot(snapshot: PosCatalogSnapshot): Promise<void> {
  const products = filterPosCatalogProducts(snapshot.products);
  const clean: PosCatalogSnapshot = {
    ...snapshot,
    products,
    count: products.length,
  };
  const db = await openDb();
  try {
    const tx = db.transaction(SNAP_STORE, 'readwrite');
    await idbReq(tx.objectStore(SNAP_STORE).put(clean));
  } finally {
    db.close();
  }
}

export async function loadPosSnapshot(branchId: string): Promise<PosCatalogSnapshot | null> {
  if (!branchId) return null;
  const db = await openDb();
  try {
    const tx = db.transaction(SNAP_STORE, 'readonly');
    const row = await idbReq(tx.objectStore(SNAP_STORE).get(branchId));
    const snap = (row as PosCatalogSnapshot | undefined) ?? null;
    if (!snap) return null;
    const products = filterPosCatalogProducts(snap.products || []);
    return { ...snap, products, count: products.length };
  } finally {
    db.close();
  }
}

export async function clearPosSnapshot(branchId: string): Promise<void> {
  if (!branchId) return;
  const db = await openDb();
  try {
    const tx = db.transaction(SNAP_STORE, 'readwrite');
    await idbReq(tx.objectStore(SNAP_STORE).delete(branchId));
  } finally {
    db.close();
  }
}

/** Descuenta stock local tras venta offline (optimistic). */
export async function applyLocalStockDelta(
  branchId: string,
  items: OfflineSaleItem[],
): Promise<PosCatalogSnapshot | null> {
  const snap = await loadPosSnapshot(branchId);
  if (!snap) return null;
  const sold = new Map<string, number>();
  for (const it of items) {
    sold.set(it.productId, (sold.get(it.productId) || 0) + it.quantity);
  }
  const products = snap.products.map((p) => {
    const qty = sold.get(p.id);
    if (!qty || p.tracks_stock === false) return p;
    return { ...p, stock: Number(p.stock) - qty };
  });
  const next = { ...snap, products };
  await savePosSnapshot(next);
  return next;
}

/** Actualiza una prenda en el snapshot local (stock/foto frescos desde API). */
export async function upsertPosCatalogProduct(
  branchId: string,
  product: PosCatalogProduct,
): Promise<PosCatalogSnapshot | null> {
  if (!branchId || !product.id) return null;
  if (!isPosCatalogSellable(product)) return loadPosSnapshot(branchId);
  const snap = await loadPosSnapshot(branchId);
  if (!snap) {
    // Sin snapshot aún: no crear uno incompleto.
    return null;
  }
  const idx = snap.products.findIndex((p) => p.id === product.id);
  const products = [...snap.products];
  if (idx >= 0) {
    products[idx] = { ...products[idx], ...product };
  } else {
    products.push(product);
  }
  const next: PosCatalogSnapshot = {
    ...snap,
    products,
    count: products.length,
    generatedAt: snap.generatedAt,
  };
  await savePosSnapshot(next);
  return next;
}

function normalizeQuery(q: string) {
  return q.trim().toLowerCase();
}

export function searchPosCatalog(
  products: PosCatalogProduct[],
  q: string,
  limit = 30,
): PosCatalogProduct[] {
  const needle = normalizeQuery(q);
  if (!needle) return [];
  const hits: PosCatalogProduct[] = [];
  for (const p of products) {
    const hay = [
      p.name,
      p.internal_code,
      p.barcode || '',
      p.brand || '',
      p.size_label || '',
      p.color || '',
    ]
      .join(' ')
      .toLowerCase();
    if (hay.includes(needle)) {
      hits.push(p);
      if (hits.length >= limit) break;
    }
  }
  return hits;
}

/**
 * Resuelve prenda por código de barras (etiqueta) o código interno LS-*.
 * Acepta variantes BC-000003 / BC000003 y basura típica de pistola.
 */
export function findPosProductByCode(
  products: PosCatalogProduct[],
  code: string,
): PosCatalogProduct | null {
  const needles = new Set(expandProductCodeVariants(code));
  if (!needles.size) return null;

  return (
    products.find((p) => {
      const candidates = [
        ...expandProductCodeVariants(p.barcode || ''),
        ...expandProductCodeVariants(p.internal_code || ''),
      ];
      return candidates.some((c) => needles.has(c));
    }) ?? null
  );
}

export async function enqueueOfflineSale(draft: OfflineSaleDraft): Promise<OfflineSaleRecord> {
  if (!draft.clientSaleId || !draft.branchId || !draft.posId || !draft.items.length) {
    throw new Error('Venta offline incompleta');
  }
  const record: OfflineSaleRecord = {
    ...draft,
    status: 'pending',
    createdAt: new Date().toISOString(),
    attemptCount: 0,
  };
  const db = await openDb();
  try {
    const tx = db.transaction(SALES_STORE, 'readwrite');
    await idbReq(tx.objectStore(SALES_STORE).put(record));
  } finally {
    db.close();
  }
  notifyOfflineSalesChanged();
  return record;
}

export async function listPendingOfflineSales(branchId: string): Promise<OfflineSaleRecord[]> {
  if (!branchId) return [];
  const db = await openDb();
  try {
    const tx = db.transaction(SALES_STORE, 'readonly');
    const all = await idbReq(tx.objectStore(SALES_STORE).getAll());
    return (all as OfflineSaleRecord[])
      .filter((r) => r.branchId === branchId && (r.status === 'pending' || r.status === 'error'))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } finally {
    db.close();
  }
}

export async function countPendingOfflineSales(branchId: string): Promise<number> {
  const list = await listPendingOfflineSales(branchId);
  return list.length;
}

export async function removeOfflineSale(clientSaleId: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(SALES_STORE, 'readwrite');
    await idbReq(tx.objectStore(SALES_STORE).delete(clientSaleId));
  } finally {
    db.close();
  }
  notifyOfflineSalesChanged();
}

export async function markOfflineSaleError(
  clientSaleId: string,
  lastError: string,
): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(SALES_STORE, 'readwrite');
    const store = tx.objectStore(SALES_STORE);
    const row = (await idbReq(store.get(clientSaleId))) as OfflineSaleRecord | undefined;
    if (!row) return;
    await idbReq(
      store.put({
        ...row,
        status: 'error',
        lastError,
        attemptCount: (row.attemptCount || 0) + 1,
      }),
    );
  } finally {
    db.close();
  }
  notifyOfflineSalesChanged();
}

export async function markOfflineSalePending(clientSaleId: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(SALES_STORE, 'readwrite');
    const store = tx.objectStore(SALES_STORE);
    const row = (await idbReq(store.get(clientSaleId))) as OfflineSaleRecord | undefined;
    if (!row) return;
    await idbReq(store.put({ ...row, status: 'pending' }));
  } finally {
    db.close();
  }
}
