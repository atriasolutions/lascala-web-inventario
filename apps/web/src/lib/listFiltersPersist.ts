/** Persistencia ligera de filtros de lista por vista + sucursal. */

function storageKey(view: string, branchId: string) {
  return `lscala.listFilters.${view}.${branchId}`;
}

export function loadListFilters<T extends object>(
  view: string,
  branchId: string | null | undefined,
  defaults: T,
): T {
  if (!branchId) return { ...defaults };
  try {
    const raw = localStorage.getItem(storageKey(view, branchId));
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...defaults };
    return { ...defaults, ...(parsed as Partial<T>) };
  } catch {
    return { ...defaults };
  }
}

export function saveListFilters<T extends object>(
  view: string,
  branchId: string | null | undefined,
  filters: T,
): void {
  if (!branchId) return;
  try {
    localStorage.setItem(storageKey(view, branchId), JSON.stringify(filters));
  } catch {
    /* quota */
  }
}
