-- 016 correlativo de códigos de barras org (formato BC######, sin guión)
CREATE TABLE IF NOT EXISTS barcode_counters (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  next_value INT NOT NULL DEFAULT 1 CHECK (next_value >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE barcode_counters IS
  'Siguiente número de serie para barcodes internos BC###### (sin guión; pistolas retail).';

-- Sembrar desde series actuales (BC###### o legado BC-######)
INSERT INTO barcode_counters (organization_id, next_value)
SELECT
  p.organization_id,
  GREATEST(
    1,
    COALESCE(
      MAX(
        CASE
          WHEN p.barcode ~ '^BC[0-9]+$' THEN SUBSTRING(p.barcode FROM 3)::int
          WHEN p.barcode ~ '^BC-[0-9]+$' THEN SUBSTRING(p.barcode FROM 4)::int
          ELSE NULL
        END
      ),
      0
    ) + 1
  )
FROM products p
GROUP BY p.organization_id
ON CONFLICT (organization_id) DO UPDATE
  SET next_value = GREATEST(barcode_counters.next_value, EXCLUDED.next_value),
      updated_at = now();
