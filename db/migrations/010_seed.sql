-- 010 seed Boutique L'Scala Calama
INSERT INTO organizations (id, name, legal_name)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Boutique L''Scala', 'Boutique L''Scala')
ON CONFLICT (id) DO NOTHING;

INSERT INTO branches (id, organization_id, code, name, city, address)
VALUES (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'CALAMA',
  'L''Scala Calama',
  'Calama',
  'Calama, Chile'
)
ON CONFLICT (organization_id, code) DO NOTHING;

INSERT INTO pos_terminals (id, branch_id, code, name, status)
VALUES (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'CAJA1',
  'Caja 1',
  'active'
)
ON CONFLICT (branch_id, code) DO NOTHING;

-- passwords: Admin123! / Vendedor123! (encargada y vendedora)
INSERT INTO users (id, organization_id, email, password_hash, full_name)
VALUES
  (
    'dddddddd-dddd-dddd-dddd-ddddddddddd1',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'admin@lscala.cl',
    '$2b$10$OwGvUGUEr/mmqtc0sM3U.uaCW2Cnkvhek9j6Y6TTZUiy5KTgPIu4a',
    'Propietaria L''Scala'
  ),
  (
    'dddddddd-dddd-dddd-dddd-ddddddddddd2',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'vendedor@lscala.cl',
    '$2b$10$IGJHrZ7wgaOlNN.sFmPA.ebBrh2us4wfr.A3AamLneE6GwWIOVbWe',
    'Vendedora L''Scala'
  ),
  (
    'dddddddd-dddd-dddd-dddd-ddddddddddd4',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'encargada@lscala.cl',
    '$2b$10$IGJHrZ7wgaOlNN.sFmPA.ebBrh2us4wfr.A3AamLneE6GwWIOVbWe',
    'Encargada L''Scala'
  )
ON CONFLICT (email) DO NOTHING;

INSERT INTO user_branches (user_id, branch_id, role)
VALUES
  ('dddddddd-dddd-dddd-dddd-ddddddddddd1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'owner'),
  ('dddddddd-dddd-dddd-dddd-ddddddddddd2', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'seller'),
  ('dddddddd-dddd-dddd-dddd-ddddddddddd4', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'branch_manager')
ON CONFLICT (user_id, branch_id) DO NOTHING;

INSERT INTO categories (organization_id, name, slug, allows_exchange_default, sort_order)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Jeans', 'jeans', true, 1),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Vestidos de Fiesta', 'vestidos-fiesta', false, 2),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Ropa Formal', 'ropa-formal', true, 3),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Ropa Casual', 'ropa-casual', true, 4),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Carteras', 'carteras', true, 5),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Cinturones', 'cinturones', true, 6),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Accesorios', 'accesorios', true, 7)
ON CONFLICT (organization_id, slug) DO NOTHING;

INSERT INTO system_settings (organization_id, branch_id, key, value)
SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL, v.key, v.value::jsonb
FROM (VALUES
  ('price_multiplier', '{"value": 2}'),
  ('change_voucher_days', '{"value": 7}'),
  ('low_stock_threshold', '{"value": 1}'),
  ('no_movement_days', '{"value": 30}'),
  ('change_conditions', '{"text": "No se aceptan prendas manchadas, con olor a cigarro o dañadas. Vestidos de fiesta no admiten cambios."}')
) AS v(key, value)
WHERE NOT EXISTS (
  SELECT 1 FROM system_settings s
  WHERE s.organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    AND s.branch_id IS NULL
    AND s.key = v.key
);
