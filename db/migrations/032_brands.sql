-- 032 Marcas de catálogo (org-scoped) + FK en products.
-- No borra productos ni toca inventory_balances / stock.

CREATE TABLE IF NOT EXISTS brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_brands_org_name ON brands (organization_id, name);

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id);

CREATE INDEX IF NOT EXISTS idx_products_brand ON products (brand_id);

COMMENT ON TABLE brands IS 'Marcas de prenda por organización. Nombre canónico en MAYÚSCULAS.';
COMMENT ON COLUMN products.brand_id IS 'FK a brands; products.brand se mantiene sincronizado (texto UPPER) en cutover.';
