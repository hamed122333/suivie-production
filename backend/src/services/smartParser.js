const NormalizationService = require('./normalizationService');
const ConfidenceScorer = require('./confidenceScorer');

/**
 * Parser Universel Contextuel.
 * Ne dépend pas du fournisseur mais des ancres de texte proches.
 */
class SmartParser {
  parse(rawText) {
    const lines = rawText.split('\n');
    const result = {
      supplier: { value: this.extractSupplier(rawText), confidence: 0.8 },
      reel_serial_number: { value: null, confidence: 0 },
      weight_kg: { value: null, confidence: 0 },
      width_mm: { value: null, confidence: 0 },
      grammage: { value: null, confidence: 0 }
    };

    // 1. Extraction du Reel Serial Number (Priorité : Long numéro près d'un mot clé)
    const reelMatch = rawText.match(/(?:reel|bobin|roll|bobine|no|n°|ni)[^\d]{0,10}(\d{7,15})/i);
    if (reelMatch) {
      result.reel_serial_number.value = reelMatch[1];
      result.reel_serial_number.confidence = ConfidenceScorer.calculate(reelMatch[1], 'reel_serial_number', reelMatch[0]);
    } else {
      // Fallback: chercher n'importe quel numéro long isolé
      const longNum = rawText.match(/\b\d{8,12}\b/);
      if (longNum) {
        result.reel_serial_number.value = longNum[0];
        result.reel_serial_number.confidence = 0.6;
      }
    }

    // 2. Extraction du Poids (kg)
    const weightMatch = rawText.match(/(\d{3,5})[^\d]{0,5}(?:kg|peso|weight|poids|agir)/i) ||
                       rawText.match(/(?:kg|peso|weight|poids|agir)[^\d]{0,5}(\d{3,5})/i);
    if (weightMatch) {
      const val = weightMatch[1];
      result.weight_kg.value = val;
      result.weight_kg.confidence = ConfidenceScorer.calculate(val, 'weight_kg', weightMatch[0]);
    }

    // 3. Extraction de la Largeur (mm/cm)
    const widthMatch = rawText.match(/(\d{3,4})[^\d]{0,5}(?:mm|cm|width|ancho|laize|eni)/i) ||
                      rawText.match(/(?:width|ancho|laize|eni)[^\d]{0,5}(\d{3,4})/i);
    if (widthMatch) {
      let val = NormalizationService.parseNumber(widthMatch[1]);
      // Normalisation vers mm si détecté comme cm (ex: 192.5 cm -> 1925 mm)
      if (val < 300) val = val * 10;

      result.width_mm.value = val.toString();
      result.width_mm.confidence = ConfidenceScorer.calculate(val.toString(), 'width_mm', widthMatch[0]);
    }

    // 4. Extraction du Grammage (g/m2)
    const gramMatch = rawText.match(/(\d{2,3})[^\d]{0,5}(?:g\/m|gram|substance|gr)/i) ||
                     rawText.match(/(?:g\/m|gram|substance|gr)[^\d]{0,5}(\d{2,3})/i);
    if (gramMatch) {
      const val = gramMatch[1];
      result.grammage.value = val;
      result.grammage.confidence = ConfidenceScorer.calculate(val, 'grammage', gramMatch[0]);
    }

    return result;
  }

  extractSupplier(text) {
    const suppliers = ['SCA', 'DS SMITH', 'SOTIPAPIER', 'SAICA', 'MODERN KARTON', 'ARLANDUO', 'HAMBURGER', 'PRINZHORN'];
    const lowerText = text.toUpperCase();
    for (const s of suppliers) {
      if (lowerText.includes(s)) return s;
    }
    return 'INCONNU';
  }
}

module.exports = new SmartParser();

