export type MermaSortKey = 'date' | 'product' | 'qty' | 'reason' | 'user' | 'cost';
export type VoucherSortKey = 'expires' | 'issued' | 'number' | 'product' | 'status';
export type SortDir = 'asc' | 'desc';

export type MermaRow = {
  created_at: string;
  product_name: string;
  internal_code: string;
  quantity: number | string;
  reason: string;
  created_by_name: string | null;
  cost_impact: number | string | null;
};

export type VoucherRow = {
  expires_at: string;
  issued_at: string;
  voucher_number: string;
  product_name: string;
  status: string;
};

function cmpStr(a: string, b: string) {
  return a.localeCompare(b, 'es', { sensitivity: 'base' });
}

function dirMul(dir: SortDir) {
  return dir === 'asc' ? 1 : -1;
}

export function nextMermaSort(
  key: MermaSortKey,
  dir: SortDir,
  column: MermaSortKey,
): { key: MermaSortKey; dir: SortDir } {
  if (key === column) return { key, dir: dir === 'asc' ? 'desc' : 'asc' };
  return { key: column, dir: column === 'date' ? 'desc' : 'asc' };
}

export function nextVoucherSort(
  key: VoucherSortKey,
  dir: SortDir,
  column: VoucherSortKey,
): { key: VoucherSortKey; dir: SortDir } {
  if (key === column) return { key, dir: dir === 'asc' ? 'desc' : 'asc' };
  return { key: column, dir: column === 'expires' || column === 'issued' ? 'asc' : 'asc' };
}

export function sortMermas<T extends MermaRow>(rows: T[], key: MermaSortKey, dir: SortDir): T[] {
  const m = dirMul(dir);
  return [...rows].sort((a, b) => {
    switch (key) {
      case 'date':
        return m * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      case 'product':
        return m * cmpStr(a.product_name, b.product_name);
      case 'qty':
        return m * ((Number(a.quantity) || 0) - (Number(b.quantity) || 0));
      case 'reason':
        return m * cmpStr(a.reason, b.reason);
      case 'user':
        return m * cmpStr(a.created_by_name || '', b.created_by_name || '');
      case 'cost':
        return m * ((Number(a.cost_impact) || 0) - (Number(b.cost_impact) || 0));
      default:
        return 0;
    }
  });
}

export function sortVouchers<T extends VoucherRow>(
  rows: T[],
  key: VoucherSortKey,
  dir: SortDir,
): T[] {
  const m = dirMul(dir);
  return [...rows].sort((a, b) => {
    switch (key) {
      case 'expires':
        return m * cmpStr(String(a.expires_at), String(b.expires_at));
      case 'issued':
        return m * cmpStr(String(a.issued_at), String(b.issued_at));
      case 'number':
        return m * cmpStr(a.voucher_number, b.voucher_number);
      case 'product':
        return m * cmpStr(a.product_name, b.product_name);
      case 'status':
        return m * cmpStr(a.status, b.status);
      default:
        return 0;
    }
  });
}
