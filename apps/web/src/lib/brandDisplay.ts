/** Preferir nombre canónico de API; fallback a texto legado. */
export function brandLabel(row: {
  brand_name?: string | null;
  brand?: string | null;
}): string {
  const name = (row.brand_name || row.brand || '').trim();
  return name;
}
