-- Table to store articles imported from Excel migration
CREATE TABLE IF NOT EXISTS stock_import (
    id SERIAL PRIMARY KEY,
    article VARCHAR(255) NOT NULL,
    quantity NUMERIC(12,2) NOT NULL,
    imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ready_date DATE NOT NULL,
    is_used BOOLEAN NOT NULL DEFAULT FALSE
);

-- Link tasks to the stock_import entry they originated from
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS stock_import_id INTEGER REFERENCES stock_import(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_import_ready_date ON stock_import(ready_date, is_used);
CREATE INDEX IF NOT EXISTS idx_tasks_stock_import_id ON tasks(stock_import_id);
