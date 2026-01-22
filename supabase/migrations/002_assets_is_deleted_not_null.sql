-- Migration: Add NOT NULL + DEFAULT FALSE to assets.is_deleted
-- This prevents NULL values and ensures consistent soft delete behavior

-- Step 1: Update any existing NULL values to FALSE
UPDATE assets SET is_deleted = FALSE WHERE is_deleted IS NULL;

-- Step 2: Add NOT NULL constraint
ALTER TABLE assets ALTER COLUMN is_deleted SET NOT NULL;

-- Step 3: Set default value (prevents future NULLs)
ALTER TABLE assets ALTER COLUMN is_deleted SET DEFAULT FALSE;

-- Verify: Check that no NULL values exist
-- SELECT COUNT(*) FROM assets WHERE is_deleted IS NULL; -- Should return 0
