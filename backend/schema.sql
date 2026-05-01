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
CREATE TABLE IF NOT EXISTS workspaces (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
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

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    recipient_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    type VARCHAR(80) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(128) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS finished_product_stock (
    id SERIAL PRIMARY KEY,
    entry_date DATE NOT NULL,
    item_code VARCHAR(100) NOT NULL,
    designation TEXT,
    client_code VARCHAR(100) NOT NULL,
    client_name TEXT,
    quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
    age INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(item_code, entry_date, client_code)
);

-- Default workspace
INSERT INTO workspaces (name)
SELECT 'Default'
WHERE NOT EXISTS (SELECT 1 FROM workspaces WHERE name = 'Default');

-- Ensure indexed columns exist for existing databases
ALTER TABLE IF EXISTS tasks ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE IF EXISTS tasks ADD COLUMN IF NOT EXISTS production_line VARCHAR(120);
ALTER TABLE IF EXISTS tasks ADD COLUMN IF NOT EXISTS machine VARCHAR(120);
ALTER TABLE IF EXISTS tasks ADD COLUMN IF NOT EXISTS proposed_delivery_date DATE;
ALTER TABLE IF EXISTS tasks ADD COLUMN IF NOT EXISTS proposed_by_role VARCHAR(20);
ALTER TABLE IF EXISTS tasks ADD COLUMN IF NOT EXISTS date_negotiation_status VARCHAR(40);
ALTER TABLE IF EXISTS tasks ADD COLUMN IF NOT EXISTS date_negotiation_comment TEXT;
ALTER TABLE IF EXISTS tasks ADD COLUMN IF NOT EXISTS date_negotiation_updated_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_production_line ON tasks(production_line);
CREATE INDEX IF NOT EXISTS idx_tasks_machine ON tasks(machine);
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_history_task_id ON task_history(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created ON notifications(recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread ON notifications(recipient_user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_active ON password_reset_tokens(user_id, used_at, expires_at);
