/**
 * Service pour normaliser le texte brut extrait par l'OCR.
 * Corrige les erreurs de lecture courantes (OCR Noise).
 */
class NormalizationService {
  normalizeText(text) {
    if (!text) return '';

    let normalized = text;

    // 1. Remplacements globaux (OCR Noise)
    const commonErrors = {
      '2OOO': '2000',
      'I9': '19',
      'SAlCA': 'SAICA',
      'l950': '1950',
      'O64': '064',
      'l0': '10',
      'O1': '01',
      'g/m2': 'g/m²',
      'g/mz': 'g/m²'
    };

    Object.entries(commonErrors).forEach(([bad, good]) => {
      const regex = new RegExp(bad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      normalized = normalized.replace(regex, good);
    });

    // 2. Correction contextuelle des nombres (ex: 'O' à la place de '0' dans un nombre)
    // On cherche des motifs comme "2O25" ou "1OO"
    normalized = normalized.replace(/(\d)[O|o](\d)/g, '$10$2');
    normalized = normalized.replace(/(\d)[O|o]/g, '$10');
    normalized = normalized.replace(/[O|o](\d)/g, '0$1');

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

