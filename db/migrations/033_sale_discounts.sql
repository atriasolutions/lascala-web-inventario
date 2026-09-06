-- 033 sale discounts (presets % por línea y/o global)
-- sales.discount ya existe (monto global). Agregamos % y montos por línea.

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS discount_pct SMALLINT NOT NULL DEFAULT 0
    CHECK (discount_pct IN (0, 5, 10, 15, 20, 25, 30));

COMMENT ON COLUMN sales.discount_pct IS 'Descuento global % (presets fijos). Monto en sales.discount.';
COMMENT ON COLUMN sales.discount IS 'Monto descuento global (CLP) aplicado sobre subtotal post-líneas.';
COMMENT ON COLUMN sales.subtotal IS 'Suma de line_total (después de descuentos de línea).';

ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS discount_pct SMALLINT NOT NULL DEFAULT 0
    CHECK (discount_pct IN (0, 5, 10, 15, 20, 25, 30)),
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0
    CHECK (discount_amount >= 0);

COMMENT ON COLUMN sale_items.discount_pct IS 'Descuento % de la línea (presets). unit_price sigue siendo p. venta base.';
COMMENT ON COLUMN sale_items.discount_amount IS 'Monto descontado en la línea (CLP).';
COMMENT ON COLUMN sale_items.line_total IS 'unit_price * qty − discount_amount.';
