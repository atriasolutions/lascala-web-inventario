-- 021 Unificar identificador de prenda: barcode = internal_code (serie LS-…).
-- Las ventas siguen por product_id; solo cambia el string de barras.
-- Idempotente.

UPDATE products
SET barcode = internal_code,
    updated_at = now()
WHERE internal_code IS NOT NULL
  AND internal_code <> ''
  AND barcode IS DISTINCT FROM internal_code;

-- Foto del jeans seed: fashion-jeans.jpg no existía en public/brand.
UPDATE product_photos ph
SET url = '/brand/demo-ls-100004.png'
FROM products p
WHERE ph.product_id = p.id
  AND p.organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND p.internal_code = 'LS-JEANS-001'
  AND ph.url IS DISTINCT FROM '/brand/demo-ls-100004.png';

COMMENT ON COLUMN products.barcode IS
  'Mismo valor que internal_code (LS-…). Código de etiqueta y pistola.';
