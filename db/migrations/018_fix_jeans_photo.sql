-- 018 fix foto seed jeans (idempotente)
-- LS-JEANS-001 tenía /uploads/x.jpg (404). Apunta al asset real en public/brand.

UPDATE product_photos ph
SET url = '/brand/fashion-jeans.jpg'
FROM products p
WHERE ph.product_id = p.id
  AND p.organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND p.internal_code = 'LS-JEANS-001'
  AND ph.url IS DISTINCT FROM '/brand/fashion-jeans.jpg';

-- Si no hay fila de foto (seed parcial), insertar el asset demo.
INSERT INTO product_photos (id, product_id, url, sort_order)
SELECT
  'ffffffff-ffff-ffff-ffff-fffffffffff1',
  p.id,
  '/brand/fashion-jeans.jpg',
  0
FROM products p
WHERE p.organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND p.internal_code = 'LS-JEANS-001'
  AND NOT EXISTS (
    SELECT 1 FROM product_photos ph WHERE ph.product_id = p.id
  );
