"""
Parser Spatial OCR — Cœur du système d'extraction.

PROBLÈME RÉEL :
L'OCR détecte des textes isolés avec leurs positions.
Ex pour SAICA :
  Block("Gramaje / Substance / Grammage", x=100, y=200)
  Block("105 g/m²",                       x=100, y=280)
  Block("Ancho / Width / Laize",           x=500, y=200)
  Block("1920 mm",                         x=500, y=280)

Comment savoir que "105" = grammage et "1920" = width ?
→ Proximité spatiale entre le LABEL et sa VALEUR.

ALGORITHME :
1. Trouver le bloc contenant le mot-clé (= le "label")
2. Chercher la valeur numérique la plus proche du label :
   a. Sur la même ligne, à droite  (ex: "Poids kg : 2067")
   b. Sur la ligne suivante, aligné horizontalement  (ex: grille SAICA)
3. Retourner la valeur avec la confiance OCR

CAS SPÉCIAUX :
- Colon inline : "N° de la bobine : 122401926634" → split sur ':'
- Unité cm vs mm : "200 cm" → width_mm = 2000
- Format européen : "2.063" = 2063 kg (séparateur milliers)
- Très grand nombre (>8 chiffres) → serial numéro
"""

import re
import math
import logging
from typing import Optional

from app.services.ocr_engine import OcrBlock

logger = logging.getLogger(__name__)

# ─── Constantes de proximité (pour image normalisée 1400px) ────────────────
ROW_TOLERANCE = 35       # Δy max pour considérer "même ligne" (px)
MAX_BELOW_PX = 250       # Hauteur max de recherche sous un label
MAX_RIGHT_PX = 600       # Largeur max de recherche à droite
HORIZONTAL_ALIGN_PX = 320  # Tolérance Δx pour "dans la même colonne"


class SpatialParser:

    # ─── Utilitaires géométriques ──────────────────────────────────────────

    def _dist(self, b1: OcrBlock, b2: OcrBlock) -> float:
        return math.sqrt((b1.center_x - b2.center_x) ** 2 +
                         (b1.center_y - b2.center_y) ** 2)

    def _same_row(self, b1: OcrBlock, b2: OcrBlock) -> bool:
        return abs(b1.center_y - b2.center_y) < ROW_TOLERANCE

    def _is_right_of(self, candidate: OcrBlock, label: OcrBlock) -> bool:
        return (self._same_row(candidate, label) and
                candidate.left_x > label.right_x and
                candidate.center_x - label.center_x < MAX_RIGHT_PX)

    def _is_below(self, candidate: OcrBlock, label: OcrBlock) -> bool:
        dy = candidate.center_y - label.center_y
        dx = abs(candidate.center_x - label.center_x)
        return (dy > ROW_TOLERANCE and
                dy < MAX_BELOW_PX and
                dx < HORIZONTAL_ALIGN_PX)

    # ─── Parsing numérique ─────────────────────────────────────────────────

    def parse_number(self, text: str) -> Optional[float]:
        """
        Extrait un nombre depuis le texte OCR en gérant :
        - Unités : "105 g/m²" → 105
        - Format européen : "2.063" → 2063 (séparateur milliers)
        - Virgule décimale : "85,0" → 85.0
        - Espaces milliers : "2 067" → 2067
        """
        # Supprimer les unités communes
        clean = re.sub(
            r'\s*(g/m[²2]|gsm|kg|mm|cm|m\b|lb|t\b)\s*',
            '', text, flags=re.IGNORECASE
        ).strip()

        # Remplacer virgule décimale → point
        # "85,0" → "85.0"
        if re.match(r'^\d+,\d{1,2}$', clean):
            clean = clean.replace(',', '.')

        # Supprimer espaces (séparateurs milliers "2 067" → "2067")
        clean = clean.replace(' ', '').replace(' ', '')

        # "2.063" avec point comme millier (3 décimales) → 2063
        if re.match(r'^\d{1,3}\.\d{3}$', clean):
            clean = clean.replace('.', '')

        try:
            return float(clean)
        except ValueError:
            # Tenter d'extraire le premier nombre dans la chaîne
            match = re.search(r'\d+[.,]?\d*', clean)
            if match:
                try:
                    return float(match.group().replace(',', '.'))
                except ValueError:
                    pass
        return None

    def normalize_unit(self, value: float, unit_text: str, field: str) -> float:
        """
        Convertit les unités non-standard.
        Ex: width en "cm" → convertir en mm (* 10)
        """
        unit_lower = unit_text.lower()
        if field == 'width_mm' and 'cm' in unit_lower:
            logger.info(f"Conversion cm→mm: {value} cm = {value * 10} mm")
            return value * 10
        return value

    # ─── Recherche de label ────────────────────────────────────────────────

    def find_label(self, blocks: list[OcrBlock], keywords: list[str]) -> Optional[OcrBlock]:
        """
        Trouve le bloc OCR contenant un des mots-clés.
        Préfère le keyword le plus long (évite "weight" de matcher "basis weight").
        """
        best_block = None
        best_kw_len = 0

        for block in blocks:
            text_lower = block.text.lower()
            for kw in keywords:
                kw_lower = kw.lower()
                if kw_lower in text_lower and len(kw_lower) > best_kw_len:
                    best_block = block
                    best_kw_len = len(kw_lower)

        return best_block

    # ─── Extraction inline (colon) ─────────────────────────────────────────

    def extract_inline_colon(self, label_block: OcrBlock, field: str) -> Optional[dict]:
        """
        Gère le pattern "Label : valeur" sur un même bloc OCR.
        Ex: "N° de la bobine : 122401926634"
        Ex: "Grammage : 100 g/m²"
        """
        text = label_block.text
        if ':' not in text:
            return None

        parts = text.split(':', 1)
        if len(parts) < 2 or not parts[1].strip():
            return None

        value_str = parts[1].strip()
        num = self.parse_number(value_str)

        if num is not None:
            num = self.normalize_unit(num, value_str, field)
            return {
                'value': num,
                'raw_text': value_str,
                'confidence': label_block.confidence * 0.95,
                'source': 'inline_colon',
            }

        # Valeur texte (ex: serial non-numérique)
        if len(value_str) >= 3:
            return {
                'value': value_str,
                'raw_text': value_str,
                'confidence': label_block.confidence * 0.90,
                'source': 'inline_colon',
            }

        return None

    # ─── Extraction spatiale principale ────────────────────────────────────

    def find_nearest_value(
        self,
        blocks: list[OcrBlock],
        label_block: OcrBlock,
        field: str,
        numeric_only: bool = True,
    ) -> Optional[dict]:
        """
        Cherche la valeur la plus proche du label.

        Priorité:
        1. Même bloc, après ":" (inline colon)
        2. Même ligne, à droite
        3. Ligne(s) suivante(s), aligné horizontalement (format grille)
        """
        # Priorité 1 : inline colon
        inline = self.extract_inline_colon(label_block, field)
        if inline:
            return inline

        candidates = []

        for block in blocks:
            if block is label_block:
                continue
            if not block.text.strip():
                continue
            if numeric_only and not re.search(r'\d', block.text):
                continue

            # Direction: droite (même ligne) ou dessous
            to_right = self._is_right_of(block, label_block)
            below = self._is_below(block, label_block)

            if not (to_right or below):
                continue

            dist = self._dist(label_block, block)

            # Bonus pour "à droite" (inline est plus fiable que grille)
            score = dist * (0.7 if to_right else 1.0)
            candidates.append((block, score))

        if not candidates:
            return None

        candidates.sort(key=lambda x: x[1])
        best_block, _ = candidates[0]

        num = self.parse_number(best_block.text)

        if numeric_only and num is None:
            return None

        value = num if num is not None else best_block.text
        if isinstance(value, float):
            value = self.normalize_unit(value, best_block.text, field)

        return {
            'value': value,
            'raw_text': best_block.text,
            'confidence': best_block.confidence,
            'source': 'right' if self._is_right_of(best_block, label_block) else 'below',
        }

    # ─── Extraction d'un champ complet ─────────────────────────────────────

    def extract_field(
        self,
        blocks: list[OcrBlock],
        keywords: list[str],
        field: str,
        numeric_only: bool = True,
    ) -> Optional[dict]:
        """
        Pipeline complet : find_label → find_nearest_value.
        """
        label_block = self.find_label(blocks, keywords)
        if label_block is None:
            logger.debug(f"Label non trouvé pour {field}: {keywords}")
            return None

        logger.debug(f"Label trouvé pour {field}: '{label_block.text}' @ ({label_block.center_x:.0f}, {label_block.center_y:.0f})")
        result = self.find_nearest_value(blocks, label_block, field, numeric_only)

        if result:
            logger.debug(f"  → Valeur: '{result['raw_text']}' = {result['value']} (conf={result['confidence']:.2f})")
        else:
            logger.debug(f"  → Valeur non trouvée")

        return result

    # ─── Extraction serial number (scoring intelligent) ─────────────────────

    def _serial_length_score(self, n: int) -> float:
        """
        Préférence selon le nombre de chiffres.
        Bobines : 8-13 idéal ; 6-7 fréquent (Papeleras) ; 14+ = code-barres.
        """
        if 8 <= n <= 13:
            return 1.0
        if n in (6, 7):
            return 0.8
        if n < 6:
            return 0.3
        return max(0.25, 1.0 - (n - 13) * 0.15)

    def _looks_like_date(self, token: str) -> bool:
        """Détecte un format date YYYYMMDD (ex: 20251207) — pas un n° de bobine."""
        if len(token) != 8 or not token.isdigit():
            return False
        y, m, d = int(token[:4]), int(token[4:6]), int(token[6:8])
        return 2000 <= y <= 2099 and 1 <= m <= 12 and 1 <= d <= 31

    def _near_serial_label(self, candidate: OcrBlock, label: OcrBlock) -> bool:
        """
        Le candidat est-il proche d'un label "bobina/reel/serial" ?
        Portée généreuse : le numéro de bobine est souvent en très gros
        caractères, donc loin (centre à centre) de son petit label.
        """
        dy = candidate.center_y - label.center_y
        dx = abs(candidate.center_x - label.center_x)
        # Sous le label
        if -25 < dy < 430 and dx < 480:
            return True
        # Même ligne, à droite
        if abs(dy) < 65 and candidate.left_x >= label.left_x - 25 and dx < 680:
            return True
        return False

    def extract_serial(self, blocks: list[OcrBlock], keywords: list[str]) -> Optional[dict]:
        """
        Extraction intelligente du numéro de série/bobine.

        Au lieu de règles en cascade, on SCORE chaque candidat :

            score = préférence_longueur
                  × confiance_OCR
                  × proximité_label    (×1.7 si proche d'un mot-clé bobine)
                  × corroboration      (×1.35 si préfixe d'un code-barres plus long)

        Le meilleur candidat gagne. Cela permet au gros numéro central
        d'une étiquette SAICA de l'emporter sur les codes-barres voisins,
        avec une confiance élevée puisqu'il est lu parfaitement.
        """
        kw_lower = [k.lower() for k in keywords]
        label_blocks = [
            b for b in blocks
            if any(k in b.text.lower() for k in kw_lower)
        ]

        # ── Collecte des candidats ──
        candidates = []  # (token, block)
        for block in blocks:
            # séquences numériques 6-16 chiffres
            for tok in re.findall(r'\d{6,16}', block.text):
                if self._looks_like_date(tok):
                    continue  # ex: 20251207 = date de production, pas un serial
                candidates.append((tok, block))
            # codes alphanumériques majuscules (lettres + ≥5 chiffres)
            for tok in re.findall(r'[0-9A-Z]{8,20}', block.text.upper()):
                if re.search(r'[A-Z]', tok) and len(re.findall(r'\d', tok)) >= 5:
                    candidates.append((tok, block))

        if not candidates:
            return None

        numeric_tokens = {t for t, _ in candidates if t.isdigit()}

        # ── Scoring ──
        best = None
        best_score = -1.0
        for token, block in candidates:
            digits = re.sub(r'\D', '', token)
            length_pref = self._serial_length_score(len(digits))
            conf = block.confidence

            near_label = any(self._near_serial_label(block, lb)
                             for lb in label_blocks)
            prox = 1.7 if near_label else 1.0

            corroborated = any(
                other != token and len(other) > len(token)
                and other.startswith(token)
                for other in numeric_tokens
            )
            corrob = 1.35 if corroborated else 1.0

            total = length_pref * conf * prox * corrob
            if total > best_score:
                best_score = total
                best = (token, block, near_label, corroborated, conf)

        token, block, near_label, corroborated, conf = best

        if corroborated and near_label:
            source = 'serial_corroborated'
        elif near_label:
            source = 'serial_near_label'
        else:
            source = 'serial_pattern'

        return {
            'value': token,
            'raw_text': block.text,
            'confidence': conf,
            'source': source,
        }


# Singleton
spatial_parser = SpatialParser()
