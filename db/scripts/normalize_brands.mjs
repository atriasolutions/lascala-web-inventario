#!/usr/bin/env node
/**
 * Normaliza marcas de products → tabla brands + brand_id.
 *
 * - UPPERCASE + colapsa espacios
 * - Merge typos (YEANS→JEANS, etc.)
 * - Crea filas en brands; setea products.brand_id
 * - Sincroniza products.brand al nombre canónico
 *
 * NUNCA borra productos ni toca inventory_balances / stock.
 *
 * Uso:
 *   node db/scripts/normalize_brands.mjs --dry-run
 *   node db/scripts/normalize_brands.mjs --apply
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');

if (!DRY_RUN && !APPLY) {
  console.error('Indica --dry-run o --apply');
  process.exit(1);
}
if (DRY_RUN && APPLY) {
  console.error('Usa solo uno: --dry-run o --apply');
  process.exit(1);
}

/** @type {Record<string, string>} */
const BRAND_TYPO_MAP = {
  YEANS: 'JEANS',
  YEAN: 'JEANS',
  JEAN: 'JEANS',
  JENS: 'JEANS',
  JEENS: 'JEANS',
  DIVINEJEANS: 'DIVINE JEANS',
  'DIVINE JEAN': 'DIVINE JEANS',
  'DIVNE JEANS': 'DIVINE JEANS',
  'DIVIN JEANS': 'DIVINE JEANS',
  ZARRA: 'ZARA',
  HM: 'H&M',
  'H AND M': 'H&M',
  NICOPOLI: 'NICOPOLY',
  NIKOPOLY: 'NICOPOLY',
};

function normalizeBrandName(raw) {
  if (raw == null) return null;
  const trimmed = String(raw).trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  const compact = upper.replace(/\s+/g, '');
  if (BRAND_TYPO_MAP[upper]) return BRAND_TYPO_MAP[upper];
  if (BRAND_TYPO_MAP[compact]) return BRAND_TYPO_MAP[compact];
  return upper;
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const cols = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'products' AND column_name = 'brand_id'`,
    );
    if (!cols.rows[0]) {
      console.error('Falta products.brand_id. Corre: npm run db:migrate (032_brands.sql)');
      process.exit(1);
    }

    const products = await client.query(
      `SELECT id, organization_id, brand, brand_id
       FROM products
       WHERE brand IS NOT NULL AND TRIM(brand) <> ''
       ORDER BY organization_id, brand`,
    );

    /** @type {Map<string, Map<string, { productIds: string[], rawSamples: Set<string> }>>} */
    const byOrg = new Map();
    let emptySkip = 0;

    for (const row of products.rows) {
      const canonical = normalizeBrandName(row.brand);
      if (!canonical) {
        emptySkip += 1;
        continue;
      }
      if (!byOrg.has(row.organization_id)) byOrg.set(row.organization_id, new Map());
      const map = byOrg.get(row.organization_id);
      if (!map.has(canonical)) {
        map.set(canonical, { productIds: [], rawSamples: new Set() });
      }
      const entry = map.get(canonical);
      entry.productIds.push(row.id);
      entry.rawSamples.add(String(row.brand).trim());
    }

    console.log(`Modo: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
    console.log(`Productos con brand texto: ${products.rows.length}`);
    console.log(`Omitidos (vacíos tras norm): ${emptySkip}`);

    let brandsCreated = 0;
    let productsUpdated = 0;
    const mergeReport = [];

    if (!DRY_RUN) await client.query('BEGIN');

    for (const [orgId, brands] of byOrg) {
      for (const [canonical, entry] of brands) {
        const raws = [...entry.rawSamples].sort();
        const merged = raws.some((r) => normalizeBrandName(r) !== String(r).trim().toUpperCase().replace(/\s+/g, ' '));
        if (raws.length > 1 || merged) {
          mergeReport.push({ orgId, canonical, from: raws, count: entry.productIds.length });
        }

        let brandId;
        if (DRY_RUN) {
          const existing = await client.query(
            `SELECT id FROM brands WHERE organization_id = $1 AND name = $2`,
            [orgId, canonical],
          );
          brandId = existing.rows[0]?.id ?? `(nuevo) ${canonical}`;
          if (!existing.rows[0]) brandsCreated += 1;
        } else {
          const upsert = await client.query(
            `INSERT INTO brands (organization_id, name)
             VALUES ($1, $2)
             ON CONFLICT (organization_id, name) DO UPDATE SET name = EXCLUDED.name
             RETURNING id`,
            [orgId, canonical],
          );
          brandId = upsert.rows[0].id;
          brandsCreated += 1; // cuenta upserts; OK para resumen
          const upd = await client.query(
            `UPDATE products
             SET brand_id = $1,
                 brand = $2,
                 updated_at = now()
             WHERE id = ANY($3::uuid[])
               AND (
                 brand_id IS DISTINCT FROM $1
                 OR brand IS DISTINCT FROM $2
               )`,
            [brandId, canonical, entry.productIds],
          );
          productsUpdated += upd.rowCount ?? 0;
        }

        console.log(
          `  [${canonical}] ← ${raws.join(' | ')} · ${entry.productIds.length} producto(s) → ${brandId}`,
        );
      }
    }

    if (!DRY_RUN) {
      await client.query('COMMIT');
      console.log(`\nMarcas upsert: ${brandsCreated} operaciones`);
      console.log(`Productos actualizados: ${productsUpdated}`);
    } else {
      console.log(`\nMarcas nuevas estimadas: ${brandsCreated}`);
      console.log(`Productos a vincular: ${[...byOrg.values()].reduce((n, m) => n + [...m.values()].reduce((a, e) => a + e.productIds.length, 0), 0)}`);
    }

    if (mergeReport.length) {
      console.log('\nMerges / typos detectados:');
      for (const m of mergeReport) {
        console.log(`  ${m.canonical}: ${m.from.join(' + ')} (${m.count})`);
      }
    }

    console.log('\nListo. Stock / inventory_balances no tocados.');
  } catch (e) {
    if (!DRY_RUN) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
    }
    console.error(e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
