/**
 * Service pour calculer le score de confiance basé sur le contexte.
 */
class ConfidenceScorer {
  calculate(value, type, context = '') {
    let score = 0.5; // Base score

    if (!value) return 0;

    switch (type) {
      case 'reel_serial_number':
        // Un grand numéro (8-12 chiffres) a une haute confiance
        if (/^\d{8,12}$/.test(value)) score += 0.4;
        if (context.toLowerCase().match(/reel|bobin|roll/)) score += 0.1;
        break;

      case 'weight_kg':
        // Un poids réaliste pour une bobine (entre 500 et 4000)
        const weight = parseFloat(value);
        if (weight > 500 && weight < 5000) score += 0.3;
        if (context.toLowerCase().match(/kg|peso|weight|poids|agir/)) score += 0.2;
        break;

      case 'width_mm':
        // Largeur réaliste (entre 500 et 3000 mm)
        const width = parseFloat(value);
        if (width > 500 && width < 3000) score += 0.3;
        if (context.toLowerCase().match(/mm|cm|width|ancho|laize|eni/)) score += 0.2;
        break;

      case 'grammage':
        // Grammage réaliste (ex: 90, 110, 125, 200)
        const g = parseFloat(value);
        if (g >= 70 && g <= 400) score += 0.3;
        if (context.toLowerCase().match(/g\/m|gram|substance/)) score += 0.2;
        break;
    }

    return Math.min(score, 1).toFixed(2);
  }
}

module.exports = new ConfidenceScorer();

