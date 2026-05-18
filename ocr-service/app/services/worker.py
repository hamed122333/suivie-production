"""
Worker d'extraction en arrière-plan.

Tourne dans un thread démon : il prend les bobines en attente une par une,
les fait extraire par l'IA, puis enregistre le résultat. L'opérateur n'attend
jamais — il continue à capturer des photos pendant que le worker travaille.
"""

import base64
import logging
import threading
import time

from app.services import database, extraction

logger = logging.getLogger(__name__)

_POLL_INTERVAL = 4  # secondes entre deux vérifications de la file


def _process_one() -> bool:
    """Traite UNE bobine en attente. Retourne True si une a été traitée."""
    try:
        roll = database.claim_next_pending()
    except Exception as e:
        logger.error(f"Worker — accès à la file échoué: {e}")
        return False

    if not roll:
        return False

    roll_id = roll["id"]
    logger.info(f"Worker — extraction de la bobine #{roll_id}…")
    try:
        image_bytes = base64.b64decode(roll["image_data"])
        data = extraction.extract_roll(image_bytes)
        if data.get("method") == "failed":
            data["error_message"] = ("Extraction automatique impossible — "
                                     "saisie manuelle requise")
        database.save_extraction(roll_id, data)
        logger.info(f"Worker — bobine #{roll_id} extraite ({data.get('method')})")
    except Exception as e:
        logger.error(f"Worker — bobine #{roll_id} a échoué: {e}")
        try:
            database.save_extraction(roll_id, {
                "supplier": None, "reel_serial_number": None,
                "grammage": None, "width_mm": None, "weight_kg": None,
                "confidence": {}, "error_message": str(e)[:300],
            })
        except Exception:
            pass
    return True


def _loop() -> None:
    logger.info("Worker d'extraction démarré.")
    while True:
        try:
            worked = _process_one()
        except Exception as e:
            logger.error(f"Worker — erreur inattendue: {e}")
            worked = False
        if not worked:
            time.sleep(_POLL_INTERVAL)


def start() -> None:
    """Lance le worker dans un thread démon."""
    threading.Thread(target=_loop, name="extraction-worker", daemon=True).start()
