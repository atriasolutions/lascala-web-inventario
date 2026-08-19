export type ExpenseSortKey = 'date' | 'category' | 'description' | 'amount' | 'user';
export type SortDir = 'asc' | 'desc';

export type ExpenseRow = {
  incurred_on: string;
  category: string;
  description: string;
  amount: number | string;
  created_by_name: string | null;
};

function cmpStr(a: string, b: string) {
  return a.localeCompare(b, 'es', { sensitivity: 'base' });
}

function dirMul(dir: SortDir) {
  return dir === 'asc' ? 1 : -1;
}

export function nextExpenseSort(
  key: ExpenseSortKey,
  dir: SortDir,
  column: ExpenseSortKey,
): { key: ExpenseSortKey; dir: SortDir } {
  if (key === column) return { key, dir: dir === 'asc' ? 'desc' : 'asc' };
  return { key: column, dir: column === 'date' || column === 'amount' ? 'desc' : 'asc' };
}

export function sortExpenses<T extends ExpenseRow>(
  rows: T[],
  key: ExpenseSortKey,
  dir: SortDir,
): T[] {
  const m = dirMul(dir);
  return [...rows].sort((a, b) => {
    switch (key) {
      case 'date':
        return m * cmpStr(String(a.incurred_on), String(b.incurred_on));
      case 'category':
        return m * cmpStr(a.category, b.category);
      case 'description':
        return m * cmpStr(a.description, b.description);
      case 'amount':
        return m * ((Number(a.amount) || 0) - (Number(b.amount) || 0));
      case 'user':
        return m * cmpStr(a.created_by_name || '', b.created_by_name || '');
      default:
        return 0;
    }
  });
}
