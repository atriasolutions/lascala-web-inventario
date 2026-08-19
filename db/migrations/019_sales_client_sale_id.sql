-- 019 Idempotencia ventas offline (client_sale_id) + origen auditable
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS client_sale_id UUID;

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS offline_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN sales.client_sale_id IS
  'UUID generado en el cliente (cola offline). UNIQUE por organización para sync idempotente.';
COMMENT ON COLUMN sales.offline_synced_at IS
  'Timestamp de sincronización offline; NULL = venta online normal.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_org_client_sale_id
  ON sales (organization_id, client_sale_id)
  WHERE client_sale_id IS NOT NULL;
