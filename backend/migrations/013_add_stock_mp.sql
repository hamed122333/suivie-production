CREATE TABLE IF NOT EXISTS stock_mp (
    id SERIAL PRIMARY KEY,
    article VARCHAR(255) NOT NULL,
    quantity NUMERIC(12,2) NOT NULL,
    imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ready_date DATE NOT NULL DEFAULT CURRENT_DATE,
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    designation VARCHAR(255),
    client_code VARCHAR(100),
    client_name VARCHAR(255)
);

-- In case the table existed without these columns
ALTER TABLE stock_mp ADD COLUMN IF NOT EXISTS ready_date DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE stock_mp ADD COLUMN IF NOT EXISTS is_used BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE stock_mp ADD COLUMN IF NOT EXISTS designation VARCHAR(255);
ALTER TABLE stock_mp ADD COLUMN IF NOT EXISTS client_code VARCHAR(100);
ALTER TABLE stock_mp ADD COLUMN IF NOT EXISTS client_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_stock_mp_ready_date ON stock_mp(ready_date, is_used);


