-- Datos de demostración Boutique L'Scala (Calama)
-- Período: junio 2026 → 17 agosto 2026 (America/Santiago)
--
-- Idempotente para el set DEMO:
--   prendas LS1000xx, ingresos d2000000-…, boletas VD…, gastos d4000000-…
-- No borra admin / vendedora seed. Puede archivar prendas con nombre QA.
--
-- Uso: npm run db:seed:demo

BEGIN;

SELECT set_config('TIMEZONE', 'UTC', true);

-- Unificar códigos en filas actuales (también cubierto por 021).
UPDATE products
SET barcode = internal_code, updated_at = now()
WHERE internal_code IS NOT NULL
  AND internal_code <> ''
  AND barcode IS DISTINCT FROM internal_code;

-- Caja 2 + vendedora de piso (login: camila@lscala.cl / Vendedor123!)
-- Encargada: encargada@lscala.cl / Vendedor123! (si no vino en 010)
INSERT INTO pos_terminals (id, branch_id, code, name, status)
VALUES (
  'cccccccc-cccc-cccc-cccc-ccccccccccc2',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'CAJA2',
  'Caja 2',
  'active'
)
ON CONFLICT (branch_id, code) DO NOTHING;

INSERT INTO users (id, organization_id, email, password_hash, full_name)
VALUES (
  'dddddddd-dddd-dddd-dddd-ddddddddddd3',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'camila@lscala.cl',
  '$2b$10$IGJHrZ7wgaOlNN.sFmPA.ebBrh2us4wfr.A3AamLneE6GwWIOVbWe',
  'Camila Soto'
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO user_branches (user_id, branch_id, role)
SELECT u.id, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'seller'
FROM users u
WHERE u.email = 'camila@lscala.cl'
ON CONFLICT (user_id, branch_id) DO NOTHING;

INSERT INTO users (id, organization_id, email, password_hash, full_name)
VALUES (
  'dddddddd-dddd-dddd-dddd-ddddddddddd4',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'encargada@lscala.cl',
  '$2b$10$IGJHrZ7wgaOlNN.sFmPA.ebBrh2us4wfr.A3AamLneE6GwWIOVbWe',
  'Encargada L''Scala'
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO user_branches (user_id, branch_id, role)
SELECT u.id, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'branch_manager'
FROM users u
WHERE u.email = 'encargada@lscala.cl'
ON CONFLICT (user_id, branch_id) DO UPDATE SET role = EXCLUDED.role;

-- Vendedoras de piso: solo Caja 1 (Caja 2 existe, la propietaria la ve).
INSERT INTO user_pos (user_id, pos_id)
SELECT u.id, 'cccccccc-cccc-cccc-cccc-cccccccccccc'
FROM users u
WHERE u.email IN ('camila@lscala.cl', 'vendedor@lscala.cl')
ON CONFLICT (user_id, pos_id) DO NOTHING;

DELETE FROM user_pos up
USING users u
WHERE up.user_id = u.id
  AND u.email IN ('camila@lscala.cl', 'vendedor@lscala.cl')
  AND up.pos_id <> 'cccccccc-cccc-cccc-cccc-cccccccccccc';

INSERT INTO user_pos (user_id, pos_id)
SELECT u.id, p.id
FROM users u
CROSS JOIN pos_terminals p
WHERE u.email = 'encargada@lscala.cl'
  AND p.branch_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
ON CONFLICT (user_id, pos_id) DO NOTHING;

INSERT INTO suppliers (id, organization_id, name, contact_name, phone, notes)
VALUES (
  'd3000000-0000-4000-a000-000000000001',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Moda Andina SpA',
  'Patricia Núñez',
  '+56 9 8765 4321',
  'Proveedora habitual: vestidos de fiesta y denim'
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    contact_name = EXCLUDED.contact_name,
    phone = EXCLUDED.phone,
    notes = EXCLUDED.notes,
    updated_at = now();

-- Archivar nombres y códigos de prueba (no borra filas ni ventas históricas).
UPDATE products
SET status = 'archived', updated_at = now()
WHERE organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND internal_code !~ '^LS1000'
  AND (
    internal_code ~ '^LS-000'
    OR name ILIKE '%QA%'
    OR name ILIKE '%partial%'
    OR name ILIKE '%CREATED%'
    OR name ILIKE 'Shape'
    OR name ILIKE '%Exclusive Test%'
    OR name ILIKE 'test %'
    OR name ILIKE '% test'
  );

-- Quitar set demo anterior (orden FKs).
DELETE FROM exchange_returns
WHERE original_product_id IN (SELECT id FROM products WHERE internal_code ~ '^LS1000')
   OR new_product_id IN (SELECT id FROM products WHERE internal_code ~ '^LS1000')
   OR voucher_id IN (
     SELECT id FROM change_vouchers
     WHERE product_id IN (SELECT id FROM products WHERE internal_code ~ '^LS1000')
        OR sale_id IN (SELECT id FROM sales WHERE receipt_number LIKE 'VD%')
   );

DELETE FROM change_vouchers
WHERE product_id IN (SELECT id FROM products WHERE internal_code ~ '^LS1000')
   OR sale_id IN (SELECT id FROM sales WHERE receipt_number LIKE 'VD%');

DELETE FROM sale_items
WHERE sale_id IN (
    SELECT id FROM sales
    WHERE organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND receipt_number LIKE 'VD%'
  )
  OR product_id IN (
    SELECT id FROM products
    WHERE organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND internal_code ~ '^LS1000'
  );

DELETE FROM sales
WHERE organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND receipt_number LIKE 'VD%';

DELETE FROM mermas
WHERE product_id IN (SELECT id FROM products WHERE internal_code ~ '^LS1000')
   OR id IN (
     'd6000000-0000-4000-a000-000000000001'::uuid,
     'd6000000-0000-4000-a000-000000000002'::uuid
   );

DELETE FROM inventory_movements
WHERE product_id IN (SELECT id FROM products WHERE internal_code ~ '^LS1000');

DELETE FROM expenses
WHERE id::text LIKE 'd4000000-%';

DELETE FROM purchase_items
WHERE purchase_id IN (
  'd2000000-0000-4000-a000-000000000001'::uuid,
  'd2000000-0000-4000-a000-000000000002'::uuid
);

DELETE FROM purchases
WHERE id IN (
  'd2000000-0000-4000-a000-000000000001'::uuid,
  'd2000000-0000-4000-a000-000000000002'::uuid
);

DELETE FROM product_photos
WHERE product_id IN (SELECT id FROM products WHERE internal_code ~ '^LS1000');

DELETE FROM inventory_balances
WHERE product_id IN (SELECT id FROM products WHERE internal_code ~ '^LS1000');

DELETE FROM products
WHERE organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND internal_code ~ '^LS1000';

-- Catálogo (~16 prendas). barcode = internal_code.
INSERT INTO products (
  id, organization_id, category_id, internal_code, barcode, name, description, brand,
  size_label, color, product_type, season, cost_price, sale_price, status,
  allows_exchange, allows_return, tracks_stock, low_stock_threshold, no_movement_alert_days,
  created_by
)
SELECT v.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', c.id, v.code, v.code, v.name, v.descr,
       'L''Scala', v.size_label, v.color, v.ptype, '2026', v.cost, v.sale, 'available',
       v.exch, v.exch, true, v.low, v.nomov,
       'dddddddd-dddd-dddd-dddd-ddddddddddd1'
FROM (VALUES
  ('d1000000-0000-4000-a000-000000000001'::uuid, 'LS100001', 'vestidos-fiesta',
   'Vestido de fiesta sirena negro', 'Corte sirena, encaje en busto. Sin cambios.',
   'M', 'Negro', 'vestido', 44990.00, 89980.00, false, 2, NULL::int),
  ('d1000000-0000-4000-a000-000000000002'::uuid, 'LS100002', 'vestidos-fiesta',
   'Vestido cocktail rosa palo', 'Midi de fiesta, satín. Sin cambios.',
   'S', 'Rosa palo', 'vestido', 28990.00, 57980.00, false, 2, NULL),
  ('d1000000-0000-4000-a000-000000000003'::uuid, 'LS100003', 'vestidos-fiesta',
   'Vestido de fiesta off-shoulder vino', 'Hombro descubierto, cola corta. Sin cambios.',
   'L', 'Vino', 'vestido', 39990.00, 79980.00, false, 2, 30),
  ('d1000000-0000-4000-a000-000000000004'::uuid, 'LS100004', 'jeans',
   'Jeans skinny azul índigo', 'Tiro medio, elastano, lavado índigo.',
   'M', 'Azul índigo', 'jeans', 14990.00, 29980.00, true, 3, NULL),
  ('d1000000-0000-4000-a000-000000000005'::uuid, 'LS100005', 'jeans',
   'Jeans wide leg negro', 'Palo ancho, pretina alta.',
   'L', 'Negro', 'jeans', 15990.00, 31980.00, true, 2, NULL),
  ('d1000000-0000-4000-a000-000000000006'::uuid, 'LS100006', 'ropa-formal',
   'Blusa seda ivory', 'Manga larga, botón cubierto.',
   'S', 'Ivory', 'blusa', 12990.00, 25980.00, true, 2, NULL),
  ('d1000000-0000-4000-a000-000000000007'::uuid, 'LS100007', 'ropa-formal',
   'Blazer sastre camel', 'Solapa clásica, un botón.',
   'M', 'Camel', 'blazer', 24990.00, 49980.00, true, 3, NULL),
  ('d1000000-0000-4000-a000-000000000008'::uuid, 'LS100008', 'ropa-casual',
   'Camisa lino blanca', 'Oversize liviana de verano.',
   'M', 'Blanco', 'camisa', 9990.00, 19980.00, true, 2, NULL),
  ('d1000000-0000-4000-a000-000000000009'::uuid, 'LS100009', 'ropa-casual',
   'Polera crop fucsia', 'Algodón, cuello redondo.',
   'S', 'Fucsia', 'polera', 7990.00, 15980.00, true, 3, NULL),
  ('d1000000-0000-4000-a000-000000000010'::uuid, 'LS100010', 'ropa-formal',
   'Falda midi plisada beige', 'Plisado permanente, elástico oculto.',
   'M', 'Beige', 'falda', 11990.00, 23980.00, true, 2, NULL),
  ('d1000000-0000-4000-a000-000000000011'::uuid, 'LS100011', 'ropa-casual',
   'Enterito denim claro', 'Tirantes regulables, bolsillos.',
   'S', 'Denim claro', 'enterito', 17990.00, 35980.00, true, 2, NULL),
  ('d1000000-0000-4000-a000-000000000012'::uuid, 'LS100012', 'carteras',
   'Cartera baguette negra', 'Cadena removible, cierre imán.',
   'U', 'Negro', 'cartera', 18990.00, 37980.00, true, 2, NULL),
  ('d1000000-0000-4000-a000-000000000013'::uuid, 'LS100013', 'cinturones',
   'Cinturón cuero camel', 'Hebilla dorada, talla M.',
   'M', 'Camel', 'cinturon', 8990.00, 17980.00, true, 2, NULL),
  ('d1000000-0000-4000-a000-000000000014'::uuid, 'LS100014', 'accesorios',
   'Aros aro grande gold', 'Baño oro, cierre clip.',
   'U', 'Dorado', 'aros', 4990.00, 9980.00, true, 2, NULL),
  ('d1000000-0000-4000-a000-000000000015'::uuid, 'LS100015', 'accesorios',
   'Pañuelo seda estampado', 'Estampa floral, 70×70 cm.',
   'U', 'Multicolor', 'pañuelo', 6990.00, 13980.00, true, 2, NULL),
  ('d1000000-0000-4000-a000-000000000016'::uuid, 'LS100016', 'ropa-formal',
   'Top paillette plata', 'Tiras finas, brillo fiesta.',
   'S', 'Plata', 'top', 10990.00, 21980.00, true, 2, NULL)
) AS v(id, code, slug, name, descr, size_label, color, ptype, cost, sale, exch, low, nomov)
JOIN categories c
  ON c.organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND c.slug = v.slug;

INSERT INTO product_photos (product_id, url, sort_order)
SELECT p.id, v.url, 0
FROM (VALUES
  ('LS100001', '/brand/demo-ls-100001.png'),
  ('LS100002', '/brand/demo-ls-100002.png'),
  ('LS100003', '/brand/demo-ls-100003.png'),
  ('LS100004', '/brand/demo-ls-100004.png'),
  ('LS100005', '/brand/demo-ls-100005.png'),
  ('LS100006', '/brand/demo-ls-100006.png'),
  ('LS100007', '/brand/demo-ls-100007.png'),
  ('LS100008', '/brand/demo-ls-100008.png'),
  ('LS100009', '/brand/demo-ls-100009.png'),
  ('LS100010', '/brand/demo-ls-100010.png'),
  ('LS100011', '/brand/demo-ls-100011.png'),
  ('LS100012', '/brand/demo-ls-100012.png'),
  ('LS100013', '/brand/demo-ls-100013.png'),
  ('LS100014', '/brand/demo-ls-100014.png'),
  ('LS100015', '/brand/demo-ls-100015.png'),
  ('LS100016', '/brand/demo-ls-100016.png')
) AS v(code, url)
JOIN products p ON p.internal_code = v.code
  AND p.organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- Ingreso junio (recepción confirmada → stock Calama)
INSERT INTO purchases (
  id, organization_id, destination_branch_id, supplier_id, invoice_number, document_type,
  status, purchased_at, notes, created_by, received_by, received_at, created_at, updated_at
) VALUES (
  'd2000000-0000-4000-a000-000000000001',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'd3000000-0000-4000-a000-000000000001',
  'FAC-2461',
  'factura',
  'received',
  DATE '2026-06-02',
  'Ingreso colección invierno / fiesta',
  'dddddddd-dddd-dddd-dddd-ddddddddddd1',
  'dddddddd-dddd-dddd-dddd-ddddddddddd1',
  TIMESTAMP '2026-06-03 10:30:00' AT TIME ZONE 'America/Santiago',
  TIMESTAMP '2026-06-02 18:00:00' AT TIME ZONE 'America/Santiago',
  TIMESTAMP '2026-06-03 10:30:00' AT TIME ZONE 'America/Santiago'
);

INSERT INTO purchase_items (
  purchase_id, product_id, description, quantity_ordered, quantity_received,
  unit_cost, suggested_sale_price
)
SELECT
  'd2000000-0000-4000-a000-000000000001',
  p.id,
  p.name,
  v.qty,
  v.qty,
  p.cost_price,
  p.sale_price
FROM (VALUES
  ('LS100001', 4), ('LS100002', 3), ('LS100003', 3), ('LS100004', 8),
  ('LS100005', 6), ('LS100006', 5), ('LS100007', 3), ('LS100008', 6),
  ('LS100009', 10), ('LS100010', 4), ('LS100011', 3), ('LS100012', 4),
  ('LS100013', 5), ('LS100014', 8), ('LS100015', 6), ('LS100016', 4)
) AS v(code, qty)
JOIN products p ON p.internal_code = v.code
  AND p.organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- Reposición julio
INSERT INTO purchases (
  id, organization_id, destination_branch_id, supplier_id, invoice_number, document_type,
  status, purchased_at, notes, created_by, received_by, received_at, created_at, updated_at
) VALUES (
  'd2000000-0000-4000-a000-000000000002',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'd3000000-0000-4000-a000-000000000001',
  'FAC-2472',
  'factura',
  'received',
  DATE '2026-07-06',
  'Reposición denim y accesorios',
  'dddddddd-dddd-dddd-dddd-ddddddddddd1',
  'dddddddd-dddd-dddd-dddd-ddddddddddd1',
  TIMESTAMP '2026-07-07 11:00:00' AT TIME ZONE 'America/Santiago',
  TIMESTAMP '2026-07-06 17:30:00' AT TIME ZONE 'America/Santiago',
  TIMESTAMP '2026-07-07 11:00:00' AT TIME ZONE 'America/Santiago'
);

INSERT INTO purchase_items (
  purchase_id, product_id, description, quantity_ordered, quantity_received,
  unit_cost, suggested_sale_price
)
SELECT
  'd2000000-0000-4000-a000-000000000002',
  p.id,
  p.name,
  v.qty,
  v.qty,
  p.cost_price,
  p.sale_price
FROM (VALUES
  ('LS100001', 2), ('LS100002', 2), ('LS100004', 6), ('LS100005', 4),
  ('LS100006', 3), ('LS100007', 2), ('LS100008', 4), ('LS100009', 8),
  ('LS100010', 3), ('LS100011', 2), ('LS100012', 2), ('LS100013', 3),
  ('LS100014', 6), ('LS100015', 4), ('LS100016', 2)
) AS v(code, qty)
JOIN products p ON p.internal_code = v.code
  AND p.organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

INSERT INTO inventory_movements (
  organization_id, branch_id, product_id, movement_type, quantity_delta, quantity_after,
  reference_type, reference_id, notes, created_by, created_at
)
SELECT
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  pi.product_id,
  'PURCHASE_IN',
  pi.quantity_received,
  0,
  'purchase',
  pu.id,
  'Recepción confirmada',
  pu.received_by,
  pu.received_at
FROM purchase_items pi
JOIN purchases pu ON pu.id = pi.purchase_id
WHERE pu.id IN (
  'd2000000-0000-4000-a000-000000000001'::uuid,
  'd2000000-0000-4000-a000-000000000002'::uuid
);

-- Ventas jun–ago (hora local Chile).
CREATE TEMP TABLE demo_tickets (
  receipt TEXT NOT NULL,
  sold_local TIMESTAMP NOT NULL,
  pos_id UUID NOT NULL,
  seller_id UUID NOT NULL,
  code TEXT NOT NULL,
  qty INT NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL
) ON COMMIT DROP;

INSERT INTO demo_tickets (receipt, sold_local, pos_id, seller_id, code, qty, unit_price)
SELECT r, s::timestamp, pos, sel, c, q, p.sale_price
FROM (VALUES
  ('VD000001', '2026-06-04 11:20:00', 1, 2, 'LS100004', 1),
  ('VD000001', '2026-06-04 11:20:00', 1, 2, 'LS100014', 1),
  ('VD000002', '2026-06-05 12:40:00', 1, 1, 'LS100009', 2),
  ('VD000003', '2026-06-06 16:10:00', 2, 3, 'LS100001', 1),
  ('VD000004', '2026-06-07 13:05:00', 1, 2, 'LS100008', 1),
  ('VD000004', '2026-06-07 13:05:00', 1, 2, 'LS100013', 1),
  ('VD000005', '2026-06-10 11:30:00', 1, 2, 'LS100006', 1),
  ('VD000006', '2026-06-11 15:45:00', 2, 3, 'LS100012', 1),
  ('VD000007', '2026-06-12 12:20:00', 1, 1, 'LS100004', 1),
  ('VD000007', '2026-06-12 12:20:00', 1, 1, 'LS100009', 1),
  ('VD000008', '2026-06-12 17:50:00', 1, 2, 'LS100002', 1),
  ('VD000009', '2026-06-13 11:10:00', 1, 2, 'LS100014', 1),
  ('VD000009', '2026-06-13 11:10:00', 1, 2, 'LS100015', 1),
  ('VD000010', '2026-06-13 16:00:00', 2, 3, 'LS100005', 1),
  ('VD000011', '2026-06-14 13:40:00', 1, 2, 'LS100009', 2),
  ('VD000012', '2026-06-16 12:15:00', 1, 1, 'LS100007', 1),
  ('VD000013', '2026-06-18 11:55:00', 1, 2, 'LS100008', 1),
  ('VD000013', '2026-06-18 11:55:00', 1, 2, 'LS100010', 1),
  ('VD000014', '2026-06-19 15:20:00', 2, 3, 'LS100011', 1),
  ('VD000015', '2026-06-20 12:40:00', 1, 2, 'LS100004', 1),
  ('VD000016', '2026-06-21 16:30:00', 1, 2, 'LS100016', 1),
  ('VD000016', '2026-06-21 16:30:00', 1, 2, 'LS100014', 1),
  ('VD000017', '2026-06-24 11:05:00', 2, 3, 'LS100006', 1),
  ('VD000018', '2026-06-26 14:50:00', 1, 2, 'LS100009', 1),
  ('VD000018', '2026-06-26 14:50:00', 1, 2, 'LS100013', 1),
  ('VD000019', '2026-06-28 12:25:00', 1, 1, 'LS100005', 1),
  ('VD000020', '2026-07-02 11:40:00', 1, 2, 'LS100004', 1),
  ('VD000021', '2026-07-03 16:15:00', 2, 3, 'LS100009', 2),
  ('VD000022', '2026-07-04 12:30:00', 1, 2, 'LS100001', 1),
  ('VD000022', '2026-07-04 12:30:00', 1, 2, 'LS100014', 1),
  ('VD000023', '2026-07-08 11:20:00', 1, 1, 'LS100008', 1),
  ('VD000024', '2026-07-09 15:00:00', 1, 2, 'LS100006', 1),
  ('VD000024', '2026-07-09 15:00:00', 1, 2, 'LS100013', 1),
  ('VD000025', '2026-07-10 12:45:00', 2, 3, 'LS100002', 1),
  ('VD000026', '2026-07-11 17:10:00', 1, 2, 'LS100005', 1),
  ('VD000026', '2026-07-11 17:10:00', 1, 2, 'LS100009', 1),
  ('VD000027', '2026-07-13 11:25:00', 1, 2, 'LS100012', 1),
  ('VD000028', '2026-07-14 13:50:00', 1, 1, 'LS100004', 2),
  ('VD000029', '2026-07-15 12:05:00', 2, 3, 'LS100015', 1),
  ('VD000029', '2026-07-15 12:05:00', 2, 3, 'LS100014', 1),
  ('VD000030', '2026-07-16 16:40:00', 1, 2, 'LS100009', 1),
  ('VD000031', '2026-07-17 11:55:00', 1, 2, 'LS100010', 1),
  ('VD000031', '2026-07-17 11:55:00', 1, 2, 'LS100008', 1),
  ('VD000032', '2026-07-18 14:20:00', 2, 3, 'LS100007', 1),
  ('VD000033', '2026-07-20 12:30:00', 1, 2, 'LS100011', 1),
  ('VD000034', '2026-07-21 17:00:00', 1, 2, 'LS100004', 1),
  ('VD000034', '2026-07-21 17:00:00', 1, 2, 'LS100016', 1),
  ('VD000035', '2026-07-22 11:15:00', 2, 3, 'LS100009', 2),
  ('VD000036', '2026-07-24 15:35:00', 1, 1, 'LS100005', 1),
  ('VD000037', '2026-07-25 12:50:00', 1, 2, 'LS100014', 2),
  ('VD000038', '2026-07-28 16:10:00', 1, 2, 'LS100006', 1),
  ('VD000039', '2026-07-30 13:20:00', 2, 3, 'LS100015', 1),
  ('VD000039', '2026-07-30 13:20:00', 2, 3, 'LS100013', 1),
  ('VD000040', '2026-08-01 11:30:00', 1, 2, 'LS100009', 1),
  ('VD000041', '2026-08-04 16:20:00', 2, 3, 'LS100004', 1),
  ('VD000041', '2026-08-04 16:20:00', 2, 3, 'LS100014', 1),
  ('VD000042', '2026-08-05 12:10:00', 1, 2, 'LS100008', 1),
  ('VD000043', '2026-08-07 15:45:00', 1, 1, 'LS100002', 1),
  ('VD000043', '2026-08-07 15:45:00', 1, 1, 'LS100015', 1),
  ('VD000044', '2026-08-08 11:50:00', 1, 2, 'LS100005', 1),
  ('VD000045', '2026-08-10 13:30:00', 2, 3, 'LS100012', 1),
  ('VD000045', '2026-08-10 13:30:00', 2, 3, 'LS100013', 1),
  ('VD000046', '2026-08-11 17:05:00', 1, 2, 'LS100010', 1),
  ('VD000047', '2026-08-12 12:40:00', 1, 2, 'LS100001', 1),
  ('VD000047', '2026-08-12 12:40:00', 1, 2, 'LS100016', 1),
  ('VD000048', '2026-08-13 16:15:00', 2, 3, 'LS100004', 1),
  ('VD000049', '2026-08-14 11:25:00', 1, 2, 'LS100006', 1),
  ('VD000049', '2026-08-14 11:25:00', 1, 2, 'LS100009', 1),
  ('VD000050', '2026-08-15 14:50:00', 1, 1, 'LS100011', 1),
  ('VD000051', '2026-08-16 12:20:00', 1, 2, 'LS100015', 2),
  ('VD000051', '2026-08-16 12:20:00', 1, 2, 'LS100008', 1),
  ('VD000052', '2026-08-17 10:45:00', 1, 2, 'LS100004', 1),
  ('VD000052', '2026-08-17 10:45:00', 1, 2, 'LS100014', 1),
  ('VD000053', '2026-08-17 12:20:00', 2, 3, 'LS100005', 1),
  ('VD000053', '2026-08-17 12:20:00', 2, 3, 'LS100008', 1),
  ('VD000054', '2026-08-17 14:10:00', 1, 2, 'LS100010', 1),
  ('VD000054', '2026-08-17 14:10:00', 1, 2, 'LS100016', 1),
  ('VD000055', '2026-08-17 16:35:00', 1, 1, 'LS100012', 1),
  ('VD000055', '2026-08-17 16:35:00', 1, 1, 'LS100014', 1),
  ('VD000056', '2026-08-17 18:05:00', 1, 2, 'LS100007', 1)
) AS t(r, s, posn, seln, c, q)
JOIN products p ON p.internal_code = t.c
  AND p.organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
CROSS JOIN LATERAL (
  SELECT
    (SELECT pt.id FROM pos_terminals pt
      WHERE pt.branch_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
        AND pt.code = CASE t.posn WHEN 1 THEN 'CAJA1' ELSE 'CAJA2' END
      LIMIT 1) AS pos,
    (SELECT u.id FROM users u
      WHERE u.organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
        AND u.email = CASE t.seln
          WHEN 1 THEN 'admin@lscala.cl'
          WHEN 2 THEN 'vendedor@lscala.cl'
          ELSE 'camila@lscala.cl'
        END
      LIMIT 1) AS sel
) u;

INSERT INTO sales (
  organization_id, branch_id, pos_id, seller_user_id, receipt_number,
  subtotal, discount, total, sold_at, created_at
)
SELECT
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  d.pos_id,
  d.seller_id,
  d.receipt,
  SUM(d.qty * d.unit_price),
  0,
  SUM(d.qty * d.unit_price),
  d.sold_local AT TIME ZONE 'America/Santiago',
  d.sold_local AT TIME ZONE 'America/Santiago'
FROM demo_tickets d
GROUP BY d.receipt, d.pos_id, d.seller_id, d.sold_local;

INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, line_total, created_at)
SELECT
  s.id,
  p.id,
  d.qty,
  d.unit_price,
  d.qty * d.unit_price,
  s.sold_at
FROM demo_tickets d
JOIN sales s
  ON s.organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
 AND s.receipt_number = d.receipt
JOIN products p
  ON p.internal_code = d.code
 AND p.organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- Tickets de cambio (VC…) para prendas elegibles de las ventas demo VD…
INSERT INTO change_vouchers (
  organization_id, branch_id, sale_id, sale_item_id, product_id,
  voucher_number, issued_at, expires_at, conditions, created_by, created_at
)
SELECT
  s.organization_id,
  s.branch_id,
  s.id,
  si.id,
  si.product_id,
  'VC' || LPAD((
    (
      SELECT COALESCE(MAX(
        CASE WHEN cv.voucher_number ~ '^VC-?[0-9]+$'
          THEN SUBSTRING(cv.voucher_number FROM '[0-9]+$')::int
        END
      ), 0)
      FROM change_vouchers cv
      WHERE cv.organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    )
    + ROW_NUMBER() OVER (ORDER BY s.receipt_number, si.id)
  )::text, 6, '0'),
  (timezone('America/Santiago', s.sold_at))::date,
  (timezone('America/Santiago', s.sold_at))::date + 7,
  'No se aceptan prendas manchadas, con olor a cigarro o dañadas. Vestidos de fiesta no admiten cambios.',
  s.seller_user_id,
  s.sold_at
FROM sale_items si
JOIN sales s ON s.id = si.sale_id
JOIN products p ON p.id = si.product_id
WHERE s.receipt_number LIKE 'VD%'
  AND (p.allows_exchange OR p.allows_return)
  AND NOT EXISTS (SELECT 1 FROM change_vouchers v WHERE v.sale_item_id = si.id);

INSERT INTO inventory_movements (
  organization_id, branch_id, product_id, movement_type, quantity_delta, quantity_after,
  reference_type, reference_id, notes, created_by, created_at
)
SELECT
  s.organization_id,
  s.branch_id,
  si.product_id,
  'SALE_OUT',
  -si.quantity,
  0,
  'sale',
  s.id,
  'Venta ' || s.receipt_number,
  s.seller_user_id,
  s.sold_at
FROM sale_items si
JOIN sales s ON s.id = si.sale_id
WHERE s.receipt_number LIKE 'VD%';

INSERT INTO mermas (
  id, organization_id, branch_id, product_id, quantity, reason, cost_impact, created_by, created_at
)
SELECT
  'd6000000-0000-4000-a000-000000000001'::uuid,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  p.id, 1, 'Costura abierta en bastilla', p.cost_price,
  'dddddddd-dddd-dddd-dddd-ddddddddddd1'::uuid,
  TIMESTAMP '2026-07-27 10:15:00' AT TIME ZONE 'America/Santiago'
FROM products p WHERE p.internal_code = 'LS100004';

INSERT INTO mermas (
  id, organization_id, branch_id, product_id, quantity, reason, cost_impact, created_by, created_at
)
SELECT
  'd6000000-0000-4000-a000-000000000002'::uuid,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  p.id, 1, 'Mancha de maquillaje en delantero', p.cost_price,
  'dddddddd-dddd-dddd-dddd-ddddddddddd2'::uuid,
  TIMESTAMP '2026-07-27 10:40:00' AT TIME ZONE 'America/Santiago'
FROM products p WHERE p.internal_code = 'LS100009';

INSERT INTO inventory_movements (
  organization_id, branch_id, product_id, movement_type, quantity_delta, quantity_after,
  reference_type, reference_id, notes, created_by, created_at
)
SELECT
  m.organization_id, m.branch_id, m.product_id, 'MERMA_OUT', -m.quantity, 0,
  'merma', m.id, m.reason, m.created_by, m.created_at
FROM mermas m
WHERE m.id IN (
  'd6000000-0000-4000-a000-000000000001'::uuid,
  'd6000000-0000-4000-a000-000000000002'::uuid
);

-- Recalcular quantity_after y saldos de sucursal.
UPDATE inventory_movements im
SET quantity_after = x.running
FROM (
  SELECT
    id,
    SUM(quantity_delta) OVER (
      PARTITION BY product_id, branch_id
      ORDER BY created_at, id
    ) AS running
  FROM inventory_movements
  WHERE product_id IN (SELECT id FROM products WHERE internal_code ~ '^LS1000')
) x
WHERE im.id = x.id;

INSERT INTO inventory_balances (product_id, branch_id, quantity, low_stock_threshold, updated_at)
SELECT
  p.id,
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  COALESCE((
    SELECT im.quantity_after
    FROM inventory_movements im
    WHERE im.product_id = p.id
      AND im.branch_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    ORDER BY im.created_at DESC, im.id DESC
    LIMIT 1
  ), 0),
  p.low_stock_threshold,
  now()
FROM products p
WHERE p.internal_code ~ '^LS1000';

-- Gastos del local (fecha civil Chile).
INSERT INTO expenses (
  id, organization_id, branch_id, category, description, amount, incurred_on, created_by, created_at
) VALUES
  ('d4000000-0000-4000-a000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Arriendo', 'Arriendo local Calama — junio', 450000, DATE '2026-06-05',
   'dddddddd-dddd-dddd-dddd-ddddddddddd1', TIMESTAMP '2026-06-05 09:30:00' AT TIME ZONE 'America/Santiago'),
  ('d4000000-0000-4000-a000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Servicios básicos', 'Luz y agua boutique — junio', 89000, DATE '2026-06-08',
   'dddddddd-dddd-dddd-dddd-ddddddddddd1', TIMESTAMP '2026-06-08 10:00:00' AT TIME ZONE 'America/Santiago'),
  ('d4000000-0000-4000-a000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Remuneraciones', 'Sueldos piso junio', 850000, DATE '2026-06-15',
   'dddddddd-dddd-dddd-dddd-ddddddddddd1', TIMESTAMP '2026-06-15 11:00:00' AT TIME ZONE 'America/Santiago'),
  ('d4000000-0000-4000-a000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Alimentación', 'Colaciones equipo — junio', 45000, DATE '2026-06-20',
   'dddddddd-dddd-dddd-dddd-ddddddddddd1', TIMESTAMP '2026-06-20 18:00:00' AT TIME ZONE 'America/Santiago'),
  ('d4000000-0000-4000-a000-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Arriendo', 'Arriendo local Calama — julio', 450000, DATE '2026-07-05',
   'dddddddd-dddd-dddd-dddd-ddddddddddd1', TIMESTAMP '2026-07-05 09:30:00' AT TIME ZONE 'America/Santiago'),
  ('d4000000-0000-4000-a000-000000000006', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Servicios básicos', 'Luz, agua e internet — julio', 92000, DATE '2026-07-08',
   'dddddddd-dddd-dddd-dddd-ddddddddddd1', TIMESTAMP '2026-07-08 10:15:00' AT TIME ZONE 'America/Santiago'),
  ('d4000000-0000-4000-a000-000000000007', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Remuneraciones', 'Sueldos piso julio', 850000, DATE '2026-07-15',
   'dddddddd-dddd-dddd-dddd-ddddddddddd1', TIMESTAMP '2026-07-15 11:00:00' AT TIME ZONE 'America/Santiago'),
  ('d4000000-0000-4000-a000-000000000008', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Viajes', 'Feria proveedores Santiago', 120000, DATE '2026-07-22',
   'dddddddd-dddd-dddd-dddd-ddddddddddd1', TIMESTAMP '2026-07-22 19:00:00' AT TIME ZONE 'America/Santiago'),
  ('d4000000-0000-4000-a000-000000000009', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Otros', 'Bolsas y packaging boutique', 35000, DATE '2026-07-28',
   'dddddddd-dddd-dddd-dddd-ddddddddddd1', TIMESTAMP '2026-07-28 16:00:00' AT TIME ZONE 'America/Santiago'),
  ('d4000000-0000-4000-a000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Arriendo', 'Arriendo local Calama — agosto', 450000, DATE '2026-08-05',
   'dddddddd-dddd-dddd-dddd-ddddddddddd1', TIMESTAMP '2026-08-05 09:30:00' AT TIME ZONE 'America/Santiago'),
  ('d4000000-0000-4000-a000-00000000000b', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Servicios básicos', 'Luz y agua boutique — agosto', 87000, DATE '2026-08-08',
   'dddddddd-dddd-dddd-dddd-ddddddddddd1', TIMESTAMP '2026-08-08 10:00:00' AT TIME ZONE 'America/Santiago'),
  ('d4000000-0000-4000-a000-00000000000c', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Alimentación', 'Colaciones equipo — agosto', 38000, DATE '2026-08-10',
   'dddddddd-dddd-dddd-dddd-ddddddddddd1', TIMESTAMP '2026-08-10 18:00:00' AT TIME ZONE 'America/Santiago'),
  ('d4000000-0000-4000-a000-00000000000d', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Remuneraciones', 'Sueldos piso agosto', 850000, DATE '2026-08-15',
   'dddddddd-dddd-dddd-dddd-ddddddddddd1', TIMESTAMP '2026-08-15 11:00:00' AT TIME ZONE 'America/Santiago');

COMMIT;

SELECT
  (SELECT COUNT(*) FROM products WHERE internal_code ~ '^LS1000') AS productos_demo,
  (SELECT COUNT(*) FROM sales WHERE receipt_number LIKE 'VD%') AS ventas_demo,
  (SELECT COUNT(*) FROM expenses WHERE id::text LIKE 'd4000000-%') AS gastos_demo,
  (SELECT COUNT(*) FROM product_photos ph
     JOIN products p ON p.id = ph.product_id
    WHERE p.internal_code ~ '^LS1000') AS fotos_demo;
