-- 025 tomas físicas de inventario (distinto de stock de vitrina)
DO $$ BEGIN
  CREATE TYPE stocktake_status AS ENUM (
    'in_progress', 'pending_review', 'completed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS stocktakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  branch_id UUID NOT NULL REFERENCES branches(id),
  take_number INT NOT NULL,
  take_label TEXT NOT NULL,
  status stocktake_status NOT NULL DEFAULT 'in_progress',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_by UUID REFERENCES users(id),
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES users(id),
  applied_at TIMESTAMPTZ,
  applied_by UUID REFERENCES users(id),
  notes TEXT,
  UNIQUE (organization_id, branch_id, take_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS stocktakes_one_in_progress_per_branch
  ON stocktakes (branch_id)
  WHERE status = 'in_progress';

CREATE INDEX IF NOT EXISTS idx_stocktakes_branch_started
  ON stocktakes (branch_id, started_at DESC);

CREATE TABLE IF NOT EXISTS stocktake_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stocktake_id UUID NOT NULL REFERENCES stocktakes(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  qty_counted INT NOT NULL DEFAULT 0 CHECK (qty_counted >= 0),
  qty_system_at_close INT,
  decision TEXT CHECK (decision IS NULL OR decision IN ('keep_system', 'use_physical')),
  last_scanned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (stocktake_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_stocktake_lines_session
  ON stocktake_lines (stocktake_id, updated_at DESC);
