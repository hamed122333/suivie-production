"""
Décodeur universel de code-barres "reel data" pour étiquettes de bobines.

PRINCIPE
────────
Les fabricants encodent grammage / largeur / poids dans un code-barres,
sous une forme régulière :

    [préfixe]  GRAMMAGE  LARGEUR  POIDS  [longueur…]
      2-4 ch.   2-3 ch.   4 ch.   4 ch.

Exemples réels vérifiés :
    SAICA       44 105 1920 2200 01074   → "44105192022001074"
    Interpac   600  90 1950 1735 099764  → "6009019501735099764"
    Greenliner  45 115 1850 1627 07647   → "451151850162707647"

Les chiffres imprimés sous un code-barres sont nets : l'OCR les lit de
façon très fiable. Ce décodeur est donc une source de données robuste.

ROBUSTESSE
──────────
- teste toutes les longueurs plausibles de préfixe/grammage
- valide chaque champ contre les plages métier
- CROISE avec l'extraction spatiale (paramètre `hints`) : le candidat
  retenu est celui dont les valeurs concordent le mieux avec ce que
  l'OCR a lu ailleurs. Un code-barres parasite (code bobine, EAN…) ne
  peut donc pas être choisi à la place du vrai code "reel data".
"""

import re
import logging

logger = logging.getLogger(__name__)

GRAMMAGE_RANGE = (40, 350)
WIDTH_RANGE    = (700, 2900)
WEIGHT_RANGE   = (300, 6000)


def decode(blocks, hints=None) -> dict | None:
    """
    Args:
        blocks: liste d'OcrBlock
        hints:  {'grammage','width_mm','weight_kg'} — valeurs extraites
                spatialement, utilisées pour cross-valider.

    Returns:
        {'grammage','width_mm','weight_kg','raw','confidence','matches'} ou None
    """
    hints = hints or {}
    sequences = _collect_sequences(blocks)
    if not sequences:
        return None

    best = None
    best_score = float("-inf")
    for digits, ocr_conf in sequences:
        for cand in _candidates(digits):
            score, matches = _score(cand, hints, ocr_conf)
            if score > best_score:
                best_score = score
                best = (cand, digits, ocr_conf, matches)

    if best is None:
        return None

    cand, digits, ocr_conf, matches = best

    # Un code-barres décodable mais qui contredit TOUTE l'extraction
    # spatiale solide (≥2 indices) est probablement un parasite → on l'écarte.
    if matches == 0 and len(hints) >= 2:
        logger.info("Code-barres écarté : contredit l'extraction spatiale")
        return None

    logger.info(f"Code-barres décodé '{digits}' → "
                f"g={cand['g']} w={cand['w']} k={cand['k']} "
                f"(concordances spatiales={matches})")

    return {
        'grammage':   cand['g'],
        'width_mm':   cand['w'],
        'weight_kg':  cand['k'],
        'raw':        digits,
        'confidence': min(0.97, 0.80 + ocr_conf * 0.15),
        'matches':    matches,
    }


# ── Internes ───────────────────────────────────────────────────────────────

def decode_string(digits: str, hints: dict | None = None) -> dict | None:
    """
    Décode une suite de chiffres déjà isolée (ex: chiffres d'un code-barres
    lus par l'IA visuelle). Même logique que `decode` mais sur une chaîne.

    Retour : {'grammage','width_mm','weight_kg','matches'} ou None.
    """
    hints = hints or {}
    digits = re.sub(r'\D', '', digits or '')
    if not (13 <= len(digits) <= 26):
        return None

    best, best_score = None, float("-inf")
    for cand in _candidates(digits):
        score, matches = _score(cand, hints, 0.9)
        if score > best_score:
            best_score, best = score, (cand, matches)

    if best is None:
        return None
    cand, matches = best
    if matches == 0 and len(hints) >= 2:
        return None
    return {
        'grammage':  cand['g'],
        'width_mm':  cand['w'],
        'weight_kg': cand['k'],
        'matches':   matches,
    }


def _collect_sequences(blocks) -> list[tuple[str, float]]:
    """
    Collecte les vrais codes-barres "reel data".

    Un code-barres reel-data réel fait 16-22 chiffres (SAICA 17, Interpac
    18-19, Greenliner 18) et forme l'essentiel de son bloc OCR. On EXCLUT :
    - les courtes séquences (dates 6-8, n° de commande, n° de série 6-13)
    - les chiffres noyés dans une phrase (ratio chiffres/texte trop faible)
    On NE concatène PAS le texte global (source de faux positifs).
    """
    seqs = []
    seen = set()

    for b in blocks:
        raw = b.text.strip()
        digits = re.sub(r'\D', '', raw)
        n = len(digits)
        if not (16 <= n <= 22):
            continue
        # le bloc doit être ESSENTIELLEMENT ce nombre (vrai code-barres)
        if n < 0.6 * len(raw):
            continue
        if digits in seen:
            continue
        seen.add(digits)
        seqs.append((digits, float(b.confidence)))

    return seqs


def _candidates(digits: str) -> list[dict]:
    """
    Génère toutes les interprétations plausibles d'une séquence de chiffres.
    Teste préfixe 2-4 et grammage 2-3, valide les plages métier.
    """
    out = []
    n = len(digits)
    for plen in (2, 3, 4):
        for glen in (2, 3):
            gi, wi, ki = plen, plen + glen, plen + glen + 4
            if ki + 4 > n:
                continue
            g, w, k = digits[gi:wi], digits[wi:ki], digits[ki:ki + 4]
            if not (g.isdigit() and w.isdigit() and k.isdigit()):
                continue
            gv, wv, kv = int(g), int(w), int(k)
            if not (GRAMMAGE_RANGE[0] <= gv <= GRAMMAGE_RANGE[1]):
                continue
            if not (WIDTH_RANGE[0] <= wv <= WIDTH_RANGE[1]):
                continue
            if not (WEIGHT_RANGE[0] <= kv <= WEIGHT_RANGE[1]):
                continue
            out.append({'g': gv, 'w': wv, 'k': kv, 'plen': plen})
    return out


# Séparateurs possibles entre les segments du code grade :
# tiret, demi-cadratin, cadratin, point, point médian, puce, deux-points,
# barre oblique — l'OCR les lit de façons variées.
_GRADE_SEP = r'\s*[-–—.·•:/]\s*'
_GRADE_CODE_RE = re.compile(
    rf'(\d{{3,4}}){_GRADE_SEP}(\d{{2,3}}){_GRADE_SEP}(\d{{3,4}})'
)


def decode_grade_code(blocks) -> dict | None:
    """
    Décode un code "grade" de la forme  GRADE · GRAMMAGE · LARGEUR.

    Exemple réel (Stora Enso) : "3300-130-1950" ou "3300.130.1950"
        3300 = code grade   130 = grammage g/m²   1950 = largeur mm

    Très utile quand les en-têtes de colonnes ne sont pas lisibles par
    l'OCR : ce code condense grammage + largeur en un seul bloc net.
    Robuste à tous les séparateurs (tiret, point, etc.).

    Retour : {'grammage','width_mm','raw','confidence'} ou None.
    """
    # 1. recherche bloc par bloc
    for b in blocks:
        result = _match_grade_code(b.text, float(b.confidence))
        if result:
            return result

    # 2. texte joint — le code peut être scindé en plusieurs blocs OCR
    #    (les séparateurs restant requis, des nombres adjacents non liés
    #     ne peuvent pas produire de faux positif)
    joined = ' '.join(b.text for b in blocks)
    return _match_grade_code(joined, 0.70)


def _match_grade_code(text: str, confidence: float) -> dict | None:
    for m in _GRADE_CODE_RE.finditer(text):
        g, w = int(m.group(2)), int(m.group(3))
        if (GRAMMAGE_RANGE[0] <= g <= GRAMMAGE_RANGE[1]
                and WIDTH_RANGE[0] <= w <= WIDTH_RANGE[1]):
            logger.info(f"Code grade '{m.group(0).strip()}' → "
                        f"grammage={g} largeur={w}")
            return {
                'grammage': g,
                'width_mm': w,
                'raw': m.group(0).strip(),
                'confidence': confidence,
            }
    return None


_REEL_DATA_FIELD_RE = re.compile(r'([A-Z]{1,4})/(\d{2,3})/(\d{2,3})/(\d{3,5})')


def decode_reel_data_field(blocks) -> dict | None:
    """
    Décode un champ "Reel Data" textuel : "FL/90/195/9764"
        segment 2 = grammage   segment 3 = largeur en cm (×10 → mm)
    (présent sur les étiquettes Interpac et similaires).

    Retour : {'grammage','width_mm','raw','confidence'} ou None.
    """
    for b in blocks:
        norm = re.sub(r'\s*/\s*', '/', b.text.upper())
        m = _REEL_DATA_FIELD_RE.search(norm)
        if not m:
            continue
        g, w_cm = int(m.group(2)), int(m.group(3))
        if (GRAMMAGE_RANGE[0] <= g <= GRAMMAGE_RANGE[1]
                and 50 <= w_cm <= 290):
            return {
                'grammage': g,
                'width_mm': w_cm * 10,
                'raw': m.group(0),
                'confidence': float(b.confidence),
            }
    return None


def _score(cand: dict, hints: dict, ocr_conf: float) -> tuple[float, int]:
    """
    Score un candidat. Plus il concorde avec l'extraction spatiale, mieux
    c'est. Retourne (score, nb_concordances).
    """
    score = 1.0
    matches = 0
    for field, key in (('grammage', 'g'), ('width_mm', 'w'), ('weight_kg', 'k')):
        h = hints.get(field)
        if h is None:
            continue
        tol = max(2.0, h * 0.03)
        if abs(h - cand[key]) <= tol:
            score += 3.0
            matches += 1
        else:
            score -= 1.0

    score += ocr_conf * 0.2
    if cand['plen'] <= 3:           # les vrais codes ont un préfixe court
        score += 0.1
    return score, matches
