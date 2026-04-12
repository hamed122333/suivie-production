-- Add workspace type and planned date.
-- Note: types STANDARD/PLANNED/URGENT were later renamed to STOCK/PREPARATION/RUPTURE
-- by migration 009_workspace_creator_and_types.sql.

BEGIN;

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS workspace_type VARCHAR(20) NOT NULL DEFAULT 'STANDARD';

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS planned_date DATE;

-- Existing workspaces keep the default STANDARD type
COMMIT;
