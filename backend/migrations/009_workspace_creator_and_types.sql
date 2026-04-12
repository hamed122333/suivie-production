-- Add created_by to workspaces and rename workspace types to clearer names:
--   STOCK       : workspace linked to available finished products in stock (xlsx import, ready)
--   PREPARATION : workspace for products currently being prepared (xlsx import, not yet ready)
--   RUPTURE     : workspace for products not in stock / out of stock / shortage

BEGIN;

-- Add creator column
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Rename existing type values
UPDATE workspaces SET workspace_type = 'STOCK'       WHERE workspace_type = 'STANDARD';
UPDATE workspaces SET workspace_type = 'PREPARATION' WHERE workspace_type = 'PLANNED';
UPDATE workspaces SET workspace_type = 'RUPTURE'     WHERE workspace_type = 'URGENT';

COMMIT;
