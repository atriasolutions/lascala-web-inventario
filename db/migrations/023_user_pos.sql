-- 023: asignación Usuaria × Caja (POS) dentro de sucursales ya asignadas.
-- Una vendedora/encargada solo opera las cajas habilitadas para ella.
-- La propietaria sigue viendo todas las cajas (filtro en API de contexto).

CREATE TABLE IF NOT EXISTS user_pos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pos_id UUID NOT NULL REFERENCES pos_terminals(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, pos_id)
);

CREATE INDEX IF NOT EXISTS idx_user_pos_user ON user_pos(user_id);
CREATE INDEX IF NOT EXISTS idx_user_pos_pos ON user_pos(pos_id);

-- Conservar comportamiento previo: quien ya tenía sucursal, tenía todas sus cajas.
INSERT INTO user_pos (user_id, pos_id)
SELECT ub.user_id, p.id
FROM user_branches ub
JOIN pos_terminals p ON p.branch_id = ub.branch_id
ON CONFLICT (user_id, pos_id) DO NOTHING;
