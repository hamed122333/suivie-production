-- Migration 015: Create scan_inventory table for inventory scanning
-- Purpose: Store scanned images and detected codes from bobine/paper labels

CREATE TABLE IF NOT EXISTS scan_inventory (
    id SERIAL PRIMARY KEY,
    image_url TEXT,
    codes JSONB DEFAULT '[]',
    total_codes INTEGER DEFAULT 0,
    scanned_at TIMESTAMP DEFAULT NOW(),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_scan_inventory_scanned_at ON scan_inventory(scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_inventory_created_by ON scan_inventory(created_by);

-- Comments
COMMENT ON TABLE scan_inventory IS 'Inventory scan history for bobine/paper label OCR';
COMMENT ON COLUMN scan_inventory.codes IS 'Array of detected codes from OCR';
COMMENT ON COLUMN scan_inventory.image_url IS 'URL or path to stored image';