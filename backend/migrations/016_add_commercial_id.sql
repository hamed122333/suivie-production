ALTER TABLE users ADD COLUMN IF NOT EXISTS commercial_id VARCHAR(20) UNIQUE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS commercial_id VARCHAR(20);
CREATE INDEX IF NOT EXISTS idx_users_commercial_id ON users(commercial_id);
CREATE INDEX IF NOT EXISTS idx_tasks_commercial_id ON tasks(commercial_id);
