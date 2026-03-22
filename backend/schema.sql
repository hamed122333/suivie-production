-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user', -- 'admin', 'user'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tasks Table
CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'TODO', -- TODO, IN_PROGRESS, DONE, BLOCKED
    priority VARCHAR(20) DEFAULT 'MEDIUM', -- LOW, MEDIUM, HIGH
    assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    blocked_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed Initial Admin User (password: admin123)
-- Only if not exists
INSERT INTO users (name, email, password, role)
VALUES ('System Admin', 'admin@example.com', '$2a$10$X7V.m1.Z.1.1.X.1.X.1.X.1.X.1.X.1.X.1.X.1.X.1', 'admin')
ON CONFLICT (email) DO NOTHING;

-- Seed Some Users
INSERT INTO users (name, email, password, role)
VALUES ('Operator One', 'op1@example.com', '$2a$10$X7V.m1.Z.1.1.X.1.X.1.X.1.X.1.X.1.X.1.X.1.X.1', 'user')
ON CONFLICT (email) DO NOTHING;

