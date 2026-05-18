"""
Routes du cycle de vie des bobines.

POST   /api/rolls         — Capture (photo + emplacement) — réponse immédiate
GET    /api/rolls         — Liste pour le tableau
GET    /api/rolls/{id}    — Détail + photo (pour le modal de vérification)
PUT    /api/rolls/{id}    — Correction + validation par l'opérateur
DELETE /api/rolls/{id}    — Suppression
"""

import base64
import io
import logging

from fastapi import APIRouter, File, Form, UploadFile, HTTPException
from pydantic import BaseModel
from PIL import Image, ImageOps

from app.services import database

logger = logging.getLogger(__name__)
router = APIRouter()


def _encode(img: Image.Image, max_size: int, quality: int) -> str:
    """Redimensionne et encode une image en base64 JPEG."""
    w, h = img.size
    longest = max(w, h)
    if longest > max_size:
        scale = max_size / longest
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=quality)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def _prepare_images(image_bytes: bytes) -> tuple[str, str]:
    """
    Retourne (image complète, miniature) en base64 JPEG.
    - image complète : 1400px, qualité 85 — pour l'extraction et le modal
    - miniature      : 240px, qualité 70 — pour le tableau (chargement rapide)
    """
    img = Image.open(io.BytesIO(image_bytes))
    img = ImageOps.exif_transpose(img).convert("RGB")
    return _encode(img, 1400, 85), _encode(img, 240, 70)


@router.post("/rolls")
async def capture_roll(
    file: UploadFile = File(...),
    storage_location: str = Form(default=""),
):
    """Capture une bobine. Enregistre la photo et l'emplacement, puis répond
    IMMÉDIATEMENT (l'extraction se fait en arrière-plan)."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400,
                            detail="Format invalide — envoyer une image.")
    raw = await file.read()
    if len(raw) < 800:
        raise HTTPException(status_code=400,
                            detail="Image trop petite ou corrompue.")
    try:
        image_b64, thumb_b64 = _prepare_images(raw)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Image illisible: {e}")

    location = (storage_location or "").strip() or None
    row = database.create_roll(image_b64, thumb_b64, location)
    logger.info(f"Bobine #{row['id']} capturée (emplacement: {location})")
    return row


@router.get("/rolls")
async def list_rolls():
    """Liste des bobines (sans image) + compteurs de statut."""
    return {"rolls": database.list_rolls(), "stats": database.stats()}


@router.get("/rolls/{roll_id}")
async def get_roll(roll_id: int):
    """Détail d'une bobine, image comprise."""
    row = database.get_roll(roll_id)
    if not row:
        raise HTTPException(status_code=404, detail="Bobine introuvable.")
    return row


class RollUpdate(BaseModel):
    supplier: str | None = None
    reel_serial_number: str | None = None
    grammage: float | None = None
    width_mm: float | None = None
    weight_kg: float | None = None
    storage_location: str | None = None


@router.put("/rolls/{roll_id}")
async def update_roll(roll_id: int, data: RollUpdate):
    """Enregistre les corrections de l'opérateur et valide la bobine."""
    row = database.update_roll(roll_id, data.model_dump())
    if not row:
        raise HTTPException(status_code=404, detail="Bobine introuvable.")
    logger.info(f"Bobine #{roll_id} vérifiée et validée")
    return row


@router.delete("/rolls/{roll_id}")
async def delete_roll(roll_id: int):
    """Supprime une bobine."""
    if not database.delete_roll(roll_id):
        raise HTTPException(status_code=404, detail="Bobine introuvable.")
    return {"deleted": True}
