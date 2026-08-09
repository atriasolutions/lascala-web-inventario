export type SaleSortKey = 'receipt' | 'date' | 'seller' | 'pos' | 'total';
export type SortDir = 'asc' | 'desc';

export type SaleSortable = {
  receipt_number: string;
  sold_at: string;
  seller_name: string;
  pos_name: string;
  total: string | number;
};

function cmpStr(a: string, b: string) {
  return a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true });
}

function valueFor(s: SaleSortable, key: SaleSortKey): string | number {
  switch (key) {
    case 'receipt':
      return s.receipt_number || '';
    case 'date':
      return new Date(s.sold_at).getTime() || 0;
    case 'seller':
      return s.seller_name || '';
    case 'pos':
      return s.pos_name || '';
    case 'total':
      return Number(s.total) || 0;
    default:
      return '';
  }
}

export function sortSales<T extends SaleSortable>(
  rows: T[],
  key: SaleSortKey,
  dir: SortDir,
): T[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = valueFor(a, key);
    const vb = valueFor(b, key);
    if (typeof va === 'number' && typeof vb === 'number') {
      if (va === vb) return cmpStr(a.receipt_number, b.receipt_number);
      return va < vb ? -sign : sign;
    }
    const cmp = cmpStr(String(va), String(vb));
    if (cmp !== 0) return sign * cmp;
    return cmpStr(a.receipt_number, b.receipt_number);
  });
}

export function nextSaleSort(
  currentKey: SaleSortKey,
  currentDir: SortDir,
  nextKey: SaleSortKey,
): { key: SaleSortKey; dir: SortDir } {
  if (currentKey === nextKey) {
    return { key: nextKey, dir: currentDir === 'asc' ? 'desc' : 'asc' };
  }
  if (nextKey === 'date' || nextKey === 'total') {
    return { key: nextKey, dir: 'desc' };
  }
  return { key: nextKey, dir: 'asc' };
}
