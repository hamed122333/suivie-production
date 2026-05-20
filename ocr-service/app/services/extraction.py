"""
Extraction des 5 champs d'une étiquette de bobine.

Source principale : IA visuelle (NVIDIA NIM) — légère, aucune dépendance lourde.
Repli OPTIONNEL : pipeline OCR local (PaddleOCR).

Le repli OCR n'est chargé que si ses dépendances sont installées
(paddlepaddle / paddleocr — voir requirements-ocr.txt). En production
« vision-only », le service tourne sans ces paquets volumineux.
"""

import logging

from app.services import vision_extractor

logger = logging.getLogger(__name__)

_EMPTY = {
    "supplier": None, "reel_serial_number": None,
    "grammage": None, "width_mm": None, "weight_kg": None,
}


def extract_roll(image_bytes: bytes) -> dict:
    """
    Extrait {supplier, reel_serial_number, grammage, width_mm, weight_kg,
             confidence, method}.

    'method' : 'vision-ai', 'ocr-local' ou 'failed'.
    """
    # 1. IA visuelle (source principale)
    if vision_extractor.is_available():
        try:
            vision = vision_extractor.extract_from_image(image_bytes)
        except Exception as e:
            logger.warning(f"IA visuelle erreur: {e}")
            vision = None
        if vision and any(vision.get(k) is not None
                          for k in ("supplier", "grammage", "width_mm", "weight_kg")):
            return {
                "supplier":           vision.get("supplier"),
                "reel_serial_number": vision.get("reel_serial_number"),
                "grammage":           vision.get("grammage"),
                "width_mm":           vision.get("width_mm"),
                "weight_kg":          vision.get("weight_kg"),
                "confidence":         vision.get("confidence") or {},
                "method":             "vision-ai",
            }

    # 2. Pipeline OCR local (repli optionnel)
    ocr_result = _try_ocr_fallback(image_bytes)
    if ocr_result is not None:
        return ocr_result

    # 3. Échec — la bobine sera à saisir manuellement
    return {**_EMPTY, "confidence": {}, "method": "failed"}


def _try_ocr_fallback(image_bytes: bytes) -> dict | None:
    """Pipeline OCR local. Renvoie None si indisponible (paddleocr absent)."""
    try:
        from app.services.preprocess import preprocessor
        from app.services.ocr_engine import ocr_engine
        from app.services.supplier_detector import supplier_detector
        from app.services.parsers import get_parser
        from app.services.validators import validator
    except ImportError:
        logger.info("Repli OCR local indisponible (paddleocr non installé) "
                    "— mode vision-only.")
        return None

    try:
        pre = preprocessor.preprocess(image_bytes)
        blocks = ocr_engine.run(pre["variants"], pre["scale"])
        if not blocks:
            return None
        full_text = ocr_engine.full_text(blocks)
        supplier = supplier_detector.detect(full_text, blocks)
        validated = validator.validate_all(get_parser(supplier.name).parse(blocks))

        def value_of(field):
            ex = validated.get(field)
            return ex.get("value") if ex else None

        return {
            "supplier":           supplier.display_name or supplier.name,
            "reel_serial_number": value_of("reel_serial_number"),
            "grammage":           value_of("grammage"),
            "width_mm":           value_of("width_mm"),
            "weight_kg":          value_of("weight_kg"),
            "confidence":         {},
            "method":             "ocr-local",
        }
    except Exception as e:
        logger.error(f"Pipeline OCR local échoué: {e}")
        return None
