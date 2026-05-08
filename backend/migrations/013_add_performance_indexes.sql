-- Performance indexes for stock allocation and Kanban queries
-- Run: psql -d suivi_production -f migrations/013_add_performance_indexes.sql

BEGIN;

-- Index for stock allocation queries (filtering by item_reference and status)
CREATE INDEX IF NOT EXISTS idx_tasks_item_ref_status_active 
ON tasks(item_reference, status) 
WHERE status IN ('WAITING_STOCK', 'TODO', 'IN_PROGRESS', 'BLOCKED');

-- Index for workspace + status queries (Kanban board)
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_status 
ON tasks(workspace_id, status);

-- Index for board position ordering per workspace
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_status_position 
ON tasks(workspace_id, status, board_position);

-- Index for created_by queries (commercial's tasks)
CREATE INDEX IF NOT EXISTS idx_tasks_created_by 
ON tasks(created_by, created_at DESC);

-- Index for assigned_to queries (planner's assigned tasks)
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to_status 
ON tasks(assigned_to, status);

COMMIT;