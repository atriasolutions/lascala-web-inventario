-- 012 unique barcode per organization (null/empty allowed multiple times)
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_org_barcode
  ON products (organization_id, barcode)
  WHERE barcode IS NOT NULL AND barcode <> '';
