-- 006 inventory
CREATE TABLE IF NOT EXISTS inventory_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id),
  branch_id UUID NOT NULL REFERENCES branches(id),
  quantity INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  low_stock_threshold INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, branch_id)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  branch_id UUID NOT NULL REFERENCES branches(id),
  product_id UUID NOT NULL REFERENCES products(id),
  movement_type movement_type NOT NULL,
  quantity_delta INT NOT NULL,
  quantity_after INT NOT NULL CHECK (quantity_after >= 0),
  reference_type TEXT,
  reference_id UUID,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_balances_branch ON inventory_balances(branch_id);
CREATE INDEX IF NOT EXISTS idx_movements_branch ON inventory_movements(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movements_product ON inventory_movements(product_id, created_at DESC);
