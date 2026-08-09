-- 001 enums and extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('owner', 'branch_manager', 'seller');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE product_status AS ENUM (
    'draft', 'in_transit', 'available', 'reserved', 'sold',
    'in_repair', 'returned_to_supplier', 'merma', 'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE purchase_status AS ENUM ('pending_reception', 'partially_received', 'received', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE movement_type AS ENUM (
    'PURCHASE_IN', 'SALE_OUT', 'MERMA_OUT', 'ADJUSTMENT',
    'RETURN_IN', 'EXCHANGE_OUT', 'EXCHANGE_IN',
    'TRANSFER_OUT', 'TRANSFER_IN'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pos_status AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE voucher_status AS ENUM ('open', 'used', 'expired', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
