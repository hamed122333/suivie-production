"""
Scoring de confiance global du scan.

La confiance finale = combinaison de:
1. Confiance OCR (PaddleOCR)       — qualité de reconnaissance du texte
2. Proximité spatiale              — label bien proche de sa valeur
3. Validation métier               — valeur dans les plages attendues
4. Correspondance template         — fournisseur reconnu avec template spécifique

Score final par champ: 0.0 → 1.0
Score global: moyenne pondérée des 4 champs principaux

Interprétation:
  > 0.85  → Confiance élevée — afficher en vert, pas besoin de correction
  0.60–0.85 → Confiance moyenne — afficher en orange, suggérer vérification
  < 0.60  → Confiance faible — afficher en rouge, forcer vérification manuelle
"""

import logging

logger = logging.getLogger(__name__)

# Poids pour le score global (les 4 champs critiques)
FIELD_WEIGHTS = {
    'grammage': 0.25,
    'width_mm': 0.25,
    'weight_kg': 0.25,
    'reel_serial_number': 0.25,
}

# Bonus si fournisseur reconnu avec template spécifique (≠ GENERIC)
KNOWN_SUPPLIER_BONUS = 0.05


def compute_field_confidence(extraction: dict | None, field: str) -> float:
    """
    Calcule la confiance finale pour un champ.

    Facteurs:
    - OCR confidence (base)
    - Valeur valide (bonus)
    - Valeur invalide ou hors plage (malus)
    - Source de l'extraction (inline > spatial > fallback)
    """
    if extraction is None:
        return 0.0

    value = extraction.get('value')
    if value is None:
        return 0.0

    # Base: confiance OCR
    base_conf = float(extraction.get('confidence', 0.5))

    # Ajustement selon validité
    is_valid = extraction.get('valid', True)  # Par défaut on suppose valide
    if not is_valid:
        base_conf *= 0.4

    # Ajustement selon source
    source = extraction.get('source', 'unknown')
    source_multiplier = {
        'inline_colon': 1.0,      # "Label : valeur" sur même ligne → très fiable
        'consensus': 1.0,         # Spatial + code-barres concordent → certain
        'barcode_encoded': 1.0,   # Décodé du code-barres structuré → très fiable
        'right': 0.95,            # Valeur à droite du label → fiable
        'reel_data_field': 0.90,  # Champ Reel Data "FL/.../..." → fiable
        'grade_code': 0.90,       # Code grade "XXXX-GGG-WWWW" → fiable
        'grid_heuristic': 0.70,   # Grand nombre en grille → à vérifier
        'alnum_serial': 0.92,     # Numéro de bobine alphanumérique → fiable
        'serial_corroborated': 1.0,   # Serial confirmé par le code-barres → certain
        'serial_near_label': 0.95,    # Serial proche du label bobine → fiable
        'serial_pattern': 0.68,       # Serial trouvé par motif seul → à vérifier
        'below': 0.88,            # Valeur sous le label → légèrement moins fiable
        'positional_same_row': 0.85,  # Extraction positionnelle → assez fiable
        'positional_below': 0.82,
        'heuristic_range': 0.65,  # Heuristique par plage → peu fiable
        'fallback_large_number': 0.60,  # Dernier recours → peu fiable
        'range_fallback': 0.55,   # Poids deviné par plage → peu fiable
        'unknown': 0.80,
    }.get(source, 0.80)

    final = min(1.0, base_conf * source_multiplier)

    # Arrondir à 2 décimales
    return round(final, 2)


def score_result(parsed_validated: dict, supplier_name: str) -> dict:
    """
    Calcule les scores de confiance pour tous les champs.

    Args:
        parsed_validated: dict avec les 4 champs après validation
        supplier_name: nom du fournisseur (SAICA, DS_SMITH, etc.)

    Returns:
        dict avec champs + scores + score global
    """
    field_scores = {}
    weighted_sum = 0.0
    total_weight = 0.0

    for field, weight in FIELD_WEIGHTS.items():
        extraction = parsed_validated.get(field)
        conf = compute_field_confidence(extraction, field)
        field_scores[field] = conf
        weighted_sum += conf * weight
        total_weight += weight

    global_confidence = weighted_sum / total_weight if total_weight > 0 else 0.0

    # Bonus si fournisseur connu
    if supplier_name != "GENERIC":
        global_confidence = min(1.0, global_confidence + KNOWN_SUPPLIER_BONUS)

    global_confidence = round(global_confidence, 2)

    logger.info(
        f"Confiance: grammage={field_scores.get('grammage', 0):.0%} "
        f"width={field_scores.get('width_mm', 0):.0%} "
        f"weight={field_scores.get('weight_kg', 0):.0%} "
        f"serial={field_scores.get('reel_serial_number', 0):.0%} "
        f"→ GLOBAL={global_confidence:.0%}"
    )

    return {
        'field_scores': field_scores,
        'global_confidence': global_confidence,
        'reliability': _reliability_label(global_confidence),
    }


def _reliability_label(conf: float) -> str:
    if conf >= 0.85:
        return "HIGH"
    elif conf >= 0.60:
        return "MEDIUM"
    else:
        return "LOW"
