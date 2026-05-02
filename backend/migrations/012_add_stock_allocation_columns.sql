-- Add stock allocation columns to tasks table
-- For tracking allocated stock vs requested stock
-- And priority order for stock allocation (1st, 2nd, 3rd...)

BEGIN;

ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS stock_allocated INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS priority_order INTEGER DEFAULT NULL;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_tasks_stock_allocated ON tasks(stock_allocated);
CREATE INDEX IF NOT EXISTS idx_tasks_priority_order ON tasks(priority_order);
CREATE INDEX IF NOT EXISTS idx_tasks_item_ref_status ON tasks(item_reference, status);

COMMIT;
