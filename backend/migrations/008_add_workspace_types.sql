-- Add workspace type to differentiate flows (stock, preparation, rupture)
BEGIN;

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS type VARCHAR(32) NOT NULL DEFAULT 'STOCK';

-- Normalize existing rows
UPDATE workspaces SET type = COALESCE(NULLIF(type, ''), 'STOCK');

-- Ensure allowed values even if the migration is rerun
ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_type_check;
ALTER TABLE workspaces
  ADD CONSTRAINT workspaces_type_check
  CHECK (type IN ('STOCK', 'PREPARATION', 'RUPTURE'));

COMMIT;
