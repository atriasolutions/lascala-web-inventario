-- 026 conciliación: cantidad ajustada a mano (decision = adjust)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'stocktake_lines'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%decision%'
  LOOP
    EXECUTE format('ALTER TABLE stocktake_lines DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE stocktake_lines
  ADD CONSTRAINT stocktake_lines_decision_check
  CHECK (decision IS NULL OR decision IN ('keep_system', 'use_physical', 'adjust'));

ALTER TABLE stocktake_lines
  ADD COLUMN IF NOT EXISTS qty_override INT CHECK (qty_override IS NULL OR qty_override >= 0);
