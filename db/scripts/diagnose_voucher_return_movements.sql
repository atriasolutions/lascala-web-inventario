-- Diagnóstico: devoluciones/cambios vs movimientos de stock
-- Ejecutar en prod (solo lectura) antes de cualquier corrección.
--
-- Hallazgo esperado del bug reportado (28/8):
-- Las filas «Venta V00000X · 1 voucher · −1» son SALE_OUT de la venta original
-- (emisión del ticket), NO devoluciones mal tipadas.
-- Una devolución con «Volver a vitrina» debe dejar RETURN_IN (+1) con
-- reference_type = 'change_voucher'.

-- 1) Tickets usados como devolución (cash_refund) con destino restock
--    sin movimiento RETURN_IN / EXCHANGE_IN asociado → stock no se reingresó.
SELECT
  er.id AS exchange_return_id,
  er.created_at AT TIME ZONE 'America/Santiago' AS created_cl,
  er.outcome,
  er.destination,
  v.voucher_number,
  s.receipt_number,
  p.name AS product_name,
  p.internal_code,
  u.full_name AS usuario,
  (
    SELECT COUNT(*) FROM inventory_movements m
    WHERE m.reference_type = 'change_voucher'
      AND m.reference_id = v.id
      AND m.movement_type IN ('RETURN_IN', 'EXCHANGE_IN')
      AND m.quantity_delta > 0
  ) AS stock_in_movements
FROM exchange_returns er
JOIN change_vouchers v ON v.id = er.voucher_id
JOIN products p ON p.id = er.original_product_id
LEFT JOIN sales s ON s.id = v.sale_id
LEFT JOIN users u ON u.id = er.created_by
WHERE er.destination = 'restock'
  AND COALESCE(er.outcome, 'cash_refund') IN ('cash_refund', 'exchange')
ORDER BY er.created_at DESC
LIMIT 100;

-- 2) Movimientos del día (ejemplo 2026-08-28) para jeans / voucher
--    Ajusta la fecha si hace falta.
SELECT
  m.created_at AT TIME ZONE 'America/Santiago' AS created_cl,
  m.movement_type,
  m.quantity_delta,
  m.quantity_after,
  m.reference_type,
  m.notes,
  p.name AS product_name,
  s.receipt_number AS sale_receipt,
  cv.voucher_number,
  u.full_name
FROM inventory_movements m
JOIN products p ON p.id = m.product_id
LEFT JOIN users u ON u.id = m.created_by
LEFT JOIN sales s ON m.reference_type = 'sale' AND s.id = m.reference_id
LEFT JOIN change_vouchers cv
  ON m.reference_type = 'change_voucher' AND cv.id = m.reference_id
WHERE m.created_at::date = DATE '2026-08-28'
  AND (
    p.name ILIKE '%jeans%'
    OR s.receipt_number IN ('V000004', 'V000005', 'V000006')
    OR cv.voucher_number IS NOT NULL
  )
ORDER BY m.created_at;

-- 3) Retag seguro (solo etiqueta; no toca stock):
--    Cambios antiguos que reingresaron con RETURN_IN en vez de EXCHANGE_IN.
-- BEGIN;
-- UPDATE inventory_movements m
-- SET movement_type = 'EXCHANGE_IN'
-- FROM change_vouchers v
-- JOIN exchange_returns er ON er.voucher_id = v.id
-- WHERE m.reference_type = 'change_voucher'
--   AND m.reference_id = v.id
--   AND m.movement_type = 'RETURN_IN'
--   AND m.quantity_delta > 0
--   AND er.outcome = 'exchange'
--   AND er.destination = 'restock';
-- COMMIT;

-- 4) Stock faltante tras devolución con restock (sin movimiento +):
--    Preferible ajuste manual en Inventario con nota
--    «Corrección devolución ticket VC… / venta V…».
--    No reabrir vouchers used ni inventar SALE_OUT negativos.
