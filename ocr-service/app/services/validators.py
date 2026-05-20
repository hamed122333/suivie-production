"""
Validation métier des champs extraits.

Chaque champ a des règles industrielles:
  grammage  : 50–350 g/m²     (papier léger → carton lourd)
  width_mm  : 800–2800 mm     (bobines industrielles standard)
  weight_kg : 500–5000 kg     (bobines papier usine)
  serial    : 6–18 digits     (numéros de bobines typiques)

Valeur hors plage → confiance réduite + flag "hors_plage"
Valeur impossible → rejetée (None)
"""

import re
import logging
from typing import Optional

logger = logging.getLogger(__name__)


VALIDATION_RULES = {
    'grammage': {
        'min': 50,
        'max': 350,
        'unit': 'g/m²',
    },
    'width_mm': {
        'min': 800,
        'max': 2800,
        'unit': 'mm',
    },
    'weight_kg': {
        'min': 400,
        'max': 5000,
        'unit': 'kg',
    },
}


class FieldValidator:

    def validate_numeric(
        self,
        field: str,
        extraction: Optional[dict],
    ) -> Optional[dict]:
        """
        Valide un champ numérique.

        Retourne le résultat enrichi avec:
          - valid: bool
          - warning: str si hors plage
          - confidence: ajustée si suspect
        """
        if extraction is None:
            return None

        value = extraction.get('value')
        if value is None:
            return extraction

        rules = VALIDATION_RULES.get(field)
        if not rules:
            return extraction

        try:
            num = float(value)
        except (ValueError, TypeError):
            extraction['valid'] = False
            extraction['warning'] = f"Valeur non numérique: {value}"
            extraction['confidence'] *= 0.2
            return extraction

        # Vérification plage
        if num < rules['min'] or num > rules['max']:
            extraction['valid'] = False
            extraction['warning'] = (
                f"Hors plage: {num} {rules['unit']} "
                f"(attendu {rules['min']}–{rules['max']})"
            )
            extraction['confidence'] = extraction.get('confidence', 0.5) * 0.3
            logger.warning(f"Validation {field}: {extraction['warning']}")
        else:
            extraction['valid'] = True
            extraction['value'] = int(num) if num == int(num) else round(num, 2)

        return extraction

    def validate_serial(self, extraction: Optional[dict]) -> Optional[dict]:
        """
        Valide le numéro de série/bobine.

        Les numéros peuvent être purement numériques (ex: 179864, 32603161233)
        OU alphanumériques (ex: 26C06N02120000). On préserve donc les lettres.
        """
        if extraction is None:
            return None

        value = str(extraction.get('value', '')).strip()

        # Garder lettres, chiffres ET séparateurs significatifs (. -)
        # car certains numéros de bobine sont pointés (ex: 5.23.06770.41)
        cleaned = re.sub(r'[^0-9A-Za-z.\-]', '', value).upper().strip('.-')
        alnum = re.sub(r'[^0-9A-Za-z]', '', cleaned)

        if len(alnum) < 6:
            extraction['valid'] = False
            extraction['warning'] = f"Numéro trop court: {len(cleaned)} caractères (min 6)"
            extraction['confidence'] *= 0.3
        elif len(cleaned) > 20:
            extraction['valid'] = True
            extraction['warning'] = f"Numéro tronqué ({len(cleaned)} caractères)"
            extraction['value'] = cleaned[:20]
        else:
            extraction['valid'] = True
            extraction['value'] = cleaned

        return extraction

    def validate_all(self, parsed: dict) -> dict:
        """Valide tous les champs d'un résultat parsé."""
        return {
            'grammage': self.validate_numeric('grammage', parsed.get('grammage')),
            'width_mm': self.validate_numeric('width_mm', parsed.get('width_mm')),
            'weight_kg': self.validate_numeric('weight_kg', parsed.get('weight_kg')),
            'reel_serial_number': self.validate_serial(parsed.get('reel_serial_number')),
        }


# Singleton
validator = FieldValidator()
