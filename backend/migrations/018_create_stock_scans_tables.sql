-- Stock Scan System Tables
-- Created: 2026-05-13
-- Purpose: Store article code scans, OCR data, and user corrections

-- Main scans table (images and detected codes)
CREATE TABLE IF NOT EXISTS stock_scans (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Image metadata
  image_filename VARCHAR(255) NOT NULL,
  image_data_url TEXT, -- Base64 or file path reference
  image_width INTEGER,
  image_height INTEGER,
  image_format VARCHAR(10), -- JPEG, PNG, WebP, etc
  image_size_bytes INTEGER,

  -- OCR raw data
  ocr_raw_text TEXT NOT NULL, -- Full OCR extracted text
  ocr_confidence DECIMAL(5, 2), -- Average confidence 0-100
  ocr_language VARCHAR(10) DEFAULT 'fra', -- Detected language
  ocr_words_count INTEGER,

  -- Detected article code
  detected_code VARCHAR(50), -- Best candidate code
  detected_score DECIMAL(5, 2), -- Score of detected code (0-100)
  detected_source VARCHAR(30), -- Source of detection (direct_word, substring, etc)
  detected_confidence DECIMAL(5, 2), -- OCR confidence for this word

  -- Bounding box of detected code
  bbox_x0 INTEGER,
  bbox_y0 INTEGER,
  bbox_x1 INTEGER,
  bbox_y1 INTEGER,

  -- Processing metadata
  processing_time_ms INTEGER, -- How long OCR took
  preprocessing_applied JSONB, -- Preprocessing parameters used

  -- Context info
  supplier VARCHAR(100), -- Supplier/manufacturer name
  label_type VARCHAR(30), -- thermal, printed, barcode, handwritten
  notes TEXT,

  -- Status
  status VARCHAR(20) DEFAULT 'pending', -- pending, confirmed, corrected, rejected
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,

  CONSTRAINT valid_status CHECK (status IN ('pending', 'confirmed', 'corrected', 'rejected'))
);

CREATE INDEX idx_stock_scans_created_at ON stock_scans(created_at);
CREATE INDEX idx_stock_scans_detected_code ON stock_scans(detected_code);
CREATE INDEX idx_stock_scans_status ON stock_scans(status);
CREATE INDEX idx_stock_scans_supplier ON stock_scans(supplier);
CREATE INDEX idx_stock_scans_user_id ON stock_scans(user_id);

-- All candidates from a single scan
CREATE TABLE IF NOT EXISTS scan_candidates (
  id SERIAL PRIMARY KEY,
  scan_id INTEGER NOT NULL REFERENCES stock_scans(id) ON DELETE CASCADE,

  -- Candidate text and source
  text VARCHAR(50) NOT NULL,
  source VARCHAR(30), -- direct_word, substring, combination, etc
  original_text VARCHAR(100), -- Original text before normalization

  -- Scoring
  total_score DECIMAL(5, 2),
  ocr_confidence DECIMAL(5, 2),

  -- Heuristic scores breakdown
  score_prefix DECIMAL(5, 2),
  score_length DECIMAL(5, 2),
  score_digit_letter_ratio DECIMAL(5, 2),
  score_ocr_confidence DECIMAL(5, 2),
  score_spatial_isolation DECIMAL(5, 2),
  score_pattern DECIMAL(5, 2),
  score_source_quality DECIMAL(5, 2),
  score_no_date DECIMAL(5, 2),
  score_no_weight DECIMAL(5, 2),
  score_visual_prominence DECIMAL(5, 2),

  -- Bounding box if available
  bbox_x0 INTEGER,
  bbox_y0 INTEGER,
  bbox_x1 INTEGER,
  bbox_y1 INTEGER,

  -- Metadata
  metadata JSONB,
  rank INTEGER, -- Rank among candidates (1 = best)

  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT unique_candidate_per_scan UNIQUE(scan_id, text)
);

CREATE INDEX idx_scan_candidates_scan_id ON scan_candidates(scan_id);
CREATE INDEX idx_scan_candidates_score ON scan_candidates(total_score DESC);
CREATE INDEX idx_scan_candidates_rank ON scan_candidates(rank);

-- User corrections and feedback
CREATE TABLE IF NOT EXISTS scan_corrections (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  scan_id INTEGER NOT NULL REFERENCES stock_scans(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  -- Correction data
  original_text VARCHAR(50), -- What system predicted
  corrected_text VARCHAR(50) NOT NULL, -- What user provided
  was_correct BOOLEAN, -- Was the original correct? (confirmation)

  -- Feedback
  reason VARCHAR(255), -- Why user corrected/confirmed
  feedback_type VARCHAR(20) DEFAULT 'correction', -- correction, confirmation

  CONSTRAINT valid_feedback_type CHECK (feedback_type IN ('correction', 'confirmation'))
);

CREATE INDEX idx_scan_corrections_scan_id ON scan_corrections(scan_id);
CREATE INDEX idx_scan_corrections_user_id ON scan_corrections(user_id);
CREATE INDEX idx_scan_corrections_created_at ON scan_corrections(created_at);

-- Learning patterns extracted from corrections
CREATE TABLE IF NOT EXISTS learning_patterns (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Pattern identification
  pattern_type VARCHAR(30), -- prefix, suffix, separator, length_range, etc
  pattern_value VARCHAR(100),

  -- Pattern statistics
  total_occurrences INTEGER DEFAULT 0,
  correct_count INTEGER DEFAULT 0,
  accuracy DECIMAL(5, 2), -- Percentage of correct detections

  -- Supplier-specific
  supplier VARCHAR(100), -- NULL = universal pattern
  label_type VARCHAR(30), -- NULL = all label types

  -- Confidence
  data_points INTEGER DEFAULT 0, -- How many corrections informed this
  confidence_level DECIMAL(5, 2), -- 0-100

  -- Heuristic weight recommendations
  recommended_weight_adjustment DECIMAL(5, 2), -- Percentage adjustment

  notes TEXT,

  CONSTRAINT unique_pattern UNIQUE(pattern_type, pattern_value, COALESCE(supplier, ''), COALESCE(label_type, ''))
);

CREATE INDEX idx_learning_patterns_supplier ON learning_patterns(supplier);
CREATE INDEX idx_learning_patterns_type ON learning_patterns(pattern_type);
CREATE INDEX idx_learning_patterns_accuracy ON learning_patterns(accuracy DESC);

-- Supplier-specific performance metrics
CREATE TABLE IF NOT EXISTS supplier_metrics (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  supplier VARCHAR(100) UNIQUE NOT NULL,

  -- Performance
  total_scans INTEGER DEFAULT 0,
  correct_scans INTEGER DEFAULT 0,
  accuracy DECIMAL(5, 2),

  -- Label characteristics
  common_prefixes VARCHAR(50), -- JSON array as string
  common_label_types VARCHAR(100), -- JSON array as string
  average_code_length DECIMAL(5, 2),

  -- Most common corrections (top 3)
  common_errors VARCHAR(500), -- JSON array as string

  notes TEXT
);

CREATE INDEX idx_supplier_metrics_accuracy ON supplier_metrics(accuracy DESC);

-- Export history (for Excel exports and integrations)
CREATE TABLE IF NOT EXISTS scan_exports (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,

  -- Export metadata
  export_type VARCHAR(30), -- excel, csv, json
  export_filename VARCHAR(255),

  -- Filter used
  date_from TIMESTAMP WITH TIME ZONE,
  date_to TIMESTAMP WITH TIME ZONE,
  supplier_filter VARCHAR(100),
  status_filter VARCHAR(20),

  -- Result
  records_count INTEGER,
  export_status VARCHAR(20) DEFAULT 'pending', -- pending, completed, failed
  export_data_url TEXT, -- S3/Supabase URL if stored

  notes TEXT
);

CREATE INDEX idx_scan_exports_user_id ON scan_exports(user_id);
CREATE INDEX idx_scan_exports_created_at ON scan_exports(created_at);

-- Audit trail for all scan operations
CREATE TABLE IF NOT EXISTS scan_audit_log (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  scan_id INTEGER REFERENCES stock_scans(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,

  action VARCHAR(50), -- created, updated, corrected, exported, etc
  details JSONB,
  ip_address VARCHAR(45)
);

CREATE INDEX idx_scan_audit_log_scan_id ON scan_audit_log(scan_id);
CREATE INDEX idx_scan_audit_log_user_id ON scan_audit_log(user_id);
CREATE INDEX idx_scan_audit_log_created_at ON scan_audit_log(created_at);
