-- 028 Auth: primer ingreso (must_change_password) + superadmin oculto de soporte.
-- No hay reset público por email; solo reset autenticado por admin/superadmin.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN NOT NULL DEFAULT false;

-- Usuarias existentes: no forzar cambio (ya operan en piso).
UPDATE users
SET password_changed_at = COALESCE(password_changed_at, created_at),
    must_change_password = false
WHERE password_changed_at IS NULL
  AND COALESCE(is_superadmin, false) = false;

COMMENT ON COLUMN users.must_change_password IS
  'true = debe crear nueva contraseña antes de usar la app (primer ingreso o reset admin).';
COMMENT ON COLUMN users.password_changed_at IS
  'Última vez que la usuaria cambió su contraseña. NULL = nunca.';
COMMENT ON COLUMN users.is_superadmin IS
  'Soporte Atria: oculto en listados; solo este usuario puede restablecer contraseña del admin (owner).';

-- Ya no hay reset público por email/token.
DROP TABLE IF EXISTS password_reset_tokens;

CREATE INDEX IF NOT EXISTS idx_users_org_visible
  ON users (organization_id)
  WHERE is_superadmin = false;

-- Superadmin de soporte (temporal). Credenciales en .env.example.
-- Email: soporte@atria.cl · Password temporal: AtriaSupport!2026 · must_change_password = true
INSERT INTO users (
  id, organization_id, email, password_hash, full_name,
  is_active, is_superadmin, must_change_password, password_changed_at
)
VALUES (
  'dddddddd-dddd-dddd-dddd-ddddddddddd9',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'soporte@atria.cl',
  '$2b$10$d70nGo2u3Kvaf1fCOrpoU./H49jpJwhUubXPFAxSsMHl8OpT1uh/O',
  'Soporte Atria',
  true,
  true,
  true,
  NULL
)
ON CONFLICT (email) DO UPDATE SET
  is_superadmin = true,
  must_change_password = EXCLUDED.must_change_password,
  password_hash = CASE
    WHEN users.is_superadmin THEN users.password_hash
    ELSE EXCLUDED.password_hash
  END,
  full_name = EXCLUDED.full_name;

-- Acceso de sucursal como owner (middleware); listados filtran is_superadmin.
INSERT INTO user_branches (user_id, branch_id, role)
SELECT u.id, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'owner'
FROM users u
WHERE u.email = 'soporte@atria.cl'
ON CONFLICT (user_id, branch_id) DO UPDATE SET role = EXCLUDED.role;
