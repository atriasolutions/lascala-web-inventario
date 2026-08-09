-- 008 returns and mermas
CREATE TABLE IF NOT EXISTS mermas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  branch_id UUID NOT NULL REFERENCES branches(id),
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INT NOT NULL CHECK (quantity > 0),
  reason TEXT NOT NULL,
  cost_impact NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS change_vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  branch_id UUID NOT NULL REFERENCES branches(id),
  sale_id UUID REFERENCES sales(id),
  sale_item_id UUID REFERENCES sale_items(id),
  product_id UUID NOT NULL REFERENCES products(id),
  voucher_number TEXT NOT NULL,
  status voucher_status NOT NULL DEFAULT 'open',
  issued_at DATE NOT NULL DEFAULT CURRENT_DATE,
  expires_at DATE NOT NULL,
  conditions TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, voucher_number)
);

CREATE TABLE IF NOT EXISTS exchange_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  branch_id UUID NOT NULL REFERENCES branches(id),
  voucher_id UUID REFERENCES change_vouchers(id),
  original_product_id UUID REFERENCES products(id),
  new_product_id UUID REFERENCES products(id),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mermas_branch ON mermas(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vouchers_branch ON change_vouchers(branch_id);
