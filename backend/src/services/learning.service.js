/**
 * Learning Service
 *
 * Builds learning dataset from user corrections without ML fine-tuning:
 * - Stores correction patterns and feedback
 * - Tracks which heuristics work well for which suppliers
 * - Identifies new patterns from corrections
 * - Exports learning data for analysis
 * - Improves heuristic weights over time (A/B testing)
 *
 * NO machine learning, NO fine-tuning - pure data collection and analysis
 */

class LearningService {
  /**
   * Record a user correction/validation
   * @param {Object} correction - Correction data
   * @returns {Object} - Recorded correction with metadata
   */
  static recordCorrection(correction) {
    const {
      originalText, // What system predicted
      correctedText, // What user provided
      imageId, // Reference to original image
      supplier, // Which supplier's label
      labelType, // Type of label (thermal, printed, etc)
      confidence, // System's original confidence
      score, // System's score
      allCandidates, // All candidates that were suggested
      userReason, // Optional: why user corrected it
    } = correction;

    const timestamp = new Date().toISOString();
    const wasCorrect = originalText === correctedText;

    const recorded = {
      id: `correction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp,
      imageId,
      supplier,
      labelType,
      wasCorrect,
      original: {
        text: originalText,
        confidence,
        score,
      },
      corrected: {
        text: correctedText,
      },
      allCandidates,
      feedback: {
        reason: userReason,
        type: wasCorrect ? 'confirmation' : 'correction',
      },
    };

    return recorded;
  }

  /**
   * Analyze patterns from corrections
   * @param {Array} corrections - Array of recorded corrections
   * @returns {Object} - Pattern analysis
   */
  static analyzePatterns(corrections) {
    const analysis = {
      totalCorrections: corrections.length,
      correctCount: corrections.filter(c => c.wasCorrect).length,
      corrections: corrections.filter(c => !c.wasCorrect).length,
      accuracy: 0,
      bySupplier: {},
      byLabelType: {},
      commonErrors: [],
      patterns: [],
    };

    if (analysis.totalCorrections > 0) {
      analysis.accuracy =
        (analysis.correctCount / analysis.totalCorrections) * 100;
    }

    // Group by supplier
    corrections.forEach(correction => {
      const supplier = correction.supplier || 'unknown';

      if (!analysis.bySupplier[supplier]) {
        analysis.bySupplier[supplier] = {
          total: 0,
          correct: 0,
          accuracy: 0,
        };
      }

      analysis.bySupplier[supplier].total++;
      if (correction.wasCorrect) {
        analysis.bySupplier[supplier].correct++;
      }
    });

    // Calculate accuracy by supplier
    Object.keys(analysis.bySupplier).forEach(supplier => {
      const stats = analysis.bySupplier[supplier];
      stats.accuracy = (stats.correct / stats.total) * 100;
    });

    // Group by label type
    corrections.forEach(correction => {
      const labelType = correction.labelType || 'unknown';

      if (!analysis.byLabelType[labelType]) {
        analysis.byLabelType[labelType] = {
          total: 0,
          correct: 0,
          accuracy: 0,
        };
      }

      analysis.byLabelType[labelType].total++;
      if (correction.wasCorrect) {
        analysis.byLabelType[labelType].correct++;
      }
    });

    // Calculate accuracy by label type
    Object.keys(analysis.byLabelType).forEach(type => {
      const stats = analysis.byLabelType[type];
      stats.accuracy = (stats.correct / stats.total) * 100;
    });

    // Find common errors (supplier-specific patterns)
    const errorMap = {};
    corrections
      .filter(c => !c.wasCorrect)
      .forEach(correction => {
        const key = `${correction.supplier}_${correction.original.text}→${correction.corrected.text}`;
        errorMap[key] = (errorMap[key] || 0) + 1;
      });

    analysis.commonErrors = Object.entries(errorMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([pattern, count]) => ({ pattern, count }));

    return analysis;
  }

  /**
   * Extract new patterns from corrections
   * @param {Array} corrections - Correction history
   * @returns {Array} - Identified patterns
   */
  static extractNewPatterns(corrections) {
    const patterns = [];
    const prefixes = {};
    const suffixes = {};
    const lengths = {};
    const separators = {};

    corrections.forEach(correction => {
      const text = correction.corrected.text;

      // Prefix analysis
      const prefix = text.substring(0, 2);
      prefixes[prefix] = (prefixes[prefix] || 0) + 1;

      // Suffix analysis
      const suffix = text.substring(Math.max(0, text.length - 2));
      suffixes[suffix] = (suffixes[suffix] || 0) + 1;

      // Length distribution
      const len = text.length;
      lengths[len] = (lengths[len] || 0) + 1;

      // Separator analysis
      const hasSeparator = /[-\.]/.test(text);
      const sepType = text.includes('-') ? 'hyphen' : text.includes('.') ? 'dot' : 'none';
      separators[sepType] = (separators[sepType] || 0) + 1;
    });

    // Find common prefixes
    const topPrefixes = Object.entries(prefixes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    patterns.push({
      type: 'prefixes',
      common: topPrefixes.map(([prefix, count]) => ({
        prefix,
        frequency: count,
        percentage: (count / corrections.length) * 100,
      })),
    });

    // Find common suffixes
    const topSuffixes = Object.entries(suffixes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    patterns.push({
      type: 'suffixes',
      common: topSuffixes.map(([suffix, count]) => ({
        suffix,
        frequency: count,
        percentage: (count / corrections.length) * 100,
      })),
    });

    // Length distribution
    const avgLen =
      Object.entries(lengths).reduce((sum, [len, count]) => sum + len * count, 0) /
      corrections.length;
    const minLen = Math.min(...Object.keys(lengths).map(Number));
    const maxLen = Math.max(...Object.keys(lengths).map(Number));

    patterns.push({
      type: 'length',
      min: minLen,
      max: maxLen,
      average: Math.round(avgLen),
      distribution: lengths,
    });

    // Separator patterns
    patterns.push({
      type: 'separators',
      common: Object.entries(separators).map(([type, count]) => ({
        type,
        frequency: count,
        percentage: (count / corrections.length) * 100,
      })),
    });

    return patterns;
  }

  /**
   * Get supplier-specific insights
   * @param {Array} corrections - Correction history
   * @param {string} supplier - Supplier name
   * @returns {Object} - Supplier insights
   */
  static getSupplierInsights(corrections, supplier) {
    const supplierCorrections = corrections.filter(
      c => c.supplier === supplier
    );

    if (supplierCorrections.length === 0) {
      return { supplier, recordsCount: 0, insights: [] };
    }

    const insights = [];
    const accuracy =
      (supplierCorrections.filter(c => c.wasCorrect).length /
        supplierCorrections.length) *
      100;

    insights.push({
      metric: 'Overall Accuracy',
      value: Math.round(accuracy),
      unit: '%',
    });

    // Most common corrections for this supplier
    const errorPatterns = {};
    supplierCorrections
      .filter(c => !c.wasCorrect)
      .forEach(correction => {
        const pattern = `${correction.original.text} → ${correction.corrected.text}`;
        errorPatterns[pattern] = (errorPatterns[pattern] || 0) + 1;
      });

    if (Object.keys(errorPatterns).length > 0) {
      insights.push({
        metric: 'Common Misdetections',
        value: Object.entries(errorPatterns)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([pattern, count]) => `${pattern} (${count}x)`),
      });
    }

    // Label types used by this supplier
    const labelTypes = {};
    supplierCorrections.forEach(correction => {
      const type = correction.labelType || 'unknown';
      labelTypes[type] = (labelTypes[type] || 0) + 1;
    });

    insights.push({
      metric: 'Label Types Used',
      value: Object.entries(labelTypes).map(([type, count]) => `${type} (${count})`),
    });

    return {
      supplier,
      recordsCount: supplierCorrections.length,
      accuracy: Math.round(accuracy),
      insights,
    };
  }

  /**
   * Generate recommendation for heuristic weights adjustment
   * @param {Array} corrections - Correction history
   * @returns {Object} - Weight adjustment recommendations
   */
  static generateWeightRecommendations(corrections) {
    if (corrections.length < 10) {
      return {
        recommendation: 'Need more data',
        minimumRequired: 10,
        currentCount: corrections.length,
      };
    }

    const recommendations = [];
    const correctCandidates = [];
    const incorrectCandidates = [];

    corrections.forEach(correction => {
      if (correction.allCandidates && Array.isArray(correction.allCandidates)) {
        if (correction.wasCorrect) {
          correctCandidates.push(...correction.allCandidates);
        } else {
          incorrectCandidates.push(...correction.allCandidates);
        }
      }
    });

    // Analyze which sources appear more in correct vs incorrect
    const correctSources = {};
    const incorrectSources = {};

    correctCandidates.forEach(c => {
      correctSources[c.source] = (correctSources[c.source] || 0) + 1;
    });

    incorrectCandidates.forEach(c => {
      incorrectSources[c.source] = (incorrectSources[c.source] || 0) + 1;
    });

    // If 'direct_word' appears more in correct predictions, boost its weight
    Object.keys(correctSources).forEach(source => {
      const correctRatio = correctSources[source] / (correctCandidates.length || 1);
      const incorrectRatio =
        (incorrectSources[source] || 0) / (incorrectCandidates.length || 1);

      if (correctRatio > incorrectRatio * 1.5) {
        recommendations.push({
          metric: source,
          action: 'INCREASE_WEIGHT',
          reason: `Appears more frequently in correct predictions`,
          currentFrequency: {
            correct: correctRatio,
            incorrect: incorrectRatio,
          },
        });
      } else if (incorrectRatio > correctRatio * 1.5) {
        recommendations.push({
          metric: source,
          action: 'DECREASE_WEIGHT',
          reason: `Appears more frequently in incorrect predictions`,
          currentFrequency: {
            correct: correctRatio,
            incorrect: incorrectRatio,
          },
        });
      }
    });

    return {
      timestamp: new Date().toISOString(),
      dataPoints: corrections.length,
      recommendations,
      confidenceLevel: Math.min(
        100,
        (corrections.length / 100) * 100
      ),
    };
  }

  /**
   * Export learning dataset for analysis/backup
   * @param {Array} corrections - Correction history
   * @returns {Object} - Exportable dataset
   */
  static exportDataset(corrections) {
    return {
      metadata: {
        exportDate: new Date().toISOString(),
        recordCount: corrections.length,
        timeRange: corrections.length > 0 ? {
          from: corrections[0].timestamp,
          to: corrections[corrections.length - 1].timestamp,
        } : null,
      },
      corrections,
      analysis: this.analyzePatterns(corrections),
      patterns: this.extractNewPatterns(corrections),
    };
  }
}

module.exports = LearningService;
