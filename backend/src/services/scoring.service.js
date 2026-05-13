/**
 * Intelligent Scoring Service
 *
 * Scores article code candidates using 10+ heuristic rules:
 * 1. Known prefix matching
 * 2. Standard length distribution (5-12 chars)
 * 3. Digit-letter ratio balance
 * 4. OCR confidence score
 * 5. Isolation on label (spatial bonus)
 * 6. Date pattern exclusion
 * 7. Weight/quantity exclusion
 * 8. Visual prominence (size + position)
 * 9. Word source preference (direct > combination > substring)
 * 10. Pattern type matching
 * 11. Consistency with previous scans
 *
 * NO machine learning, NO fine-tuning - pure heuristics
 */

class ScoringService {
  // Known article code prefixes (from CLAUDE.md)
  static KNOWN_PREFIXES = ['CI', 'CV', 'DI', 'DV', 'FC', 'FD', 'PL'];

  // Standard article code length (typical range)
  static STANDARD_LENGTH = { min: 5, max: 12, ideal: 8 };

  // Heuristic weights (total = 100)
  static WEIGHTS = {
    prefixMatch: 20,
    lengthMatch: 12,
    digitLetterRatio: 10,
    ocrConfidence: 15,
    spatialIsolation: 10,
    pattern: 8,
    sourceQuality: 10,
    noDatePattern: 5,
    noWeightPattern: 5,
    visualProminence: 5,
  };

  /**
   * Score all candidates and return ranked list
   * @param {Array} candidates - Candidate objects from CandidateService
   * @param {Object} imageStats - Image metadata
   * @param {Object} context - Additional context (previous codes, etc)
   * @returns {Array} - Candidates sorted by score (highest first)
   */
  static scoreCandidates(candidates, imageStats = {}, context = {}) {
    const scored = candidates.map(candidate => {
      const scores = {
        prefixMatch: this._scorePrefix(candidate),
        lengthMatch: this._scoreLength(candidate),
        digitLetterRatio: this._scoreDigitLetterRatio(candidate),
        ocrConfidence: this._scoreOcrConfidence(candidate),
        spatialIsolation: this._scoreSpatialIsolation(candidate, imageStats),
        pattern: this._scorePattern(candidate),
        sourceQuality: this._scoreSourceQuality(candidate),
        noDatePattern: this._scoreNoDatePattern(candidate),
        noWeightPattern: this._scoreNoWeightPattern(candidate),
        visualProminence: this._scoreVisualProminence(candidate, imageStats),
      };

      // Calculate weighted total
      let totalScore = 0;
      Object.entries(scores).forEach(([key, score]) => {
        const weight = this.WEIGHTS[key] || 0;
        totalScore += (score / 100) * weight;
      });

      // Consistency bonus if matches previous codes
      const consistencyBonus = this._scoreConsistency(candidate, context);
      totalScore = Math.min(100, totalScore + consistencyBonus);

      return {
        ...candidate,
        scores,
        totalScore: Math.round(totalScore),
      };
    });

    // Sort by score descending
    return scored.sort((a, b) => b.totalScore - a.totalScore);
  }

  /**
   * Rule 1: Known prefix matching
   * Scores higher if starts with known prefixes (CI, CV, etc)
   */
  static _scorePrefix(candidate) {
    const text = candidate.text.toUpperCase();

    // Full prefix match (50 points)
    for (const prefix of this.KNOWN_PREFIXES) {
      if (text.startsWith(prefix)) {
        return 100;
      }
    }

    // Partial match (30 points)
    if (/^[A-Z]{2}[\d]/.test(text)) {
      return 60;
    }

    // No known prefix
    return 20;
  }

  /**
   * Rule 2: Standard length distribution
   * Codes are typically 5-12 chars, ideal around 8
   */
  static _scoreLength(candidate) {
    const len = candidate.text.length;
    const { min, max, ideal } = this.STANDARD_LENGTH;

    if (len < min || len > max) {
      return 0; // Too short or too long
    }

    // Gaussian distribution centered on ideal
    const distance = Math.abs(len - ideal);
    const penalty = (distance / ideal) * 100;
    return Math.max(0, 100 - penalty);
  }

  /**
   * Rule 3: Digit-letter ratio
   * Good codes have balance: ~50-70% letters, 30-50% digits
   */
  static _scoreDigitLetterRatio(candidate) {
    const text = candidate.text;
    const digitCount = (text.match(/\d/g) || []).length;
    const letterCount = (text.match(/[A-Z]/g) || []).length;
    const totalCount = digitCount + letterCount;

    if (totalCount === 0) return 0;

    const digitRatio = digitCount / totalCount;
    const letterRatio = letterCount / totalCount;

    // Prefer 30-70 digit range (30% digits = 70% letters)
    if (digitRatio >= 0.3 && digitRatio <= 0.7) {
      return 100;
    } else if (digitRatio >= 0.2 && digitRatio <= 0.8) {
      return 80;
    } else if (digitRatio >= 0.1 && digitRatio <= 0.9) {
      return 60;
    }

    return 20; // Very unbalanced
  }

  /**
   * Rule 4: OCR confidence
   * Higher confidence = higher score
   * Normalize to 0-100
   */
  static _scoreOcrConfidence(candidate) {
    if (!candidate.confidence) return 50; // Default if missing

    // Confidence is usually 0-100 range from Tesseract
    const conf = Math.min(100, Math.max(0, candidate.confidence));

    if (conf >= 90) return 100;
    if (conf >= 80) return 90;
    if (conf >= 70) return 80;
    if (conf >= 60) return 70;
    if (conf >= 50) return 60;

    return Math.max(30, conf);
  }

  /**
   * Rule 5: Spatial isolation
   * Codes are often isolated on label, not surrounded by other text
   */
  static _scoreSpatialIsolation(candidate, imageStats = {}) {
    if (!candidate.bbox) {
      return 50; // Neutral if no bbox
    }

    const bbox = candidate.bbox;
    const imageWidth = imageStats.original?.width || 1000;
    const imageHeight = imageStats.original?.height || 1000;

    // Calculate margins from image edges
    const leftMargin = bbox.x0 / imageWidth;
    const rightMargin = (imageWidth - bbox.x1) / imageWidth;
    const topMargin = bbox.y0 / imageHeight;
    const bottomMargin = (imageHeight - bbox.y1) / imageHeight;

    // Prefer codes with balanced margins (not crammed at edge)
    const minMargin = Math.min(leftMargin, rightMargin, topMargin, bottomMargin);
    const maxMargin = Math.max(leftMargin, rightMargin, topMargin, bottomMargin);

    if (minMargin >= 0.05 && maxMargin <= 0.95) {
      return 100; // Well positioned
    } else if (minMargin >= 0.02 && maxMargin <= 0.98) {
      return 80;
    } else if (minMargin >= 0 && maxMargin <= 1) {
      return 60;
    }

    return 40; // Badly positioned
  }

  /**
   * Rule 6: Pattern type matching
   * Penalize substring candidates, boost direct word matches
   */
  static _scorePattern(candidate) {
    const sourceScores = {
      direct_word: 100,
      word_combination: 85,
      prefix_match: 80,
      spatial_cluster: 75,
      alt_separator: 70,
      substring: 40,
    };

    return sourceScores[candidate.source] || 50;
  }

  /**
   * Rule 7: Source quality
   * Direct OCR words > combinations > substrings
   */
  static _scoreSourceQuality(candidate) {
    // Already covered by pattern but can be weighted differently
    return this._scorePattern(candidate);
  }

  /**
   * Rule 8: Exclude date patterns
   * Don't score text that looks like dates (01/12/2024)
   */
  static _scoreNoDatePattern(candidate) {
    const text = candidate.text;

    // Date patterns to avoid
    const datePatterns = [
      /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/, // DD/MM/YYYY
      /^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/, // YYYY/MM/DD
      /^\d{8}$/, // DDMMYYYY
    ];

    for (const pattern of datePatterns) {
      if (pattern.test(text)) {
        return 0; // Definitely a date
      }
    }

    // Partial date-like patterns (suspicious)
    if (/^\d{2}[\/\-]\d{2}/.test(text)) {
      return 30; // Might be date
    }

    return 100; // Not a date
  }

  /**
   * Rule 9: Exclude weight/quantity patterns
   * Don't score text that looks like weights (1.5kg, 250ml)
   */
  static _scoreNoWeightPattern(candidate) {
    const text = candidate.text;

    // Weight patterns to avoid
    const weightPatterns = [
      /^\d+[\.,]?\d*\s*(kg|g|mg|ml|l|lb|oz)$/i,
      /^\d+[\.,]?\d*$/i, // Pure numbers
      /^(kg|g|ml|l)[\d]/i, // Unit first
    ];

    for (const pattern of weightPatterns) {
      if (pattern.test(text)) {
        return 0; // Definitely weight/quantity
      }
    }

    return 100; // Not weight
  }

  /**
   * Rule 10: Visual prominence
   * Larger text in prominent positions scores higher
   */
  static _scoreVisualProminence(candidate, imageStats = {}) {
    if (!candidate.bbox) {
      return 50; // Neutral
    }

    const bbox = candidate.bbox;
    const imageWidth = imageStats.original?.width || 1000;
    const imageHeight = imageStats.original?.height || 1000;

    // Calculate relative size
    const relativeWidth = bbox.width / imageWidth;
    const relativeHeight = bbox.height / imageHeight;
    const relativeArea = (relativeWidth * relativeHeight) * 100;

    // Ideal prominence: 0.5-5% of image area
    if (relativeArea >= 0.005 && relativeArea <= 0.05) {
      return 100;
    } else if (relativeArea >= 0.003 && relativeArea <= 0.08) {
      return 80;
    } else if (relativeArea >= 0.001 && relativeArea <= 0.1) {
      return 60;
    }

    return 40;
  }

  /**
   * Rule 11: Consistency with previous scans
   * Bonus if matches codes from previous scans
   */
  static _scoreConsistency(candidate, context = {}) {
    if (!context.previousCodes || !Array.isArray(context.previousCodes)) {
      return 0;
    }

    const text = candidate.text.toUpperCase();

    // Exact match bonus
    if (context.previousCodes.includes(text)) {
      return 15; // Significant bonus
    }

    // Similar pattern match (same prefix)
    const matchingPrefix = context.previousCodes.find(code => {
      const sharedPrefix = this._findCommonPrefix(text, code);
      return sharedPrefix.length >= 3;
    });

    if (matchingPrefix) {
      return 8; // Smaller bonus
    }

    return 0;
  }

  /**
   * Helper: Find common prefix of two strings
   */
  static _findCommonPrefix(a, b) {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) {
      i++;
    }
    return a.substring(0, i);
  }

  /**
   * Get scoring explanation for a candidate
   * Useful for user validation UI
   */
  static explainScore(candidate) {
    return {
      text: candidate.text,
      totalScore: candidate.totalScore,
      breakdown: {
        'Known Prefix': {
          score: candidate.scores.prefixMatch,
          weight: this.WEIGHTS.prefixMatch,
          explanation: `Starts with ${candidate.text.substring(0, 2)}`,
        },
        'Standard Length': {
          score: candidate.scores.lengthMatch,
          weight: this.WEIGHTS.lengthMatch,
          explanation: `${candidate.text.length} characters (ideal: ${this.STANDARD_LENGTH.ideal})`,
        },
        'Digit-Letter Ratio': {
          score: candidate.scores.digitLetterRatio,
          weight: this.WEIGHTS.digitLetterRatio,
          explanation: `Balance of letters and digits`,
        },
        'OCR Confidence': {
          score: candidate.scores.ocrConfidence,
          weight: this.WEIGHTS.ocrConfidence,
          explanation: `${Math.round(candidate.scores.ocrConfidence)}% OCR confidence`,
        },
        'Spatial Isolation': {
          score: candidate.scores.spatialIsolation,
          weight: this.WEIGHTS.spatialIsolation,
          explanation: `Position on label`,
        },
        'Pattern Type': {
          score: candidate.scores.pattern,
          weight: this.WEIGHTS.pattern,
          explanation: `Source: ${candidate.source}`,
        },
        'Source Quality': {
          score: candidate.scores.sourceQuality,
          weight: this.WEIGHTS.sourceQuality,
          explanation: `Extraction method quality`,
        },
        'Not a Date': {
          score: candidate.scores.noDatePattern,
          weight: this.WEIGHTS.noDatePattern,
          explanation: `Confirmed not a date pattern`,
        },
        'Not Weight': {
          score: candidate.scores.noWeightPattern,
          weight: this.WEIGHTS.noWeightPattern,
          explanation: `Confirmed not a weight/quantity`,
        },
        'Visual Prominence': {
          score: candidate.scores.visualProminence,
          weight: this.WEIGHTS.visualProminence,
          explanation: `Size and position on label`,
        },
      },
    };
  }
}

module.exports = ScoringService;
