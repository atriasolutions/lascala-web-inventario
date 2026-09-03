import type { PoolClient } from 'pg';
import { query } from '../db/pool.js';
import { HttpError } from '../utils/errors.js';

/**
 * Typos frecuentes → nombre canónico UPPER.
 * El script de normalización y el upsert de API usan las mismas reglas.
 */
export const BRAND_TYPO_MAP: Record<string, string> = {
  YEANS: 'JEANS',
  YEAN: 'JEANS',
  JEAN: 'JEANS',
  JENS: 'JEANS',
  JEENS: 'JEANS',
  DIVINEJEANS: 'DIVINE JEANS',
  'DIVINE JEAN': 'DIVINE JEANS',
  'DIVNE JEANS': 'DIVINE JEANS',
  'DIVIN JEANS': 'DIVINE JEANS',
  ZARA: 'ZARA',
  ZARRA: 'ZARA',
  'H&M': 'H&M',
  HM: 'H&M',
  'H AND M': 'H&M',
  NICOPOLY: 'NICOPOLY',
  NICOPOLI: 'NICOPOLY',
  NIKOPOLY: 'NICOPOLY',
};

/** Normaliza marca a UPPER (trim, colapsa espacios). Vacío → null. */
export function normalizeBrandName(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  const compact = upper.replace(/\s+/g, '');
  if (BRAND_TYPO_MAP[upper]) return BRAND_TYPO_MAP[upper];
  if (BRAND_TYPO_MAP[compact]) return BRAND_TYPO_MAP[compact];
  return upper;
}

type Queryable = {
  query: <T extends import('pg').QueryResultRow = import('pg').QueryResultRow>(
    text: string,
    params?: unknown[],
  ) => Promise<import('pg').QueryResult<T>>;
};

function db(client?: PoolClient): Queryable {
  return client ?? { query };
}

/** Upsert por (organization_id, name UNIQUE). name ya debe venir normalizado. */
export async function upsertBrand(
  organizationId: string,
  canonicalName: string,
  client?: PoolClient,
): Promise<{ id: string; name: string }> {
  const name = normalizeBrandName(canonicalName);
  if (!name) throw new HttpError(400, 'Indica el nombre de la marca');
  const q = db(client);
  const res = await q.query<{ id: string; name: string }>(
    `INSERT INTO brands (organization_id, name)
     VALUES ($1, $2)
     ON CONFLICT (organization_id, name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, name`,
    [organizationId, name],
  );
  return res.rows[0];
}

export async function getBrandById(
  organizationId: string,
  brandId: string,
  client?: PoolClient,
): Promise<{ id: string; name: string } | null> {
  const q = db(client);
  const res = await q.query<{ id: string; name: string }>(
    `SELECT id, name FROM brands WHERE id = $1 AND organization_id = $2`,
    [brandId, organizationId],
  );
  return res.rows[0] ?? null;
}

/**
 * Cutover: acepta brandId y/o brand string.
 * - brandId gana si es válido.
 * - string → UPPER + typo map + upsert.
 * - ambos vacíos → { brandId: null, brand: null } (limpia marca).
 */
export async function resolveBrandInput(params: {
  organizationId: string;
  brandId?: string | null;
  brand?: string | null;
  /** Si false y ambos omitidos, no cambia (undefined). */
  clearing?: boolean;
  client?: PoolClient;
}): Promise<{ brandId: string | null; brand: string | null } | undefined> {
  const hasId = params.brandId !== undefined;
  const hasStr = params.brand !== undefined;
  if (!hasId && !hasStr) return undefined;

  if (hasId && params.brandId) {
    const row = await getBrandById(params.organizationId, params.brandId, params.client);
    if (!row) throw new HttpError(404, 'Marca no encontrada');
    return { brandId: row.id, brand: row.name };
  }

  if (hasStr) {
    const name = normalizeBrandName(params.brand);
    if (!name) return { brandId: null, brand: null };
    const row = await upsertBrand(params.organizationId, name, params.client);
    return { brandId: row.id, brand: row.name };
  }

  // brandId explícitamente null (sin string) → limpia
  if (hasId && params.brandId == null) {
    return { brandId: null, brand: null };
  }

  return { brandId: null, brand: null };
}
