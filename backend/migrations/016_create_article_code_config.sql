-- Migration 016: Create article_code_config table
-- Purpose: Configure which code patterns to extract during OCR scan

CREATE TABLE IF NOT EXISTS article_code_config (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    label VARCHAR(100) NOT NULL,
    pattern_regex VARCHAR(255) NOT NULL,
    example_code VARCHAR(255),
    priority INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Pre-populate with common paper/bobine code patterns
INSERT INTO article_code_config (name, label, pattern_regex, example_code, priority) VALUES
    ('code_bobine', 'Code Bobine Principal', '\d{6,12}', '426856004', 1),
    ('code_lot', 'Code Lot', '[A-Z]{2,4}\d{2,4}[-]?\d{1,5}', 'GA25-1462', 2),
    ('code_barre', 'Code Barre Long', '\d{12,}', '911152050267411096', 3),
    ('code_client', 'Code Client', '[A-Z]{3}\d{4,8}', 'MON123456', 4),
    ('ref_article', 'Référence Article', '[A-Z]{2}\d{6}', 'CI123456', 5);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_article_code_config_active ON article_code_config(is_active) WHERE is_active = TRUE;

COMMENT ON TABLE article_code_config IS 'Configuration for article code patterns to detect during OCR scan';
COMMENT ON COLUMN article_code_config.pattern_regex IS 'Regular expression pattern to match codes';
COMMENT ON COLUMN article_code_config.priority IS 'Detection priority (1 = highest)';