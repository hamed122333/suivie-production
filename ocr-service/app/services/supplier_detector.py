"""
Détection du fournisseur par matching de mots-clés.

Basé sur les labels réels analysés:
- SAICA         : "SAICA", "HIDROSAICA", "www.saica.com"
- SOTIPAPIER    : "SOTIPAPIER"
- DS SMITH      : "DS SMITH", "DS Smith", "LINERPAC"
- PAPRESA       : "Papresa", "we are paper"
- NORSKE SKOG   : "Norske Skog", "NORSKE"
- SMURFIT       : "SMURFIT", "WESTROCK"
- INTERNATIONAL : "INTERNATIONAL PAPER"
- MONDI         : "MONDI"
- GENERIC       : fallback si aucun fournisseur détecté
"""

import re
import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class SupplierMatch:
    name: str           # Code interne (ex: STORA_ENSO)
    confidence: float   # 0.0 → 1.0
    matched_keyword: str
    display_name: str = ""   # Nom lisible affiché (ex: Stora Enso)


# Noms d'affichage lisibles (code interne → libellé propre)
DISPLAY_NAMES = {
    "SAICA":               "SAICA",
    "SCA":                 "SCA Containerboard",
    "STORA_ENSO":          "Stora Enso",
    "HAMBURGER":           "Hamburger Containerboard",
    "INTERPAC":            "Interpac",
    "PAPELERAS":           "Papeleras del Arlanzón",
    "GREENLINER":          "Greenliner",
    "SOTIPAPIER":          "Sotipapier",
    "DS_SMITH":            "DS Smith",
    "PAPRESA":             "Papresa",
    "NORSKE_SKOG":         "Norske Skog",
    "SMURFIT":             "Smurfit Westrock",
    "INTERNATIONAL_PAPER": "International Paper",
    "MONDI":               "Mondi",
    "MODERN_KARTON":       "Modern Karton",
    "GENERIC":             "Fournisseur inconnu",
}


# Ordre important: keywords plus spécifiques en premier
SUPPLIER_RULES = [
    {
        "name": "SAICA",
        # Logo often unreadable (white on green) — fallback on product name and trilingual headers
        "keywords": ["saica", "hidrosaica", "www.saica", "saica pack",
                     "gramaje / substance / grammage", "ancho / width / laize",
                     "gramaje/substance/grammage", "ancho/width/laize",
                     "peso/weight/poids"],
        "confidence": 0.98,
    },
    {
        "name": "GREENLINER",
        "keywords": ["greenliner", "g-flute", "empowered papermaking",
                     "greenliner.eg"],
        "confidence": 0.97,
    },
    {
        "name": "HAMBURGER",
        "keywords": ["hamburger containerboard", "hamburger", "austroliner",
                     "prinzhorn"],
        "confidence": 0.96,
    },
    {
        "name": "SCA",
        # Mots-clés SPÉCIFIQUES à SCA — éviter "containerboard"/"kraftliner"
        # seuls (génériques : "Hamburger Containerboard" les contient aussi).
        "keywords": ["sca kraftliner", "sca containerboard",
                     "obbola", "sca.com/containerboard"],
        "confidence": 0.97,
    },
    {
        "name": "STORA_ENSO",
        # Logo "storaenso" rarement lu ; "de hoop" = mill Stora Enso
        "keywords": ["storaenso", "stora enso", "stora-enso", "de hoop"],
        "confidence": 0.93,
    },
    {
        "name": "PAPELERAS",
        # Papeleras del Arlanzón — logo lu "poba"/"papa", produits "ARLANDUO" etc.
        "keywords": ["papeleras de arlanzo", "papeleras del arlanzon", "papeleras",
                     "arlanzon", "arlanzo", "arlanduo", "arland", "poba",
                     "weigth(kg)/peso(kg)", "reel no.code"],
        "confidence": 0.96,
    },
    {
        "name": "SOTIPAPIER",
        "keywords": ["sotipapier", "soti papier"],
        "confidence": 0.97,
    },
    {
        "name": "DS_SMITH",
        "keywords": ["ds smith", "ds.smith", "linerpac"],
        "confidence": 0.97,
    },
    {
        "name": "PAPRESA",
        "keywords": ["papresa"],
        "confidence": 0.97,
    },
    {
        "name": "NORSKE_SKOG",
        "keywords": ["norske skog", "norske", "golbey"],
        "confidence": 0.96,
    },
    {
        "name": "SMURFIT",
        "keywords": ["smurfit", "westrock", "smurfit westrock", "swm"],
        "confidence": 0.97,
    },
    {
        "name": "INTERNATIONAL_PAPER",
        "keywords": ["international paper", "intl paper"],
        "confidence": 0.97,
    },
    {
        "name": "MONDI",
        "keywords": ["mondi"],
        "confidence": 0.96,
    },
    {
        "name": "MODERN_KARTON",
        "keywords": ["modern karton", "modern"],
        "confidence": 0.95,
    },
    {
        "name": "INTERPAC",
        # Logo souvent lu "intepac" (r manquant). NE PAS utiliser de mots
        # génériques ("reel number", "reel data") : ils existent aussi
        # sur les étiquettes SCA, DS Smith, etc.
        "keywords": ["interpac", "intepac", "inter pac"],
        "confidence": 0.95,
    },
]


# Mots d'en-tête / libellés à NE PAS prendre pour un nom de fournisseur
_HEADER_WORDS = {
    # EN
    "substance", "width", "weight", "grade", "length", "mill", "reel",
    "number", "data", "paper", "production", "date", "unwind", "direction",
    "diameter", "diameters", "topside", "core", "internal", "moisture",
    "customer", "order", "origin", "made", "net", "marks", "information",
    "joins", "recycled", "roll", "basis", "code", "quality", "commodity",
    "place", "country", "handling", "other", "text", "grammage", "substance",
    # FR
    "producteur", "usine", "adresse", "fabrication", "désignation",
    "designation", "commerciale", "poids", "laize", "largeur", "longueur",
    "bobine", "numéro", "numero", "grammage", "tel", "fax", "humidité",
    # ES
    "calidad", "gramaje", "anchura", "ancho", "peso", "longitud", "bobina",
    "fabricante", "producto", "país", "pais", "origen", "humedad", "proteger",
    # DE / divers
    "breite", "gewicht", "www", "com",
}


class SupplierDetector:

    def detect(self, full_text: str, blocks=None) -> SupplierMatch:
        """
        Détecte le fournisseur. Le nom AFFICHÉ est EXTRAIT DE L'IMAGE : c'est
        le texte le plus proéminent de l'étiquette (plus gros caractère, en
        excluant les libellés d'en-tête). Les mots-clés ne servent qu'au
        code interne et au score de confiance.
        """
        prominent = self._extract_prominent_name(blocks)
        text_lower = full_text.lower()

        for rule in SUPPLIER_RULES:
            for keyword in rule["keywords"]:
                if keyword in text_lower:
                    display = prominent or DISPLAY_NAMES.get(rule["name"], rule["name"])
                    logger.info(f"Fournisseur: {rule['name']} "
                                f"(mot-clé '{keyword}' → nom lu sur l'image: '{display}')")
                    return SupplierMatch(
                        name=rule["name"],
                        confidence=rule["confidence"],
                        matched_keyword=keyword,
                        display_name=display,
                    )

        # Fournisseur non répertorié — on affiche quand même le nom lu
        logger.info(f"Fournisseur non répertorié — nom lu: '{prominent}'")
        return SupplierMatch(
            name="GENERIC",
            confidence=0.55 if prominent else 0.3,
            matched_keyword="",
            display_name=prominent or DISPLAY_NAMES["GENERIC"],
        )

    def _extract_prominent_name(self, blocks) -> str | None:
        """
        Extrait le nom le plus proéminent de l'étiquette : le bloc texte au
        plus GROS caractère, alphabétique, qui n'est pas un libellé d'en-tête
        (Substance, Width, Weight…) ni un nombre.
        """
        if not blocks:
            return None

        candidates = []
        for b in blocks:
            text = re.sub(r'\s+', ' ', b.text.strip()).strip(" :.-_/|")
            letters = sum(c.isalpha() for c in text)
            if letters < 3 or len(text) > 30:
                continue
            # exclure les blocs qui ne sont QUE des mots d'en-tête
            words = re.findall(r'[a-zà-ÿ]+', text.lower())
            if words and all(w in _HEADER_WORDS for w in words):
                continue
            # exclure si majoritairement numérique
            if letters < 0.5 * len(text.replace(' ', '')):
                continue
            area = max(1.0, b.width * b.height)
            candidates.append((text, area, b.confidence))

        if not candidates:
            return None
        # plus gros caractère = nom le plus proéminent
        candidates.sort(key=lambda c: (-c[1], -c[2]))
        return candidates[0][0]


# Singleton
supplier_detector = SupplierDetector()
