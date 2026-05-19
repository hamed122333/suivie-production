-- Migration 015 : Table roll_scans — cycle de vie des bobines scannées
-- (capture → extraction IA en arrière-plan → vérification opérateur)
-- Compatible PostgreSQL local + Supabase.
-- NB : le service OCR Python applique aussi ce schéma au démarrage
--      (CREATE IF NOT EXISTS + ALTER), les deux restent cohérents.

CREATE TABLE IF NOT EXISTS roll_scans (
    id                  SERIAL          PRIMARY KEY,
    status              VARCHAR(20)     NOT NULL DEFAULT 'pending',
    image_data          TEXT,
    thumbnail           TEXT,
    storage_location    VARCHAR(30),
    supplier            VARCHAR(150),
    reel_serial_number  VARCHAR(80),
    grammage            NUMERIC(7,1),
    width_mm            NUMERIC(9,1),
    weight_kg           NUMERIC(9,1),
    confidence          JSONB,
    error_message       TEXT,
    captured_at         TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    extracted_at        TIMESTAMP,
    verified_at         TIMESTAMP
);

-- Migrations pour une table roll_scans déjà existante (ancien schéma)
ALTER TABLE roll_scans ADD COLUMN IF NOT EXISTS status        VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE roll_scans ADD COLUMN IF NOT EXISTS image_data    TEXT;
ALTER TABLE roll_scans ADD COLUMN IF NOT EXISTS thumbnail     TEXT;
ALTER TABLE roll_scans ADD COLUMN IF NOT EXISTS confidence    JSONB;
ALTER TABLE roll_scans ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE roll_scans ADD COLUMN IF NOT EXISTS captured_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE roll_scans ADD COLUMN IF NOT EXISTS extracted_at  TIMESTAMP;
ALTER TABLE roll_scans ADD COLUMN IF NOT EXISTS verified_at   TIMESTAMP;
ALTER TABLE roll_scans ALTER COLUMN supplier         DROP NOT NULL;
ALTER TABLE roll_scans ALTER COLUMN storage_location DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_roll_scans_status   ON roll_scans(status);
CREATE INDEX IF NOT EXISTS idx_roll_scans_captured ON roll_scans(captured_at DESC);
