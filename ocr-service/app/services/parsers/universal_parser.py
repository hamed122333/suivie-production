"""
═══════════════════════════════════════════════════════════════════════════
PARSER UNIVERSEL — une seule logique pour TOUS les fournisseurs
═══════════════════════════════════════════════════════════════════════════

Conçu pour 30+ fournisseurs sans code dédié par fournisseur. Il n'y a plus
de fichier par fournisseur : ajouter un fournisseur = ajouter ses mots-clés
de détection dans supplier_detector.py (pour l'affichage du nom). L'EXTRACTION
des données est entièrement universelle.

Le parser combine 6 stratégies indépendantes qui se RECOUPENT. Une donnée
confirmée par 2 stratégies est quasi certaine ; une lecture OCR erronée sur
une stratégie est corrigée par les autres.

  1. SPATIAL      — repère un libellé multilingue (substance/grammage/laize/
                    width/poids/weight…) puis lit la valeur voisine
  2. CODE-BARRES  — décode le code "reel data" (préfixe+grammage+largeur+poids)
  3. CODE GRADE   — décode "XXXX-GGG-WWWW" (ex: 3300-130-1950)
  4. CHAMP REEL   — décode "FL/90/195/9764"
  5. GRILLE       — sur étiquette sans en-tête lisible : retient les GRANDS
                    nombres dans les plages métier
  6. POSITIONNEL  — le poids est le nombre juste SOUS le grammage

Robustesse supplémentaire :
  - conversion automatique cm→mm (laize "200 cm" → 2000 mm)
  - n° de bobine : numérique, alphanumérique ou pointé, scoré intelligemment
  - tolérant à la qualité d'image (le moteur OCR fait déjà du multi-passes)
"""

import re
import logging

from app.services.ocr_engine import OcrBlock
from app.services.spatial_parser import spatial_parser
from app.services import barcode_decoder

logger = logging.getLogger(__name__)

# Plages métier
FIELD_RANGES = {
    'grammage':  (40, 350),
    'width_mm':  (700, 2900),
    'weight_kg': (300, 6000),
}

# ── Mots-clés multilingues (FR / EN / ES / DE) ─────────────────────────────
GRAMMAGE_KEYWORDS = [
    "basis weight", "substance", "grammage(gram)", "grammage", "gramaje",
    "flächengewicht", "g/m2", "g/m²", "gsm",
]
WIDTH_KEYWORDS = [
    "reel width", "width(mm)", "width [mm]", "width", "laize", "largeur",
    "anchura", "ancho", "breite", "bredd",
]
WEIGHT_KEYWORDS = [
    "initial weight", "net weight", "weight(kg)", "weight [kg]", "weigth",
    "weight", "poids", "peso", "gewicht", "vikt",
]
# Libellés indiquant la zone du n° de bobine (matching partiel toléré)
SERIAL_LABEL_KEYWORDS = [
    "reel number", "reel no", "reelnum", "roll number", "roll no",
    "serial number", "serial", "numb", "bobina", "bobine", "bobin",
    "n° de la bobine", "reel", "roll",
]


class UniversalParser:
    """Parser unique — aucune logique spécifique à un fournisseur."""

    supplier_name = "UNIVERSAL"

    grammage_keywords = GRAMMAGE_KEYWORDS
    width_keywords = WIDTH_KEYWORDS
    weight_keywords = WEIGHT_KEYWORDS
    serial_keywords = SERIAL_LABEL_KEYWORDS

    # ══════════════════════════════════════════════════════════════════════

    def parse(self, blocks: list[OcrBlock]) -> dict:
        # ── 1. Extraction spatiale (libellé → valeur) ──────────────────────
        grammage = spatial_parser.extract_field(
            blocks, GRAMMAGE_KEYWORDS, 'grammage')
        width = spatial_parser.extract_field(
            blocks, WIDTH_KEYWORDS, 'width_mm')
        # Poids : exclure les blocs "basis weight" (= grammage, pas poids)
        weight_blocks = [b for b in blocks if 'basis' not in b.text.lower()]
        weight = spatial_parser.extract_field(
            weight_blocks, WEIGHT_KEYWORDS, 'weight_kg')

        spatial = {'grammage': grammage, 'width_mm': width, 'weight_kg': weight}

        # ── 2-6. Cross-validation multi-sources ────────────────────────────
        result = self._cross_validate(blocks, spatial)

        # ── N° de bobine (scoring universel) ───────────────────────────────
        result['reel_serial_number'] = self._extract_serial(blocks, result)

        return result

    # ══════════════════════════════════════════════════════════════════════
    # CROSS-VALIDATION
    # ══════════════════════════════════════════════════════════════════════

    def _cross_validate(self, blocks: list[OcrBlock], spatial: dict) -> dict:
        result = dict(spatial)

        # ── Conversion cm → mm (EN PREMIER) ───────────────────────────────
        # Une laize < 500 est en cm (ex: "192,5 cm" → 1925 mm). Doit se faire
        # AVANT l'heuristique grille, sinon la largeur (192,5) est jugée
        # invalide (< 700) et écrasée par un autre nombre de l'étiquette.
        wex = result.get('width_mm')
        if wex and isinstance(wex.get('value'), (int, float)) and 0 < wex['value'] < 500:
            converted = dict(wex)
            original = converted['value']
            converted['value'] = round(original * 10, 1)
            converted['source'] = (converted.get('source') or 'spatial') + '+cm'
            result['width_mm'] = converted
            logger.info(f"Conversion cm→mm: {original} → {converted['value']}")

        # Indices spatiaux valides → hints pour le décodeur de code-barres
        hints = {}
        for field, (lo, hi) in FIELD_RANGES.items():
            ex = spatial.get(field)
            val = ex.get('value') if ex else None
            if isinstance(val, (int, float)) and lo <= val <= hi:
                hints[field] = float(val)

        # ── Source : code-barres "reel data" ──────────────────────────────
        barcode = barcode_decoder.decode(blocks, hints)
        if barcode:
            matches = barcode['matches']
            trust = 'high' if matches >= 1 else ('medium' if not hints else 'low')
            for field in ('grammage', 'width_mm', 'weight_kg'):
                bval = barcode[field]
                ex = spatial.get(field)
                sval = ex.get('value') if ex else None
                sval_valid = self._field_valid(field, sval)
                agreed = (isinstance(sval, (int, float))
                          and abs(sval - bval) <= max(2.0, bval * 0.03))
                if trust == 'high':
                    result[field] = self._make(
                        bval, 0.97 if agreed else 0.90, barcode['raw'],
                        'consensus' if agreed else 'barcode_encoded')
                elif trust == 'medium' and not sval_valid:
                    result[field] = self._make(
                        bval, 0.82, barcode['raw'], 'barcode_encoded')
                elif trust == 'low' and not sval_valid:
                    result[field] = self._make(
                        bval, 0.75, barcode['raw'], 'barcode_encoded')

        # ── Source : code grade "XXXX-GGG-WWWW" ───────────────────────────
        grade = barcode_decoder.decode_grade_code(blocks)
        if grade:
            self._apply_secondary(result, grade, ('grammage', 'width_mm'),
                                   'grade_code')

        # ── Source : champ "Reel Data" textuel "FL/90/195/9764" ───────────
        reel_field = barcode_decoder.decode_reel_data_field(blocks)
        if reel_field:
            self._apply_secondary(result, reel_field, ('grammage', 'width_mm'),
                                   'reel_data_field')

        # ── Source : intelligence grille (grands nombres) ─────────────────
        self._grid_intelligence(blocks, result)

        # ── Source : poids positionnel (nombre sous le grammage) ──────────
        if not self._field_valid('weight_kg', self._val(result.get('weight_kg'))):
            gv = self._val(result.get('grammage'))
            if isinstance(gv, (int, float)):
                pw = self._positional_weight(blocks, gv)
                if pw:
                    result['weight_kg'] = pw

        return result

    def _apply_secondary(self, result: dict, decoded: dict,
                         fields: tuple, source: str) -> None:
        """Applique une source secondaire (code grade / champ reel) :
        confirme si concordance, sinon comble les champs manquants."""
        for field in fields:
            dval = decoded.get(field)
            if dval is None:
                continue
            sval = self._val(result.get(field))
            if (isinstance(sval, (int, float))
                    and abs(sval - dval) <= max(2.0, dval * 0.03)):
                result[field] = self._make(dval, 0.96, decoded['raw'], 'consensus')
            elif not self._field_valid(field, sval):
                result[field] = self._make(dval, 0.88, decoded['raw'], source)

    # ══════════════════════════════════════════════════════════════════════
    # INTELLIGENCE GRILLE
    # ══════════════════════════════════════════════════════════════════════

    def _grid_intelligence(self, blocks: list[OcrBlock], result: dict) -> None:
        """Étiquettes sans en-tête lisible : grammage et largeur sont des
        GRANDS nombres. On retient, par plage, celui au plus gros caractère."""
        nums = []
        for b in blocks:
            token = b.text.strip()
            if re.fullmatch(r'\d{2,4}', token):
                nums.append((int(token), b))
        if not nums:
            return

        if not self._field_valid('grammage', self._val(result.get('grammage'))):
            cands = [(v, b) for v, b in nums if 60 <= v <= 340]
            if cands:
                v, b = max(cands, key=lambda x: x[1].height)
                result['grammage'] = self._make(v, 0.70, b.text, 'grid_heuristic')

        if not self._field_valid('width_mm', self._val(result.get('width_mm'))):
            cands = [(v, b) for v, b in nums if 800 <= v <= 2800]
            if cands:
                v, b = max(cands, key=lambda x: x[1].height)
                result['width_mm'] = self._make(v, 0.70, b.text, 'grid_heuristic')

    def _positional_weight(self, blocks: list[OcrBlock], grammage_value: float):
        """Le poids est le nombre directement SOUS le grammage (grille)."""
        gstr = str(int(grammage_value))
        gblock = next((b for b in blocks if b.text.strip() == gstr), None)
        if gblock is None:
            return None
        lo, hi = FIELD_RANGES['weight_kg']
        best = None
        for b in blocks:
            if b is gblock:
                continue
            token = b.text.strip()
            if not re.fullmatch(r'\d{3,4}', token):
                continue
            v = int(token)
            if not (lo <= v <= hi):
                continue
            dy = b.center_y - gblock.center_y
            dx = abs(b.center_x - gblock.center_x)
            if 30 < dy < 260 and dx < 240:
                if best is None or dy < best[1]:
                    best = (v, dy, b)
        if best is None:
            return None
        v, _, blk = best
        return self._make(v, 0.80, blk.text, 'positional_below')

    # ══════════════════════════════════════════════════════════════════════
    # NUMÉRO DE BOBINE — scoring universel
    # ══════════════════════════════════════════════════════════════════════

    def _extract_serial(self, blocks: list[OcrBlock], result: dict) -> dict | None:
        """
        Numéro de bobine — gère les formats numérique / alphanumérique /
        pointé. Score chaque candidat :

            score = préférence_longueur × confiance_OCR
                  × proximité_label  (×1.7 si proche d'un libellé "bobine")
                  × corroboration    (×1.35 si préfixe d'un code-barres)
                  × taille_police    (0.5–2.0 : le n° de bobine est imprimé gros)
                  × bonus_format     (×1.15 pour pointé/alphanumérique)

        Exclut les dates (YYYYMMDD) et les valeurs déjà retenues comme
        grammage / largeur / poids.
        """
        field_values = set()
        for f in ('grammage', 'width_mm', 'weight_kg'):
            v = self._val(result.get(f))
            if isinstance(v, (int, float)):
                field_values.add(int(v))

        label_blocks = [
            b for b in blocks
            if any(k in b.text.lower() for k in SERIAL_LABEL_KEYWORDS)
        ]

        # ── Collecte des candidats ──
        candidates = []   # (token, block, kind)
        for b in blocks:
            text = b.text.strip()
            up = text.upper()

            # Ignorer les codes de certification (FSC, PEFC, ISO…) — présents
            # sur toute étiquette papier, jamais un n° de bobine.
            if any(cert in up for cert in ('FSC', 'PEFC', 'ISO', 'SFI')):
                continue

            # format pointé "5.23.06770.41"
            if re.fullmatch(r'\d{1,3}(?:\.\d{2,6}){2,4}', text):
                candidates.append((text, b, 'dotted'))
            # alphanumérique "26C06N02120000" — exige une majorité de chiffres
            # (≥ 70 %) pour écarter les codes type "C160340"
            if (re.fullmatch(r'[0-9A-Z]{8,20}', up)
                    and re.search(r'[A-Z]', up)):
                digit_count = len(re.findall(r'\d', up))
                if digit_count >= 5 and digit_count >= 0.7 * len(up):
                    candidates.append((up, b, 'alnum'))
            # séquences numériques
            for m in re.findall(r'\d{5,16}', text):
                if not self._is_date(m):
                    candidates.append((m, b, 'numeric'))

        if not candidates:
            return None

        numeric_tokens = {c[0] for c in candidates if c[2] == 'numeric'}
        max_area = max((b.width * b.height for _, b, _ in candidates), default=1.0)

        best, best_score = None, -1.0
        for token, b, kind in candidates:
            digits = re.sub(r'\D', '', token)
            n = len(digits)

            # exclure une valeur déjà attribuée à un champ
            if kind == 'numeric' and int(token) in field_values:
                continue

            length_pref = (1.0 if 6 <= n <= 13
                           else 0.55 if n < 6
                           else max(0.3, 1.0 - (n - 13) * 0.12))
            conf = b.confidence
            near = 1.7 if any(self._near_label(b, lb) for lb in label_blocks) else 1.0
            corrob = 1.35 if any(
                o != token and len(o) > len(token) and o.startswith(token)
                for o in numeric_tokens
            ) else 1.0
            area = b.width * b.height
            font = 0.5 + 1.5 * (area / max_area)        # gros caractère privilégié
            kind_bonus = 1.15 if kind in ('dotted', 'alnum') else 1.0

            score = length_pref * conf * near * corrob * font * kind_bonus
            if score > best_score:
                best_score = score
                best = (token, b, near, corrob)

        if best is None:
            return None

        token, block, near, corrob = best
        if corrob > 1.0 and near > 1.0:
            source = 'serial_corroborated'
        elif near > 1.0:
            source = 'serial_near_label'
        else:
            source = 'serial_pattern'
        return {'value': token, 'raw_text': block.text,
                'confidence': block.confidence, 'source': source}

    # ══════════════════════════════════════════════════════════════════════
    # UTILITAIRES
    # ══════════════════════════════════════════════════════════════════════

    @staticmethod
    def _near_label(candidate: OcrBlock, label: OcrBlock) -> bool:
        """Le candidat est-il proche (sous / à droite) d'un libellé bobine ?"""
        dy = candidate.center_y - label.center_y
        dx = abs(candidate.center_x - label.center_x)
        if -25 < dy < 430 and dx < 480:          # sous le libellé
            return True
        if abs(dy) < 65 and candidate.left_x >= label.left_x - 25 and dx < 680:
            return True                          # même ligne, à droite
        return False

    @staticmethod
    def _is_date(token: str) -> bool:
        """Détecte un format YYYYMMDD (ex: 20251207)."""
        if len(token) != 8 or not token.isdigit():
            return False
        y, m, d = int(token[:4]), int(token[4:6]), int(token[6:8])
        return 2000 <= y <= 2099 and 1 <= m <= 12 and 1 <= d <= 31

    @staticmethod
    def _field_valid(field: str, value) -> bool:
        if not isinstance(value, (int, float)):
            return False
        lo, hi = FIELD_RANGES[field]
        return lo <= value <= hi

    @staticmethod
    def _val(extraction):
        return extraction.get('value') if extraction else None

    @staticmethod
    def _make(value, confidence: float, raw_text, source: str) -> dict:
        return {'value': float(value), 'confidence': float(confidence),
                'raw_text': str(raw_text), 'source': source}
