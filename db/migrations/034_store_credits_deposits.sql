-- 034 Créditos de cambio (CR) + Abonos (AB) + movement types de hold/release
-- Idempotente: aplicable aunque 011 falle en re-runs de migrate.sh

DO $$ BEGIN
  ALTER TYPE movement_type ADD VALUE 'DEPOSIT_HOLD';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE movement_type ADD VALUE 'DEPOSIT_RELEASE';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE deposit_status AS ENUM ('open', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE store_credit_status AS ENUM ('open', 'used', 'expired', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE deposit_payment_kind AS ENUM ('initial', 'complete');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Crédito por cambio a prenda más barata (barcode CR######, 7 días, un uso)
CREATE TABLE IF NOT EXISTS store_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  branch_id UUID NOT NULL REFERENCES branches(id),
  barcode TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  status store_credit_status NOT NULL DEFAULT 'open',
  issued_at DATE NOT NULL DEFAULT CURRENT_DATE,
  expires_at DATE NOT NULL,
  exchange_return_id UUID,
  sale_id UUID REFERENCES sales(id),
  used_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, barcode)
);

CREATE INDEX IF NOT EXISTS idx_store_credits_branch_status
  ON store_credits(branch_id, status, expires_at);

COMMENT ON TABLE store_credits IS 'Crédito de tienda por cambio a prenda más barata. Folio CR######.';
COMMENT ON COLUMN store_credits.barcode IS 'Código escaneable CR###### (sin guion).';

-- Ampliar exchange_returns para diferencia de precio
ALTER TABLE exchange_returns
  ADD COLUMN IF NOT EXISTS store_credit_id UUID REFERENCES store_credits(id);

ALTER TABLE exchange_returns
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

ALTER TABLE exchange_returns
  ADD COLUMN IF NOT EXISTS price_diff NUMERIC(12,2);

COMMENT ON COLUMN exchange_returns.outcome IS 'exchange | cash_refund | exchange_credit';
COMMENT ON COLUMN exchange_returns.price_diff IS 'newPrice − returnedPrice (CLP). + = cobrado; − = crédito emitido.';
COMMENT ON COLUMN exchange_returns.payment_method IS 'cash|card cuando se cobra diferencia (prenda más cara).';
COMMENT ON COLUMN exchange_returns.store_credit_id IS 'Crédito CR emitido si la prenda nueva es más barata.';

-- FK diferida store_credits → exchange_returns (ciclo)
DO $$ BEGIN
  ALTER TABLE store_credits
    ADD CONSTRAINT store_credits_exchange_return_id_fkey
    FOREIGN KEY (exchange_return_id) REFERENCES exchange_returns(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Abonos
CREATE TABLE IF NOT EXISTS deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  branch_id UUID NOT NULL REFERENCES branches(id),
  pos_id UUID REFERENCES pos_terminals(id),
  deposit_number TEXT NOT NULL,
  status deposit_status NOT NULL DEFAULT 'open',
  customer_name TEXT,
  notes TEXT,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  sale_id UUID REFERENCES sales(id),
  created_by UUID REFERENCES users(id),
  completed_by UUID REFERENCES users(id),
  cancelled_by UUID REFERENCES users(id),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, deposit_number)
);

CREATE INDEX IF NOT EXISTS idx_deposits_branch_status
  ON deposits(branch_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS deposit_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_id UUID NOT NULL REFERENCES deposits(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  line_total NUMERIC(12,2) NOT NULL CHECK (line_total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deposit_items_deposit ON deposit_items(deposit_id);

CREATE TABLE IF NOT EXISTS deposit_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_id UUID NOT NULL REFERENCES deposits(id) ON DELETE CASCADE,
  kind deposit_payment_kind NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deposit_id, kind)
);

COMMENT ON TABLE deposits IS 'Abono de prendas: hold de stock al crear; completa → venta; anula → release.';
COMMENT ON COLUMN deposits.deposit_number IS 'Folio AB######.';
COMMENT ON TABLE deposit_payments IS 'Máx. 2 pagos: initial (abono) + complete (faltante).';
