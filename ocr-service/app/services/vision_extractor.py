"""
Extraction par IA VISUELLE — lit l'étiquette directement depuis l'image.

Les étiquettes de bobines (30+ fournisseurs) ont des structures trop diverses
pour une logique heuristique fiable. Un modèle de vision « voit » l'étiquette
comme un humain et renvoie directement les champs.

Fournisseur : NVIDIA NIM (https://build.nvidia.com) — API gratuite,
compatible OpenAI. Modèle configurable via VISION_MODEL.

Si aucune clé API n'est configurée OU si l'appel échoue, le service bascule
automatiquement sur le pipeline OCR local (voir scan.py).
"""

import base64
import io
import json
import logging
import re
import urllib.error
import urllib.request

from PIL import Image, ImageOps

from app.config import settings
from app.services import barcode_decoder

logger = logging.getLogger(__name__)

NVIDIA_ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions"

FIELDS = ("supplier", "reel_serial_number", "grammage", "width_mm", "weight_kg")
# Tous les champs demandés au modèle. Certains (sap_order, customer_order,
# diameter_mm, length_m) sont des « leurres » : en obligeant le modèle à les
# remplir séparément, on l'empêche de les confondre avec les vrais champs.
_MODEL_KEYS = (
    "supplier", "reel_number", "sap_order", "customer_order",
    "grammage", "width_mm", "diameter_mm", "weight_kg", "length_m",
    "grade_code", "barcode_digits",
)

_PROMPT = """Tu analyses la photo d'une étiquette de bobine de papier/carton.

Lis CHAQUE champ étiqueté sur l'image et renvoie UNIQUEMENT ce JSON, sur une
seule ligne, sans aucun autre texte :
{"supplier":"...","reel_number":"...","sap_order":"...","customer_order":"...","grammage":0,"width_mm":0,"diameter_mm":0,"weight_kg":0,"length_m":0,"grade_code":"...","barcode_digits":"..."}

Pour CHAQUE clé, trouve sur l'image l'étiquette correspondante et copie la
valeur qui est juste à côté ou juste en dessous :

- supplier : le FABRICANT du papier (marque / logo en haut de l'étiquette :
  SAICA, SCA, Stora Enso, International Paper, Smurfit Westrock, Hamburger,
  Mondi, Sotipapier, Interpac, Greenliner, Papeleras...).
  ⚠ PAS le nom du produit (texte sous « Grade », « Calidad », « Quality »,
  « Désignation commerciale »).

- reel_number : valeur du champ « Reel Number » / « I.P. Reel Number » /
  « N° de la bobine » / « N° Bobina » / « Roll Number ». Copie EXACTE.
  C'est un identifiant qui contient des CHIFFRES (parfois aussi des lettres
  ou des points, ex : « 5.23.06770.41 », « WRR46A0510366 »).
  ⚠ CE N'EST JAMAIS un mot seul : un nom d'usine (Golbey, Obbola, De Hoop,
  Roanoke Rapids) ou de ville n'est PAS un numéro de bobine.
  Si aucun champ n'est étiqueté ainsi, prends un nombre AUTONOME de 6 à 12
  chiffres imprimé en texte normal — PAS le long nombre de 14 chiffres ou
  plus imprimé sous un code-barres (c'est un autre code, pas le n° de bobine).

- sap_order : valeur du champ « SAP Order » (sinon null).
- customer_order : valeur du champ « Customer Order » / « Sales Order » /
  « S/PED » / « Order No » (sinon null).

- grammage : champ « Grammage » / « Substance » / « Gramaje » / « GSM »
  (g/m², env. 60-400).
- width_mm : champ « Width » / « WIDTH-MM » / « Laize » / « Largeur » /
  « Ancho » / « Anchura ». En millimètres (si en cm, multiplie par 10).
- diameter_mm : champ « Diameter » / « DIAMETER-MM » / « Diamètre » (sinon null).
- weight_kg : champ « Weight » / « WEIGHT-KG » / « Reel weight » / « Poids » /
  « Peso » (kilogrammes, env. 300-4000).
- length_m : champ « Length » / « LENGTH-M » / « Longueur » / « Longitud »
  (mètres, sinon null).

- grade_code : un code de la forme NOMBRE-NOMBRE-NOMBRE qui encode
  grade-grammage-largeur (ex : « 3300-130-1950 » → grammage 130, largeur 1950).
  Recopie-le tel quel. null si absent.

- barcode_digits : la plus longue suite de chiffres imprimée sous un
  code-barres (14 chiffres minimum), copiée exactement (sinon null).

CAS PARTICULIER — étiquette en grille SANS étiquettes de colonnes lisibles :
  La grille suit ce schéma : 1ère ligne = grammage (petit, 60-400) puis
  largeur (1000-2800) ; 2ème ligne = poids (300-4000) puis longueur
  (3000-15000). Utilise grade_code et ces plages pour bien classer chaque
  nombre.

Règles strictes :
- Chaque valeur vient du champ qui porte EXACTEMENT ce nom. Ne devine pas et
  ne mélange JAMAIS : width avec diameter, weight avec length, reel_number
  avec sap_order ou customer_order.
- Les nombres sont bruts, sans unité ni texte. null si illisible.
- Réponds avec le JSON uniquement, rien d'autre."""


def is_available() -> bool:
    """L'IA visuelle est-elle configurée et activée ?"""
    return bool(settings.vision_enabled and settings.nvidia_api_key)


def extract_from_image(image_bytes: bytes) -> dict | None:
    """
    Envoie l'image à l'IA visuelle et renvoie les champs extraits.

    Returns:
        dict {supplier, reel_serial_number, grammage, width_mm, weight_kg}
        ou None si indisponible / échec.
    """
    if not is_available():
        return None

    try:
        img_b64 = _prepare_image(image_bytes)
        payload = {
            "model": settings.vision_model,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": _PROMPT},
                    {"type": "image_url",
                     "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}},
                ],
            }],
            "max_tokens": 400,
            "temperature": 0.0,
            "top_p": 1.0,
        }
        request = urllib.request.Request(
            NVIDIA_ENDPOINT,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {settings.nvidia_api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=240) as response:
            body = json.loads(response.read().decode("utf-8"))

        content = body["choices"][0]["message"]["content"]
        parsed = _parse_fields(content)
        result = _sanitize(parsed)
        result, confirmed_gc = _reconcile_with_grade_code(result, parsed.get("grade_code"))
        result, confirmed_bc = _reconcile_with_barcode(result)
        result["confidence"] = _confidence(result, confirmed_gc | confirmed_bc)
        if any(result.get(k) is not None for k in FIELDS):
            logger.info(f"IA visuelle OK: { {k: result.get(k) for k in FIELDS} }")
            return result

        logger.warning(f"IA visuelle — aucune donnée exploitable: {content[:200]}")
        return None

    except urllib.error.HTTPError as e:
        logger.warning(f"IA visuelle — erreur HTTP {e.code}: {e.read()[:200]}")
        return None
    except Exception as e:
        logger.warning(f"IA visuelle indisponible ({e}) — bascule sur OCR local")
        return None


# ── Internes ───────────────────────────────────────────────────────────────

def _prepare_image(image_bytes: bytes) -> str:
    """Corrige l'orientation, redimensionne et encode en base64 JPEG."""
    img = Image.open(io.BytesIO(image_bytes))
    img = ImageOps.exif_transpose(img).convert("RGB")

    w, h = img.size
    longest = max(w, h)
    if longest > 1300:
        scale = 1300 / longest
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=85)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def _parse_fields(content: str) -> dict:
    """
    Extrait les 5 champs de la réponse du modèle.

    Robuste : tente d'abord un parsing JSON strict ; si le JSON est malformé
    (fréquent avec les petits modèles), extrait chaque champ par expression
    régulière directement depuis le texte.
    """
    content = (content or "").strip()
    content = re.sub(r'```(?:json)?', '', content).strip()

    # 1. Parsing JSON strict
    match = re.search(r'\{.*\}', content, re.DOTALL)
    if match:
        try:
            obj = json.loads(match.group(0))
            if isinstance(obj, dict):
                return {k: obj.get(k) for k in _MODEL_KEYS}
        except json.JSONDecodeError:
            pass

    # 2. Repli : extraction champ par champ (tolère un JSON cassé)
    logger.info("IA visuelle — JSON imparfait, extraction par motif")
    result = {}
    for key in _MODEL_KEYS:
        m = re.search(
            rf'"?{key}"?\s*:\s*'
            rf'("(?P<s>[^"]*)"|(?P<n>-?[\d.]+)|null|(?P<u>[^,}}\n]+))',
            content, re.IGNORECASE,
        )
        if not m:
            result[key] = None
        elif m.group('s') is not None:
            result[key] = m.group('s')
        elif m.group('n') is not None:
            result[key] = m.group('n')
        elif m.group('u') is not None:
            result[key] = m.group('u').strip().strip('"\'')
        else:
            result[key] = None
    return result


def _sanitize(raw: dict) -> dict:
    """Nettoie et fiabilise les valeurs."""
    def to_number(v):
        if v is None:
            return None
        try:
            return float(str(v).replace(",", ".").strip())
        except (ValueError, TypeError):
            return None

    grammage = to_number(raw.get("grammage"))
    width = to_number(raw.get("width_mm"))
    weight = to_number(raw.get("weight_kg"))

    # Sécurité : une largeur < 500 est probablement en cm → convertir
    if width is not None and 0 < width < 500:
        width *= 10

    # Contrôle de cohérence : rejeter les valeurs hors plage métier
    # (mieux vaut un champ vide à corriger qu'une valeur fausse affichée OK)
    if grammage is not None and not (20 <= grammage <= 600):
        grammage = None
    if width is not None and not (300 <= width <= 4000):
        width = None
    if weight is not None and not (100 <= weight <= 6000):
        weight = None

    def to_text(v):
        if v is None:
            return None
        s = str(v).strip()
        return s if s and s.lower() not in ("null", "none", "n/a") else None

    barcode = raw.get("barcode_digits")
    barcode = re.sub(r'\D', '', str(barcode)) if barcode else None

    # Un numéro de bobine contient des chiffres — rejeter un mot seul
    # (ex: "GOLBEY" = nom d'usine, pas un n° de bobine).
    serial = to_text(raw.get("reel_number"))
    if serial and len(re.findall(r'\d', serial)) < 4:
        serial = None

    # On ne garde que les vrais champs ; les leurres (sap_order,
    # customer_order, diameter_mm, length_m) ont fait leur travail :
    # forcer le modèle à ne pas les confondre avec les vraies valeurs.
    return {
        "supplier": to_text(raw.get("supplier")),
        "reel_serial_number": serial,
        "grammage": grammage,
        "width_mm": width,
        "weight_kg": weight,
        "barcode_digits": barcode or None,
    }


def _reconcile_with_grade_code(result: dict, grade_code) -> tuple[dict, set]:
    """
    Décode un code grade « GRADE-GRAMMAGE-LARGEUR » (ex: 3300-130-1950).

    Fiable pour les étiquettes sans en-tête lisible (Stora Enso…). Retourne
    aussi l'ensemble des champs ainsi CONFIRMÉS (confiance élevée).
    """
    if not grade_code:
        return result, set()
    m = re.search(r'(\d{3,4})\D{1,3}(\d{2,3})\D{1,3}(\d{3,4})', str(grade_code))
    if not m:
        return result, set()
    g, w = int(m.group(2)), int(m.group(3))
    if 40 <= g <= 400 and 700 <= w <= 2900:
        logger.info(f"Code grade '{grade_code}' → grammage={g}, largeur={w}")
        result["grammage"] = float(g)
        result["width_mm"] = float(w)
        return result, {"grammage", "width_mm"}
    return result, set()


def _reconcile_with_barcode(result: dict) -> tuple[dict, set]:
    """
    Vérification croisée par le code-barres « reel data ».

    S'il est lisible et concorde avec au moins une valeur lue, il fait
    autorité (corrige notamment la confusion poids/longueur). Retourne
    aussi l'ensemble des champs CONFIRMÉS par le code-barres.
    """
    digits = result.pop("barcode_digits", None)
    if not digits:
        return result, set()

    hints = {k: result[k] for k in ("grammage", "width_mm", "weight_kg")
             if isinstance(result.get(k), (int, float))}
    decoded = barcode_decoder.decode_string(digits, hints)
    if not decoded or decoded.get("matches", 0) < 1:
        return result, set()

    confirmed = set()
    for f in ("grammage", "width_mm", "weight_kg"):
        if decoded.get(f) is not None:
            if decoded[f] != result.get(f):
                logger.info(f"Code-barres corrige {f}: "
                            f"{result.get(f)} → {decoded[f]}")
            result[f] = float(decoded[f])
            confirmed.add(f)
    return result, confirmed


def _confidence(result: dict, confirmed: set) -> dict:
    """
    Confiance HONNÊTE par champ :
    - champ confirmé par code-barres / code grade → 0.96 (vert, fiable)
    - champ lu par l'IA seule → confiance moyenne (orange « à vérifier »)
    - le n° de bobine, champ le plus délicat → toujours à vérifier
    - champ absent → 0
    """
    base = {
        "supplier": 0.85,
        "reel_serial_number": 0.65,
        "grammage": 0.78,
        "width_mm": 0.78,
        "weight_kg": 0.78,
    }
    conf = {}
    for field, value in base.items():
        if result.get(field) is None:
            conf[field] = 0.0
        elif field in confirmed:
            conf[field] = 0.96
        else:
            conf[field] = value
    return conf
