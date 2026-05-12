-- Stock History Table
-- Tracks every stock addition with exact date for analysis purposes

CREATE TABLE IF NOT EXISTS stock_history (
    id SERIAL PRIMARY KEY,
    article VARCHAR(50) NOT NULL,
    quantity_added NUMERIC(12, 2) NOT NULL,
    quantity_before NUMERIC(12, 2) DEFAULT 0,
    quantity_after NUMERIC(12, 2) NOT NULL,
    source VARCHAR(50) NOT NULL DEFAULT 'manual',
    source_detail TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_stock_history_article ON stock_history(article);
CREATE INDEX IF NOT EXISTS idx_stock_history_created_at ON stock_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_history_article_date ON stock_history(article, created_at DESC);