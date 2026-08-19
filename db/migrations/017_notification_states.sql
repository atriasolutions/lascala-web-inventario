-- 017 Persistencia de estado de alertas/notificaciones por usuaria + sucursal.
-- Las alertas se calculan en vivo (igual que /api/dashboard/alerts);
-- esta tabla guarda solo read/dismiss + fingerprint de condición.
--
-- Regla dismiss: ocultar hasta que cambie condition_fingerprint (ej. qty)
-- o hayan pasado 24h desde dismissed_at (lo que ocurra primero → reaparece).

CREATE TABLE IF NOT EXISTS notification_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_key TEXT NOT NULL,
  condition_fingerprint TEXT,
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, branch_id, alert_key)
);

CREATE INDEX IF NOT EXISTS idx_notification_states_user_branch
  ON notification_states (user_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_notification_states_org_branch
  ON notification_states (organization_id, branch_id);

COMMENT ON TABLE notification_states IS
  'Estado leído/dismiss de alertas por usuaria+sucursal. Dismiss: fingerprint o TTL 24h.';
COMMENT ON COLUMN notification_states.alert_key IS
  'Clave estable: low-stock:{productId} | no-movement:{productId} | voucher-expiring:{voucherId}';
COMMENT ON COLUMN notification_states.condition_fingerprint IS
  'Snapshot de condición (qty, última mov., vencimiento) para reabrir tras dismiss.';
