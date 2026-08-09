import { purchaseProgress, purchaseRef, type Purchase } from './purchasesStatus';

export type PurchaseSortKey = 'ref' | 'supplier' | 'progress' | 'date' | 'status';
export type SortDir = 'asc' | 'desc';

const STATUS_ORDER: Record<string, number> = {
  pending_reception: 0,
  partially_received: 1,
  received: 2,
  cancelled: 3,
};

function cmpStr(a: string, b: string) {
  return a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true });
}

function valueFor(p: Purchase, key: PurchaseSortKey): string | number {
  switch (key) {
    case 'ref':
      return purchaseRef(p);
    case 'supplier':
      return p.supplier_name?.trim() || '';
    case 'progress': {
      const { ordered, received } = purchaseProgress(p);
      if (ordered <= 0) return -1;
      return received / ordered;
    }
    case 'date':
      return new Date(p.purchased_at || p.created_at).getTime() || 0;
    case 'status':
      return STATUS_ORDER[p.status] ?? 99;
    default:
      return '';
  }
}

export function sortPurchases(
  rows: Purchase[],
  key: PurchaseSortKey,
  dir: SortDir,
): Purchase[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = valueFor(a, key);
    const vb = valueFor(b, key);
    if (typeof va === 'number' && typeof vb === 'number') {
      if (va === vb) return 0;
      return va < vb ? -sign : sign;
    }
    return sign * cmpStr(String(va), String(vb));
  });
}

export function nextSort(
  currentKey: PurchaseSortKey,
  currentDir: SortDir,
  nextKey: PurchaseSortKey,
): { key: PurchaseSortKey; dir: SortDir } {
  if (currentKey === nextKey) {
    return { key: nextKey, dir: currentDir === 'asc' ? 'desc' : 'asc' };
  }
  // Primera vez: fechas y progreso bajan; texto sube
  if (nextKey === 'date' || nextKey === 'progress') {
    return { key: nextKey, dir: 'desc' };
  }
  return { key: nextKey, dir: 'asc' };
}

export function ariaSort(
  activeKey: PurchaseSortKey,
  dir: SortDir,
  column: PurchaseSortKey,
): 'ascending' | 'descending' | 'none' {
  if (activeKey !== column) return 'none';
  return dir === 'asc' ? 'ascending' : 'descending';
}
