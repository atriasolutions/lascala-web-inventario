export type MovementSortKey = 'date' | 'type' | 'product' | 'delta' | 'after' | 'user';
export type SortDir = 'asc' | 'desc';

export type MovementSortable = {
  created_at: string;
  type_label?: string;
  movement_type: string;
  product_name: string;
  internal_code: string;
  quantity_delta: number;
  quantity_after: number;
  created_by_name: string | null;
  reason_label?: string;
};

function cmpStr(a: string, b: string) {
  return a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true });
}

function valueFor(m: MovementSortable, key: MovementSortKey): string | number {
  switch (key) {
    case 'date':
      return new Date(m.created_at).getTime() || 0;
    case 'type':
      return m.type_label || m.movement_type || '';
    case 'product':
      return m.product_name || '';
    case 'delta':
      return Number(m.quantity_delta) || 0;
    case 'after':
      return Number(m.quantity_after) || 0;
    case 'user':
      return m.created_by_name || '';
    default:
      return '';
  }
}

export function sortMovements<T extends MovementSortable>(
  rows: T[],
  key: MovementSortKey,
  dir: SortDir,
): T[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = valueFor(a, key);
    const vb = valueFor(b, key);
    if (typeof va === 'number' && typeof vb === 'number') {
      if (va === vb) return cmpStr(a.product_name, b.product_name);
      return va < vb ? -sign : sign;
    }
    const cmp = cmpStr(String(va), String(vb));
    if (cmp !== 0) return sign * cmp;
    return cmpStr(a.product_name, b.product_name);
  });
}

export function nextMovementSort(
  currentKey: MovementSortKey,
  currentDir: SortDir,
  nextKey: MovementSortKey,
): { key: MovementSortKey; dir: SortDir } {
  if (currentKey === nextKey) {
    return { key: nextKey, dir: currentDir === 'asc' ? 'desc' : 'asc' };
  }
  if (nextKey === 'date' || nextKey === 'delta' || nextKey === 'after') {
    return { key: nextKey, dir: 'desc' };
  }
  return { key: nextKey, dir: 'asc' };
}
