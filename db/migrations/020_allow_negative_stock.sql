-- 020 Permitir stock negativo (solo vía sync offline / allowNegative en app).
-- Los CHECK de 006 bloqueaban quantity / quantity_after < 0 aunque el código
-- de offline-sync ya tenía allowNegative=true.
-- Online POST /api/sales sigue rechazando sobrestock en aplicación.

ALTER TABLE inventory_balances
  DROP CONSTRAINT IF EXISTS inventory_balances_quantity_check;

ALTER TABLE inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_quantity_after_check;

COMMENT ON COLUMN inventory_balances.quantity IS
  'Puede ser negativo tras sync offline (allowNegative). Online bloquea en app.';
COMMENT ON COLUMN inventory_movements.quantity_after IS
  'Puede ser negativo tras SALE_OUT offline-sync. Online: quantity_after >= 0 por regla de app.';
