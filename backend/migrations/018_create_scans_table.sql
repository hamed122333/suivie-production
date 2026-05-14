-- Migration: Create scans table for bobine scan feature
-- Date: 2026-05-14

-- Table for storing scan data
CREATE TABLE IF NOT EXISTS scans (
    id SERIAL PRIMARY KEY,
    image_url TEXT,
    raw_ocr_text TEXT,
    supplier VARCHAR(100),
    supplier_confidence DECIMAL(3,2) DEFAULT 0,
    width VARCHAR(20),
    width_confidence DECIMAL(3,2) DEFAULT 0,
    weight VARCHAR(20),
    weight_confidence DECIMAL(3,2) DEFAULT 0,
    reel_serial_number VARCHAR(50),
    reel_confidence DECIMAL(3,2) DEFAULT 0,
    bobine_place VARCHAR(20),
    status VARCHAR(20) DEFAULT 'uploading',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_scans_status ON scans(status);
CREATE INDEX IF NOT EXISTS idx_scans_created_at ON scans(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scans_supplier ON scans(supplier);
CREATE INDEX IF NOT EXISTS idx_scans_reel ON scans(reel_serial_number);

-- Comments
COMMENT ON TABLE scans IS 'Stock bobine scan data with OCR extraction';
COMMENT ON COLUMN scans.supplier IS 'Supplier name extracted from label';
COMMENT ON COLUMN scans.width IS 'Width in mm';
COMMENT ON COLUMN scans.weight IS 'Weight in kg';
COMMENT ON COLUMN scans.reel_serial_number IS 'Unique reel/bobine identifier';
COMMENT ON COLUMN scans.bobine_place IS 'Physical location (S1, A2, etc.)';
COMMENT ON COLUMN scans.status IS 'Status: uploading, processed, pending, validated, failed';