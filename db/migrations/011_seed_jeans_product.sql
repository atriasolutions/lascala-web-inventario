-- 011 seed producto jeans ejemplo (idempotente) — POS / búsqueda
-- Código interno: LS-JEANS-001 | foto: /brand/fashion-jeans.jpg | stock Calama

INSERT INTO products (
  id,
  organization_id,
  category_id,
  internal_code,
  barcode,
  name,
  description,
  brand,
  size_label,
  color,
  product_type,
  cost_price,
  sale_price,
  status,
  allows_exchange,
  allows_return,
  notes,
  created_by
)
SELECT
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  c.id,
  'LS-JEANS-001',
  '7801234567890',
  'Jeans slim azul índigo',
  'Jeans de corte slim, lavado índigo, ideal para vitrina y POS.',
  'L''Scala',
  'M',
  'Azul índigo',
  'jeans',
  14990.00,
  29980.00,
  'available',
  true,
  true,
  'Producto demo seed para búsqueda POS por categoría Jeans.',
  'dddddddd-dddd-dddd-dddd-ddddddddddd1'
FROM categories c
WHERE c.organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND c.slug = 'jeans'
  AND NOT EXISTS (
    SELECT 1 FROM products p
    WHERE p.organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND p.internal_code = 'LS-JEANS-001'
  );

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

INSERT INTO inventory_balances (id, product_id, branch_id, quantity, low_stock_threshold)
SELECT
  'ffffffff-ffff-ffff-ffff-fffffffffff2',
  p.id,
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  5,
  1
FROM products p
WHERE p.organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND p.internal_code = 'LS-JEANS-001'
ON CONFLICT (product_id, branch_id) DO NOTHING;
