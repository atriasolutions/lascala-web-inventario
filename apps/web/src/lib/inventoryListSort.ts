export type InventorySortKey = 'name' | 'code' | 'stock' | 'sale' | 'value';
export type SortDir = 'asc' | 'desc';

export type InventoryBalanceSortable = {
  name: string;
  internal_code: string;
  quantity: number | string;
  sale_price: string | number;
};

function cmpStr(a: string, b: string) {
  return a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true });
}

function qty(b: InventoryBalanceSortable) {
  return Number(b.quantity) || 0;
}

function sale(b: InventoryBalanceSortable) {
  return Number(b.sale_price) || 0;
}

function valueFor(b: InventoryBalanceSortable, key: InventorySortKey): string | number {
  switch (key) {
    case 'name':
      return b.name || '';
    case 'code':
      return b.internal_code || '';
    case 'stock':
      return qty(b);
    case 'sale':
      return sale(b);
    case 'value':
      return qty(b) * sale(b);
    default:
      return '';
  }
}

export function sortBalances<T extends InventoryBalanceSortable>(
  rows: T[],
  key: InventorySortKey,
  dir: SortDir,
): T[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = valueFor(a, key);
    const vb = valueFor(b, key);
    if (typeof va === 'number' && typeof vb === 'number') {
      if (va === vb) return cmpStr(a.name, b.name);
      return va < vb ? -sign : sign;
    }
    const cmp = cmpStr(String(va), String(vb));
    if (cmp !== 0) return sign * cmp;
    return cmpStr(a.name, b.name);
  });
}

export function nextInventorySort(
  currentKey: InventorySortKey,
  currentDir: SortDir,
  nextKey: InventorySortKey,
): { key: InventorySortKey; dir: SortDir } {
  if (currentKey === nextKey) {
    return { key: nextKey, dir: currentDir === 'asc' ? 'desc' : 'asc' };
  }
  if (nextKey === 'stock' || nextKey === 'sale' || nextKey === 'value') {
    return { key: nextKey, dir: 'desc' };
  }
  return { key: nextKey, dir: 'asc' };
}

export function inventoryAriaSort(
  activeKey: InventorySortKey,
  dir: SortDir,
  column: InventorySortKey,
): 'ascending' | 'descending' | 'none' {
  if (activeKey !== column) return 'none';
  return dir === 'asc' ? 'ascending' : 'descending';
}
