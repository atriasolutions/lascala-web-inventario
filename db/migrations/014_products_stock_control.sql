-- 014 products: control de stock y umbrales de alerta por prenda
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS tracks_stock BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS low_stock_threshold INT NOT NULL DEFAULT 1;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS no_movement_alert_days INT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_low_stock_threshold_check'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_low_stock_threshold_check
      CHECK (low_stock_threshold >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_no_movement_alert_days_check'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_no_movement_alert_days_check
      CHECK (no_movement_alert_days IS NULL OR no_movement_alert_days > 0);
  END IF;
END $$;

COMMENT ON COLUMN products.tracks_stock IS
  'Si false, la prenda no participa de alertas ni umbrales de stock';
COMMENT ON COLUMN products.low_stock_threshold IS
  'Stock mínimo de catálogo; se sincroniza al balance de la sucursal activa al editar';
COMMENT ON COLUMN products.no_movement_alert_days IS
  'Días sin movimiento para alerta; NULL usa system_settings.no_movement_days';
