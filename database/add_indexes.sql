-- Performance optimization: Add indexes for frequently queried columns
-- Run this migration on existing databases

-- Index for tasks filtering by status (used in kanban board)
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- Index for tasks filtering by assigned_to (used in user filtering)
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);

-- Index for tasks filtering by created_by (used in visibility rules)
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);

-- Composite index for workspace filtering (if workspace_id column exists)
-- Note: Run only if your schema has workspace_id column
-- CREATE INDEX IF NOT EXISTS idx_tasks_workspace_id ON tasks(workspace_id);
-- CREATE INDEX IF NOT EXISTS idx_tasks_workspace_status ON tasks(workspace_id, status);

-- Index for email lookups (improves login performance)
-- Note: email already has UNIQUE constraint which creates an index, but explicit index can help
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Index for date-based queries (used in dashboard stats)
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);

-- Index for updated_at (useful for sorting and recent activity queries)
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);
