"""
Couche base de données — table roll_scans (cycle de vie complet).

Cycle de vie d'une bobine :
  pending     → photo capturée, en attente d'extraction
  processing  → en cours de traitement par le worker (transitoire)
  extracted   → données extraites par l'IA, à vérifier par l'opérateur
  verified    → vérifiée et validée par l'opérateur

Fonctionne en local (PostgreSQL) et en production (Supabase) via DATABASE_URL.
"""

import json
import logging
from contextlib import contextmanager
from decimal import Decimal

import psycopg2
import psycopg2.extras

from app.config import settings

logger = logging.getLogger(__name__)


@contextmanager
def get_db():
    """Ouvre et ferme proprement la connexion."""
    conn = None
    try:
        conn = psycopg2.connect(settings.database_url, connect_timeout=10)
        conn.autocommit = False
        yield conn
        conn.commit()
    except Exception:
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()


# ── Initialisation / migration du schéma ───────────────────────────────────

def init_db() -> None:
    """Crée la table roll_scans si besoin et applique les migrations."""
    ddl = """
    CREATE TABLE IF NOT EXISTS roll_scans (
        id                 SERIAL PRIMARY KEY,
        status             VARCHAR(20)  NOT NULL DEFAULT 'pending',
        image_data         TEXT,
        thumbnail          TEXT,
        storage_location   VARCHAR(30),
        supplier           VARCHAR(150),
        reel_serial_number VARCHAR(80),
        grammage           NUMERIC(7,1),
        width_mm           NUMERIC(9,1),
        weight_kg          NUMERIC(9,1),
        confidence         JSONB,
        error_message      TEXT,
        captured_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        extracted_at       TIMESTAMP,
        verified_at        TIMESTAMP
    );
    -- Migrations pour une table roll_scans déjà existante
    ALTER TABLE roll_scans ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending';
    ALTER TABLE roll_scans ADD COLUMN IF NOT EXISTS image_data TEXT;
    ALTER TABLE roll_scans ADD COLUMN IF NOT EXISTS thumbnail TEXT;
    ALTER TABLE roll_scans ADD COLUMN IF NOT EXISTS confidence JSONB;
    ALTER TABLE roll_scans ADD COLUMN IF NOT EXISTS error_message TEXT;
    ALTER TABLE roll_scans ADD COLUMN IF NOT EXISTS captured_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE roll_scans ADD COLUMN IF NOT EXISTS extracted_at TIMESTAMP;
    ALTER TABLE roll_scans ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP;
    ALTER TABLE roll_scans ALTER COLUMN supplier DROP NOT NULL;
    ALTER TABLE roll_scans ALTER COLUMN storage_location DROP NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_roll_scans_status ON roll_scans(status);
    CREATE INDEX IF NOT EXISTS idx_roll_scans_captured ON roll_scans(captured_at DESC);
    -- Récupération : relancer les bobines bloquées en 'processing'
    UPDATE roll_scans SET status = 'pending' WHERE status = 'processing';
    """
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(ddl)
    logger.info("Schéma roll_scans prêt.")


# ── Capture ─────────────────────────────────────────────────────────────────

def create_roll(image_data: str, thumbnail: str,
                storage_location: str | None) -> dict:
    """Enregistre une bobine capturée (statut 'pending'). Réponse immédiate."""
    sql = """
        INSERT INTO roll_scans (status, image_data, thumbnail, storage_location)
        VALUES ('pending', %s, %s, %s)
        RETURNING id, status, captured_at
    """
    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, (image_data, thumbnail, storage_location))
            return _clean(cur.fetchone())


# ── Lecture ─────────────────────────────────────────────────────────────────

def list_rolls(limit: int = 500) -> list[dict]:
    """Liste les bobines (sans l'image, pour alléger le tableau)."""
    sql = """
        SELECT id, status, thumbnail, storage_location, supplier,
               reel_serial_number, grammage, width_mm, weight_kg,
               confidence, error_message,
               captured_at, extracted_at, verified_at
        FROM roll_scans
        ORDER BY captured_at DESC
        LIMIT %s
    """
    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, (limit,))
            return [_clean(r) for r in cur.fetchall()]


def get_roll(roll_id: int) -> dict | None:
    """Détail d'une bobine, image comprise (pour le modal de vérification)."""
    sql = "SELECT * FROM roll_scans WHERE id = %s"
    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, (roll_id,))
            row = cur.fetchone()
            return _clean(row) if row else None


def stats() -> dict:
    """Compteurs par statut (pour le tableau de bord)."""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT status, COUNT(*) FROM roll_scans GROUP BY status")
            counts = {row[0]: row[1] for row in cur.fetchall()}
    return {
        "pending":   counts.get("pending", 0) + counts.get("processing", 0),
        "extracted": counts.get("extracted", 0),
        "verified":  counts.get("verified", 0),
    }


# ── Mise à jour ─────────────────────────────────────────────────────────────

def update_roll(roll_id: int, fields: dict) -> dict | None:
    """Applique les corrections de l'opérateur et passe en statut 'verified'."""
    sql = """
        UPDATE roll_scans SET
            supplier           = %(supplier)s,
            reel_serial_number = %(reel_serial_number)s,
            grammage           = %(grammage)s,
            width_mm           = %(width_mm)s,
            weight_kg          = %(weight_kg)s,
            storage_location   = %(storage_location)s,
            status             = 'verified',
            verified_at        = CURRENT_TIMESTAMP
        WHERE id = %(id)s
        RETURNING id, status, verified_at
    """
    params = {
        "id": roll_id,
        "supplier": fields.get("supplier"),
        "reel_serial_number": fields.get("reel_serial_number"),
        "grammage": fields.get("grammage"),
        "width_mm": fields.get("width_mm"),
        "weight_kg": fields.get("weight_kg"),
        "storage_location": fields.get("storage_location"),
    }
    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
            return _clean(row) if row else None


def delete_roll(roll_id: int) -> bool:
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM roll_scans WHERE id = %s", (roll_id,))
            return cur.rowcount > 0


# ── Worker d'extraction ─────────────────────────────────────────────────────

def claim_next_pending() -> dict | None:
    """
    Réserve atomiquement la prochaine bobine à traiter (statut 'pending'
    → 'processing'). SKIP LOCKED évite tout double traitement.
    """
    sql = """
        UPDATE roll_scans SET status = 'processing'
        WHERE id = (
            SELECT id FROM roll_scans WHERE status = 'pending'
            ORDER BY captured_at LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING id, image_data
    """
    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql)
            row = cur.fetchone()
            return dict(row) if row else None


def save_extraction(roll_id: int, data: dict) -> None:
    """Enregistre le résultat de l'extraction IA (statut → 'extracted')."""
    sql = """
        UPDATE roll_scans SET
            status             = 'extracted',
            supplier           = %(supplier)s,
            reel_serial_number = %(reel_serial_number)s,
            grammage           = %(grammage)s,
            width_mm           = %(width_mm)s,
            weight_kg          = %(weight_kg)s,
            confidence         = %(confidence)s,
            error_message      = %(error_message)s,
            extracted_at       = CURRENT_TIMESTAMP
        WHERE id = %(id)s
    """
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, {
                "id": roll_id,
                "supplier": data.get("supplier"),
                "reel_serial_number": data.get("reel_serial_number"),
                "grammage": data.get("grammage"),
                "width_mm": data.get("width_mm"),
                "weight_kg": data.get("weight_kg"),
                "confidence": json.dumps(data.get("confidence") or {}),
                "error_message": data.get("error_message"),
            })


def check_db_connection() -> bool:
    """Vérifie l'accès à la base (utilisé par /health)."""
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        return True
    except Exception as e:
        logger.error(f"DB health check échoué: {e}")
        return False


# ── Utilitaire ──────────────────────────────────────────────────────────────

def _clean(row) -> dict:
    """Convertit Decimal → float et datetime → ISO pour la sérialisation JSON."""
    if row is None:
        return {}
    out = {}
    for key, value in dict(row).items():
        if isinstance(value, Decimal):
            out[key] = float(value)
        elif hasattr(value, "isoformat"):
            out[key] = value.isoformat()
        else:
            out[key] = value
    return out
