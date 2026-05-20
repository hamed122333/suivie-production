"""
Worker d'extraction — modèle « pull » (déclenché à la demande).

Pas de thread permanent : l'extraction est lancée par les requêtes de
l'application elle-même (capture d'une bobine, consultation du tableau,
ping keep-alive sur /health).

Un verrou garantit qu'une seule vague d'extraction tourne à la fois ;
cette vague traite TOUTE la file d'attente puis s'arrête.

→ Fonctionne parfaitement sur l'offre gratuite Render : aucun service
  toujours actif n'est nécessaire. Si le service s'endort en pleine
  extraction, la bobine restée en 'processing' est remise en 'pending'
  au prochain démarrage (voir database.init_db).
"""

import base64
import logging
import threading

from app.services import database, extraction

logger = logging.getLogger(__name__)

_lock = threading.Lock()


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


def _drain() -> None:
    """Traite toute la file d'attente, bobine après bobine, puis s'arrête."""
    if not _lock.acquire(blocking=False):
        return  # une vague d'extraction est déjà en cours
    try:
        while _process_one():
            pass
    finally:
        _lock.release()


def trigger() -> None:
    """
    Déclenche l'extraction des bobines en attente, en arrière-plan.
    Sans effet si une vague est déjà en cours (verrou non bloquant).
    """
    threading.Thread(target=_drain, name="extraction-drain", daemon=True).start()
