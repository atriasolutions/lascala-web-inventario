-- 022 Mermas de vitrina (kind) + auditoría de cumplimiento de ticket de cambio.
ALTER TABLE mermas
  ADD COLUMN IF NOT EXISTS kind TEXT;

ALTER TABLE mermas
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE mermas
  ADD COLUMN IF NOT EXISTS voucher_id UUID REFERENCES change_vouchers(id);

ALTER TABLE mermas
  ADD COLUMN IF NOT EXISTS skip_stock BOOLEAN NOT NULL DEFAULT false;

UPDATE mermas SET kind = 'discard' WHERE kind IS NULL;

ALTER TABLE mermas ALTER COLUMN kind SET DEFAULT 'discard';
ALTER TABLE mermas ALTER COLUMN kind SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE mermas
    ADD CONSTRAINT mermas_kind_check CHECK (kind IN ('discard', 'supplier'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN mermas.kind IS 'discard = baja/pérdida · supplier = devolución a proveedor. No crea gasto automático.';
COMMENT ON COLUMN mermas.skip_stock IS 'true si la prenda ya salió de vitrina (venta); no restar stock otra vez.';
COMMENT ON COLUMN mermas.voucher_id IS 'Ticket de cambio/devolución que originó esta merma, si aplica.';

ALTER TABLE exchange_returns
  ADD COLUMN IF NOT EXISTS outcome TEXT;

ALTER TABLE exchange_returns
  ADD COLUMN IF NOT EXISTS destination TEXT;

ALTER TABLE exchange_returns
  ADD COLUMN IF NOT EXISTS override_expired BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE exchange_returns
  ADD COLUMN IF NOT EXISTS override_note TEXT;

ALTER TABLE exchange_returns
  ADD COLUMN IF NOT EXISTS cash_amount NUMERIC(12,2);

ALTER TABLE exchange_returns
  ADD COLUMN IF NOT EXISTS scanned_code TEXT;

COMMENT ON COLUMN exchange_returns.outcome IS 'exchange | cash_refund';
COMMENT ON COLUMN exchange_returns.destination IS 'restock | discard | supplier';
COMMENT ON COLUMN exchange_returns.override_note IS 'Motivo obligatorio si el ticket está vencido.';
