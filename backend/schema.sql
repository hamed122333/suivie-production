-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Workspaces Table (Jira-like projects)
-- workspace_type: STOCK       (linked to available finished products in xlsx stock — limited to stock data),
--                 PREPARATION (planned for a later date, free-form orders not linked to stock import data),
--                 RUPTURE     (very urgent orders requiring immediate tracking — free-form, urgent by default)
CREATE TABLE IF NOT EXISTS workspaces (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    workspace_type VARCHAR(20) NOT NULL DEFAULT 'STOCK',
    planned_date DATE,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tasks Table
CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'TODO',
    priority VARCHAR(20) DEFAULT 'MEDIUM',
    task_type VARCHAR(50) NOT NULL DEFAULT 'PRODUCTION_ORDER',
    client_name VARCHAR(255),
    order_code VARCHAR(100),
    item_reference VARCHAR(255),
    quantity NUMERIC(12,2),
    quantity_unit VARCHAR(50) DEFAULT 'pcs',
    due_date DATE,
    planned_date DATE,
    production_line VARCHAR(120),
    machine VARCHAR(120),
    workshop VARCHAR(120),
    notes TEXT,
    expected_action TEXT,
    workspace_id INTEGER REFERENCES workspaces(id) ON DELETE SET NULL,
    assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    blocked_reason TEXT,
    blocked_at TIMESTAMP,
    blocked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    completed_at TIMESTAMP,
    board_position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_comments (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_history (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action_type VARCHAR(80) NOT NULL,
    field_name VARCHAR(80),
    old_value TEXT,
    new_value TEXT,
    message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Default workspace
INSERT INTO workspaces (name)
SELECT 'Default'
WHERE NOT EXISTS (SELECT 1 FROM workspaces WHERE name = 'Default');

-- Ensure indexed columns exist for existing databases
ALTER TABLE IF EXISTS tasks ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE IF EXISTS tasks ADD COLUMN IF NOT EXISTS production_line VARCHAR(120);
ALTER TABLE IF EXISTS tasks ADD COLUMN IF NOT EXISTS machine VARCHAR(120);

CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_production_line ON tasks(production_line);
CREATE INDEX IF NOT EXISTS idx_tasks_machine ON tasks(machine);
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_history_task_id ON task_history(task_id, created_at DESC);
