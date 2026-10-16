-- 035 Cupón de descuento: código único no secuencial, aparte del folio CR######

ALTER TABLE store_credits
  ADD COLUMN IF NOT EXISTS redeem_code TEXT;

COMMENT ON COLUMN store_credits.barcode IS 'Folio interno CR######. No se pistolea en caja.';
COMMENT ON COLUMN store_credits.redeem_code IS 'Código único del cupón (barcode del comprobante). No es el folio CR.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_store_credits_org_redeem
  ON store_credits (organization_id, redeem_code)
  WHERE redeem_code IS NOT NULL AND redeem_code <> '';
