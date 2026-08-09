-- 005 purchases
CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  destination_branch_id UUID NOT NULL REFERENCES branches(id),
  supplier_id UUID REFERENCES suppliers(id),
  invoice_number TEXT,
  status purchase_status NOT NULL DEFAULT 'pending_reception',
  purchased_at DATE,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  received_by UUID REFERENCES users(id),
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  description TEXT NOT NULL,
  quantity_ordered INT NOT NULL CHECK (quantity_ordered > 0),
  quantity_received INT NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  suggested_sale_price NUMERIC(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (quantity_received <= quantity_ordered)
);

CREATE INDEX IF NOT EXISTS idx_purchases_branch ON purchases(destination_branch_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);
