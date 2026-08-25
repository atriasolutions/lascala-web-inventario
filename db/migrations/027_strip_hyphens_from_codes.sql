-- 027 Strip hyphens from autonumbered codes (barcode-safe).
-- New generation already omits `-` (LS######, V######, VC######, INV######).
-- This backfill updates existing rows. Idempotent: only WHERE col LIKE '%-%'.
--
-- Collision policy: if REPLACE(col,'-','') would violate UNIQUE within the
-- same organization (or org+branch for take_label), SKIP that row and RAISE NOTICE.
-- Manual review of skipped rows may be needed (rare: both hyphenated and bare forms).

-- —— sales.receipt_number (UNIQUE organization_id, receipt_number) ——
DO $$
DECLARE
  r RECORD;
  skipped int := 0;
  updated int := 0;
  target text;
BEGIN
  FOR r IN
    SELECT id, organization_id, receipt_number
    FROM sales
    WHERE receipt_number LIKE '%-%'
  LOOP
    target := REPLACE(r.receipt_number, '-', '');
    IF EXISTS (
      SELECT 1 FROM sales o
      WHERE o.organization_id = r.organization_id
        AND o.id <> r.id
        AND o.receipt_number = target
    ) THEN
      skipped := skipped + 1;
      RAISE NOTICE '027 skip sales.receipt_number id=% % → % (collision)',
        r.id, r.receipt_number, target;
    ELSE
      UPDATE sales SET receipt_number = target WHERE id = r.id;
      updated := updated + 1;
    END IF;
  END LOOP;
  RAISE NOTICE '027 sales.receipt_number updated=% skipped=%', updated, skipped;
END $$;

-- —— change_vouchers.voucher_number (UNIQUE organization_id, voucher_number) ——
DO $$
DECLARE
  r RECORD;
  skipped int := 0;
  updated int := 0;
  target text;
BEGIN
  FOR r IN
    SELECT id, organization_id, voucher_number
    FROM change_vouchers
    WHERE voucher_number LIKE '%-%'
  LOOP
    target := REPLACE(r.voucher_number, '-', '');
    IF EXISTS (
      SELECT 1 FROM change_vouchers o
      WHERE o.organization_id = r.organization_id
        AND o.id <> r.id
        AND o.voucher_number = target
    ) THEN
      skipped := skipped + 1;
      RAISE NOTICE '027 skip change_vouchers.voucher_number id=% % → % (collision)',
        r.id, r.voucher_number, target;
    ELSE
      UPDATE change_vouchers SET voucher_number = target WHERE id = r.id;
      updated := updated + 1;
    END IF;
  END LOOP;
  RAISE NOTICE '027 change_vouchers.voucher_number updated=% skipped=%', updated, skipped;
END $$;

-- —— stocktakes.take_label (no unique on label; avoid dupes per org+branch) ——
DO $$
DECLARE
  r RECORD;
  skipped int := 0;
  updated int := 0;
  target text;
BEGIN
  FOR r IN
    SELECT id, organization_id, branch_id, take_label
    FROM stocktakes
    WHERE take_label LIKE '%-%'
  LOOP
    target := REPLACE(r.take_label, '-', '');
    IF EXISTS (
      SELECT 1 FROM stocktakes o
      WHERE o.organization_id = r.organization_id
        AND o.branch_id = r.branch_id
        AND o.id <> r.id
        AND o.take_label = target
    ) THEN
      skipped := skipped + 1;
      RAISE NOTICE '027 skip stocktakes.take_label id=% % → % (collision)',
        r.id, r.take_label, target;
    ELSE
      UPDATE stocktakes SET take_label = target WHERE id = r.id;
      updated := updated + 1;
    END IF;
  END LOOP;
  RAISE NOTICE '027 stocktakes.take_label updated=% skipped=%', updated, skipped;
END $$;

-- —— products.internal_code + barcode (UNIQUE org+internal_code; unique index org+barcode) ——
-- Update internal_code first, then barcode. Skip if either target collides.
DO $$
DECLARE
  r RECORD;
  skipped int := 0;
  updated int := 0;
  new_internal text;
  new_barcode text;
  barcode_collision boolean;
  internal_collision boolean;
BEGIN
  FOR r IN
    SELECT id, organization_id, internal_code, barcode
    FROM products
    WHERE internal_code LIKE '%-%'
       OR COALESCE(barcode, '') LIKE '%-%'
  LOOP
    new_internal := REPLACE(r.internal_code, '-', '');
    new_barcode := CASE
      WHEN r.barcode IS NULL OR r.barcode = '' THEN r.barcode
      ELSE REPLACE(r.barcode, '-', '')
    END;

    internal_collision := EXISTS (
      SELECT 1 FROM products o
      WHERE o.organization_id = r.organization_id
        AND o.id <> r.id
        AND o.internal_code = new_internal
    );

    barcode_collision := new_barcode IS NOT NULL
      AND new_barcode <> ''
      AND EXISTS (
        SELECT 1 FROM products o
        WHERE o.organization_id = r.organization_id
          AND o.id <> r.id
          AND o.barcode = new_barcode
      );

    IF internal_collision OR barcode_collision THEN
      skipped := skipped + 1;
      RAISE NOTICE '027 skip products id=% internal %→% barcode %→% (collision)',
        r.id, r.internal_code, new_internal, r.barcode, new_barcode;
    ELSE
      UPDATE products
      SET internal_code = new_internal,
          barcode = CASE
            WHEN new_barcode IS NULL OR new_barcode = '' THEN new_internal
            ELSE new_barcode
          END,
          updated_at = now()
      WHERE id = r.id;
      updated := updated + 1;
    END IF;
  END LOOP;
  RAISE NOTICE '027 products.internal_code/barcode updated=% skipped=%', updated, skipped;
END $$;

COMMENT ON COLUMN products.barcode IS
  'Mismo valor que internal_code (LS###### sin guión). Código de etiqueta y pistola.';
