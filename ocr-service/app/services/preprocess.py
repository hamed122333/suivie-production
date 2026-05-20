"""
Préprocessing image pour OCR industriel — VERSION MULTI-VARIANTES.

Principe : une seule image peut être lue différemment selon le traitement.
Ex : le grammage "115" est lu "775" sur une variante grise mais correctement
sur la variante couleur. On génère donc PLUSIEURS variantes ; le moteur OCR
lance une passe sur chacune et fusionne les résultats en gardant, pour chaque
zone, la lecture la plus confiante.

Améliorations clés vs version précédente :
- Correction de l'orientation EXIF (photos prises au téléphone)
- Résolution OCR plus haute (1800px) → petits chiffres mieux reconnus
- 3 variantes : couleur, gris rehaussé, binaire adaptatif
- Coordonnées renormalisées vers un espace 1400px (spatial parser inchangé)
"""

import io
import logging

import cv2
import numpy as np
from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

OCR_WIDTH  = 1800   # résolution d'analyse OCR (petits caractères mieux lus)
NORM_WIDTH = 1400   # espace de coordonnées normalisé (constantes spatial parser)


class ImagePreprocessor:

    def preprocess(self, image_bytes: bytes) -> dict:
        """
        Returns dict:
            variants : list[np.ndarray]  — images BGR à passer à l'OCR
            scale    : float             — facteur bbox(OCR) → espace NORM_WIDTH
            display  : np.ndarray         — image normalisée pour affichage
        """
        img = self._decode_with_exif(image_bytes)
        if img is None:
            raise ValueError("Impossible de décoder l'image. Format non supporté.")

        # Redimensionner à la résolution OCR
        img_ocr = self._resize_width(img, OCR_WIDTH)

        # Débruitage gris calculé une seule fois (partagé par 2 variantes)
        gray = cv2.cvtColor(img_ocr, cv2.COLOR_BGR2GRAY)
        gray_denoised = cv2.fastNlMeansDenoising(
            gray, h=7, templateWindowSize=7, searchWindowSize=21
        )

        variants = [
            self._variant_color(img_ocr),          # couleur, sharpen doux
            self._variant_gray(gray_denoised),     # gris + CLAHE + sharpen
            self._variant_binary(gray_denoised),   # binaire adaptatif
        ]

        display = self._resize_width(img, NORM_WIDTH)
        scale = NORM_WIDTH / img_ocr.shape[1]

        logger.info(f"Préprocessing: {len(variants)} variantes @ {OCR_WIDTH}px "
                    f"(scale → {NORM_WIDTH}px = {scale:.3f})")

        return {"variants": variants, "scale": scale, "display": display}

    # ── Décodage ───────────────────────────────────────────────────────────

    def _decode_with_exif(self, image_bytes: bytes):
        """Décode l'image en corrigeant l'orientation EXIF (photos téléphone)."""
        try:
            pil = Image.open(io.BytesIO(image_bytes))
            pil = ImageOps.exif_transpose(pil)   # applique la rotation EXIF
            pil = pil.convert("RGB")
            rgb = np.array(pil)
            return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        except Exception as e:
            logger.warning(f"Décodage PIL échoué ({e}), fallback OpenCV")
            nparr = np.frombuffer(image_bytes, np.uint8)
            return cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    def _resize_width(self, img: np.ndarray, target_width: int) -> np.ndarray:
        h, w = img.shape[:2]
        if w == target_width:
            return img
        scale = target_width / w
        interp = cv2.INTER_CUBIC if scale > 1 else cv2.INTER_AREA
        return cv2.resize(img, (target_width, int(h * scale)), interpolation=interp)

    # ── Variantes ──────────────────────────────────────────────────────────

    def _variant_color(self, img: np.ndarray) -> np.ndarray:
        """Couleur préservée + débruitage bilatéral + sharpen doux.
        PaddleOCR est entraîné sur des images naturelles : la couleur aide
        à séparer le texte des fonds colorés (en-têtes verts par ex.)."""
        den = cv2.bilateralFilter(img, d=5, sigmaColor=50, sigmaSpace=50)
        blur = cv2.GaussianBlur(den, (0, 0), 2.0)
        return cv2.addWeighted(den, 1.3, blur, -0.3, 0)

    def _variant_gray(self, gray_denoised: np.ndarray) -> np.ndarray:
        """Niveaux de gris + unsharp mask + CLAHE (contraste local).
        Efficace sur le texte pâle / délavé."""
        blur = cv2.GaussianBlur(gray_denoised, (0, 0), 2.0)
        sharp = cv2.addWeighted(gray_denoised, 1.5, blur, -0.5, 0)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(sharp)
        return cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)

    def _variant_binary(self, gray_denoised: np.ndarray) -> np.ndarray:
        """Seuillage adaptatif gaussien — robuste à l'éclairage inégal
        (ombres, reflets sur l'étiquette plastifiée)."""
        binary = cv2.adaptiveThreshold(
            gray_denoised, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY,
            blockSize=25, C=10,
        )
        return cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)

    # ── Utilitaire ─────────────────────────────────────────────────────────

    def image_to_bytes(self, img: np.ndarray, quality: int = 90) -> bytes:
        _, encoded = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, quality])
        return encoded.tobytes()


# Singleton
preprocessor = ImagePreprocessor()
