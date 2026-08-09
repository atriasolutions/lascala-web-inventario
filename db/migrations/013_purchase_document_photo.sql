-- 013 document type on purchases + optional photo on purchase lines
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS document_type TEXT;

ALTER TABLE purchase_items
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

COMMENT ON COLUMN purchases.document_type IS 'factura | boleta | guia | otro';
COMMENT ON COLUMN purchase_items.photo_url IS 'Foto opcional de la prenda al registrar el ingreso';
