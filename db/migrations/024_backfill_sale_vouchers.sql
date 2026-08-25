-- 024: tickets de cambio faltantes en ventas ya cobradas (p. ej. seed V-D…).
-- Una línea elegible (allows_exchange OR allows_return) debe tener change_vouchers.
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
  'VC-' || LPAD((
    COALESCE(seq.base_n, 0) + ROW_NUMBER() OVER (ORDER BY s.sold_at, si.id)
  )::text, 6, '0'),
  (timezone('America/Santiago', s.sold_at))::date,
  (timezone('America/Santiago', s.sold_at))::date + COALESCE(
    (SELECT (ss.value->>'value')::int
     FROM system_settings ss
     WHERE ss.organization_id = s.organization_id
       AND ss.branch_id IS NULL
       AND ss.key = 'change_voucher_days'
     LIMIT 1),
    7
  ),
  COALESCE(
    (SELECT ss.value->>'text'
     FROM system_settings ss
     WHERE ss.organization_id = s.organization_id
       AND ss.branch_id IS NULL
       AND ss.key = 'change_conditions'
     LIMIT 1),
    'Condiciones de cambio L''Scala'
  ),
  s.seller_user_id,
  s.sold_at
FROM sale_items si
JOIN sales s ON s.id = si.sale_id
JOIN products p ON p.id = si.product_id
CROSS JOIN LATERAL (
  SELECT MAX(
    CASE WHEN cv.voucher_number ~ '^VC-?[0-9]+$'
      THEN SUBSTRING(cv.voucher_number FROM '[0-9]+$')::int
    END
  ) AS base_n
  FROM change_vouchers cv
  WHERE cv.organization_id = s.organization_id
) seq
WHERE (p.allows_exchange OR p.allows_return)
  AND NOT EXISTS (SELECT 1 FROM change_vouchers v WHERE v.sale_item_id = si.id);
