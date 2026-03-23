-- Create workspaces table and attach tasks to a workspace.
-- Run once on existing database(s).

BEGIN;

CREATE TABLE IF NOT EXISTS workspaces (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO workspaces (name)
SELECT 'Default'
WHERE NOT EXISTS (SELECT 1 FROM workspaces WHERE name = 'Default');

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS workspace_id INTEGER;

-- Assign legacy tasks to the default workspace.
UPDATE tasks
SET workspace_id = (SELECT id FROM workspaces WHERE name = 'Default')
WHERE workspace_id IS NULL;

-- Recompute board_position within each workspace (per status).
WITH ranked AS (
  SELECT id,
         workspace_id,
         ROW_NUMBER() OVER (
           PARTITION BY workspace_id, status
           ORDER BY created_at ASC, id ASC
         ) - 1 AS rn
  FROM tasks
  WHERE workspace_id IS NOT NULL
)
UPDATE tasks t
SET board_position = ranked.rn
FROM ranked
WHERE t.id = ranked.id;

COMMIT;

