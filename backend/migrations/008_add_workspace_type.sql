-- Add workspace type and planned date to support 3 types of workspaces:
-- STANDARD : limited and linked to the finished products list
-- PLANNED  : planned for a future date, not limited/linked to stock data
-- URGENT   : for very urgent orders, dedicated space

BEGIN;

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS workspace_type VARCHAR(20) NOT NULL DEFAULT 'STANDARD';

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS planned_date DATE;

-- Existing workspaces keep the default STANDARD type
COMMIT;
