-- 029 Medio de pago en ventas (efectivo / tarjeta)
DO $$ BEGIN
  CREATE TYPE sale_payment_method AS ENUM ('cash', 'card');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS payment_method sale_payment_method NOT NULL DEFAULT 'cash';

COMMENT ON COLUMN sales.payment_method IS 'Medio de pago al finalizar venta: cash=efectivo, card=tarjeta';

CREATE INDEX IF NOT EXISTS idx_sales_branch_sold_payment
  ON sales (branch_id, sold_at DESC, payment_method);
