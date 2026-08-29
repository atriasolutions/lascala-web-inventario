-- 031 Cantidad en exchange_returns — permite atender parcial un ticket de línea qty>1.

ALTER TABLE exchange_returns
  ADD COLUMN IF NOT EXISTS quantity INT NOT NULL DEFAULT 1
  CHECK (quantity > 0);

COMMENT ON COLUMN exchange_returns.quantity IS
  'Unidades atendidas en este fulfill (1..restantes de la línea de venta).';

-- Cumplimientos ya cerrados (1 fila por ticket used): asumir toda la cantidad de la línea.
UPDATE exchange_returns er
SET quantity = GREATEST(1, COALESCE(si.quantity, 1))
FROM change_vouchers v
LEFT JOIN sale_items si ON si.id = v.sale_item_id
WHERE er.voucher_id = v.id
  AND v.status = 'used'
  AND (
    SELECT COUNT(*) FROM exchange_returns er2 WHERE er2.voucher_id = v.id
  ) = 1;
