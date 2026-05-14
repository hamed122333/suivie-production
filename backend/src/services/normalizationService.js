/**
 * Service pour normaliser le texte brut extrait par l'OCR.
 *
 * Corrige les erreurs de lecture courantes (OCR Noise) que Tesseract produit
 * sur des étiquettes industrielles : confusion O/0, I/1/l, espaces parasites,
 * etc.
 */
class NormalizationService {
  normalizeText(text) {
    if (!text) return '';

    let normalized = text;

    // 1. Remplacements globaux pour les erreurs OCR connues sur étiquettes bobines.
    const commonErrors = {
      '2OOO': '2000',
      'I9': '19',
      'SAlCA': 'SAICA',
      'l950': '1950',
      'O64': '064',
      'l0': '10',
      'O1': '01',
      'g/m2': 'g/m²',
      'g/mz': 'g/m²',
      'g/rn2': 'g/m²',   // 'm' confondu avec 'rn'
      'g/rn²': 'g/m²',
      'KGS': 'KG',        // uniformiser l'unité
      'Kgs': 'KG',
    };

    Object.entries(commonErrors).forEach(([bad, good]) => {
      const regex = new RegExp(bad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      normalized = normalized.replace(regex, good);
    });

    // 2. Correction contextuelle des nombres : 'O' ou 'o' confondus avec '0'
    //    dans un contexte numérique.
    //    Correction de bug : [O|o] dans une classe de caractères regex correspond
    //    littéralement à 'O', '|', ou 'o'. La forme correcte est [Oo].
    //    Boucle jusqu'à stabilisation pour gérer les runs consécutifs
    //    (ex : "1OO" → "10O" → "100").
    let prevNorm;
    do {
      prevNorm = normalized;
      normalized = normalized.replace(/(\d)[Oo](\d)/g, '$10$2');     // O entre deux chiffres
      normalized = normalized.replace(/(\d)[Oo](?=\D|$)/g, '$10');   // O après un chiffre
      normalized = normalized.replace(/(?<=^|\D)[Oo](\d)/g, '0$1'); // O avant un chiffre
    } while (normalized !== prevNorm);

    // 3. Correction 'l' (L minuscule) confondu avec '1' entre chiffres.
    //    Exemples : "l23456" → "123456", "12l456" → "121456"
    normalized = normalized.replace(/(\d)l(\d)/g, '$11$2');
    normalized = normalized.replace(/^l(\d)/gm, '1$1');

    return normalized;
  }

  /**
   * Tente de convertir une chaîne en nombre propre.
   */
  parseNumber(str) {
    if (!str) return null;
    const clean = str.replace(',', '.').replace(/[^\d.]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? null : num;
  }
}

module.exports = new NormalizationService();

