"""
Moteur OCR basé sur PaddleOCR.

VERSION MULTI-PASSES :
- Lance l'OCR sur PLUSIEURS variantes de l'image (couleur, gris, binaire)
- Fusionne les résultats : pour chaque zone détectée par plusieurs variantes,
  on conserve la lecture la plus confiante
- Cela corrige les erreurs de reconnaissance (ex: "115" lu "775")

Améliorations vs version précédente :
- PP-OCRv4 (plus précis) avec repli automatique sur PP-OCRv3
- det_limit_side_len relevé à 1920 → la détection ne sous-échantillonne plus
  l'image (le défaut 960px écrasait les petits chiffres)
- Seuil de détection abaissé → texte pâle mieux capté
"""

import logging

import numpy as np

logger = logging.getLogger(__name__)


def _get_ocr_instance():
    """Initialise PaddleOCR : tente PP-OCRv4, repli sur PP-OCRv3."""
    from paddleocr import PaddleOCR

    common = dict(
        lang="en",                  # chiffres + anglais (labels industriels)
        use_angle_cls=True,         # gère le texte rotaté
        use_gpu=False,
        show_log=False,
        det_db_thresh=0.25,         # plus bas → détecte le texte pâle
        det_db_box_thresh=0.45,
        det_db_unclip_ratio=1.7,    # bbox un peu plus large → moins de texte coupé
        det_limit_side_len=1920,    # ne pas sous-échantillonner (défaut 960 = trop bas)
        det_limit_type="max",
        rec_batch_num=8,
    )

    for version in ("PP-OCRv4", "PP-OCRv3"):
        try:
            inst = PaddleOCR(ocr_version=version, **common)
            logger.info(f"PaddleOCR initialisé ({version})")
            return inst
        except Exception as e:
            logger.warning(f"Init {version} échouée: {e}")

    raise RuntimeError("Impossible d'initialiser PaddleOCR (v4 et v3 ont échoué)")


_ocr_instance = None


def get_ocr():
    global _ocr_instance
    if _ocr_instance is None:
        logger.info("Initialisation PaddleOCR... (première fois ~5-15s)")
        _ocr_instance = _get_ocr_instance()
        logger.info("PaddleOCR prêt.")
    return _ocr_instance


class OcrBlock:
    """Un bloc OCR détecté avec position et confiance."""

    def __init__(self, text: str, confidence: float, bbox: list):
        self.text = text.strip()
        self.confidence = confidence
        self.bbox = bbox  # [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]

    @property
    def center_x(self) -> float:
        return sum(p[0] for p in self.bbox) / 4

    @property
    def center_y(self) -> float:
        return sum(p[1] for p in self.bbox) / 4

    @property
    def height(self) -> float:
        ys = [p[1] for p in self.bbox]
        return max(ys) - min(ys)

    @property
    def width(self) -> float:
        xs = [p[0] for p in self.bbox]
        return max(xs) - min(xs)

    @property
    def left_x(self) -> float:
        return min(p[0] for p in self.bbox)

    @property
    def right_x(self) -> float:
        return max(p[0] for p in self.bbox)

    @property
    def top_y(self) -> float:
        return min(p[1] for p in self.bbox)

    @property
    def bottom_y(self) -> float:
        return max(p[1] for p in self.bbox)

    def scale(self, factor: float):
        """Met à l'échelle la bbox (pour normaliser les coordonnées)."""
        self.bbox = [[x * factor, y * factor] for x, y in self.bbox]
        return self

    def __repr__(self):
        return (f"OcrBlock('{self.text}', conf={self.confidence:.2f}, "
                f"cx={self.center_x:.0f}, cy={self.center_y:.0f})")


class OcrEngine:

    def run(self, variants, scale: float = 1.0) -> list[OcrBlock]:
        """
        Lance l'OCR sur une ou plusieurs variantes d'image et fusionne.

        Args:
            variants: ndarray unique OU liste de ndarray (variantes préprocessées)
            scale:    facteur pour normaliser les bbox (OCR → espace spatial)

        Returns:
            liste de OcrBlock fusionnés, triés haut→bas puis gauche→droite
        """
        if isinstance(variants, np.ndarray):
            variants = [variants]

        ocr = get_ocr()
        all_blocks: list[OcrBlock] = []

        for idx, image in enumerate(variants):
            try:
                raw = ocr.ocr(image, cls=True)
                blocks = self._parse_result(raw)
                logger.info(f"  variante {idx + 1}/{len(variants)}: "
                            f"{len(blocks)} blocs")
                all_blocks.extend(blocks)
            except Exception as e:
                logger.warning(f"  variante {idx + 1} a échoué: {e}")

        # Normaliser les coordonnées vers l'espace spatial
        if scale != 1.0:
            for b in all_blocks:
                b.scale(scale)

        merged = self._merge(all_blocks)
        merged.sort(key=lambda b: (round(b.center_y / 20) * 20, b.center_x))

        logger.info(f"OCR multi-passes: {len(all_blocks)} bruts → "
                    f"{len(merged)} fusionnés")
        return merged

    # ── Fusion multi-passes ────────────────────────────────────────────────

    def _merge(self, blocks: list[OcrBlock]) -> list[OcrBlock]:
        """
        Fusionne les détections de plusieurs passes.

        Algorithme glouton : on trie par confiance décroissante puis on
        accepte chaque bloc sauf s'il recouvre fortement (IoU) un bloc déjà
        accepté → on garde donc toujours la lecture la plus confiante de
        chaque zone, sans perdre les détections uniques.
        """
        if not blocks:
            return []

        ordered = sorted(blocks, key=lambda b: -b.confidence)
        kept: list[OcrBlock] = []

        for block in ordered:
            duplicate = False
            for k in kept:
                if self._iou(block, k) > 0.45:
                    duplicate = True
                    break
            if not duplicate:
                kept.append(block)

        return kept

    @staticmethod
    def _iou(a: OcrBlock, b: OcrBlock) -> float:
        """Intersection-over-Union des rectangles englobants."""
        ix1 = max(a.left_x, b.left_x)
        iy1 = max(a.top_y, b.top_y)
        ix2 = min(a.right_x, b.right_x)
        iy2 = min(a.bottom_y, b.bottom_y)

        iw = max(0.0, ix2 - ix1)
        ih = max(0.0, iy2 - iy1)
        inter = iw * ih
        if inter <= 0:
            return 0.0

        area_a = max(1.0, (a.right_x - a.left_x) * (a.bottom_y - a.top_y))
        area_b = max(1.0, (b.right_x - b.left_x) * (b.bottom_y - b.top_y))
        return inter / (area_a + area_b - inter)

    # ── Parsing résultat PaddleOCR ─────────────────────────────────────────

    def _parse_result(self, raw_result) -> list[OcrBlock]:
        blocks = []
        if not raw_result:
            return blocks

        for page in raw_result:
            if not page:
                continue
            for item in page:
                try:
                    bbox = item[0]
                    text = item[1][0]
                    conf = item[1][1]

                    if not text or len(text.strip()) < 1:
                        continue
                    if conf < 0.20:
                        continue

                    blocks.append(OcrBlock(
                        text=text,
                        confidence=float(conf),
                        bbox=[[float(x), float(y)] for x, y in bbox],
                    ))
                except (IndexError, TypeError, ValueError) as e:
                    logger.debug(f"Bloc OCR ignoré: {e}")
                    continue

        return blocks

    def full_text(self, blocks: list[OcrBlock]) -> str:
        """Texte complet concaténé (pour détection fournisseur)."""
        return " ".join(b.text for b in blocks)


# Singleton
ocr_engine = OcrEngine()
