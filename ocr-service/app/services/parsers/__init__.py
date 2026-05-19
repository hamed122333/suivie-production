"""
Parsers OCR — architecture UNIVERSELLE.

Il n'y a plus un parser par fournisseur : un unique `UniversalParser`
extrait les données de n'importe quelle étiquette de bobine (30+ fournisseurs)
en combinant 6 stratégies qui se recoupent.

Ajouter un fournisseur = ajouter ses mots-clés de détection du NOM dans
`supplier_detector.py`. L'extraction des données ne demande aucun code.
"""

from app.services.parsers.universal_parser import UniversalParser

# Instance unique réutilisée
_universal_parser = UniversalParser()


def get_parser(supplier_name: str | None = None):
    """
    Retourne le parser universel. `supplier_name` (détecté par
    supplier_detector) ne sert qu'à l'affichage du nom du fournisseur ;
    l'extraction est identique pour tous.
    """
    return _universal_parser
