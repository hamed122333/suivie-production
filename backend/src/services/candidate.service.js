/**
 * Candidate Generator Service
 *
 * Extracts ALL possible article code candidates from OCR output
 * and normalizes them for scoring. Uses multi-pass regex patterns
 * to capture various formats and layouts.
 *
 * NO templates, NO hardcoded coordinates - fully flexible approach
 */

class CandidateService {
  /**
   * Extract all possible candidates from OCR data
   * @param {Object} ocrData - Output from OCRService.extractText()
   * @param {Object} imageStats - Image metadata and statistics
   * @returns {Promise<Array>} - Array of candidate objects
   */
  static async generateCandidates(ocrData, imageStats = {}) {
    const { text, boxes, raw } = ocrData;

    const candidates = [];
    const seenCodes = new Set(); // Track unique codes to avoid duplicates

    // ========== PATTERN 1: Direct word matching ==========
    // Words that match code pattern already (CI123, CV-ABC, etc)
    if (raw.words && Array.isArray(raw.words)) {
      raw.words.forEach(word => {
        const normalized = this._normalizeCandidate(word.text);
        if (normalized && !seenCodes.has(normalized)) {
          candidates.push({
            text: normalized,
            source: 'direct_word',
            originalText: word.text,
            confidence: word.confidence,
            bbox: word.bbox,
            score: 0, // Will be calculated by scoring service
            metadata: {
              length: normalized.length,
              digitCount: (normalized.match(/\d/g) || []).length,
              letterCount: (normalized.match(/[A-Z]/g) || []).length,
            },
          });
          seenCodes.add(normalized);
        }
      });
    }

    // ========== PATTERN 2: Multi-word combinations ==========
    // Sometimes code is split: "CI" "123" "ABC" → "CI123ABC"
    const wordCombinations = this._extractWordCombinations(raw.words);
    wordCombinations.forEach(combo => {
      const normalized = this._normalizeCandidate(combo.text);
      if (normalized && !seenCodes.has(normalized)) {
        candidates.push({
          text: normalized,
          source: 'word_combination',
          originalText: combo.text,
          confidence: combo.avgConfidence,
          bbox: combo.bbox, // Composite bbox of all words
          score: 0,
          metadata: {
            wordCount: combo.wordCount,
            length: normalized.length,
            digitCount: (normalized.match(/\d/g) || []).length,
            letterCount: (normalized.match(/[A-Z]/g) || []).length,
          },
        });
        seenCodes.add(normalized);
      }
    });

    // ========== PATTERN 3: Substring extraction ==========
    // Extract substrings that look like codes (sliding window)
    const substrings = this._extractSubstrings(text);
    substrings.forEach(substring => {
      const normalized = this._normalizeCandidate(substring);
      if (normalized && !seenCodes.has(normalized)) {
        candidates.push({
          text: normalized,
          source: 'substring',
          originalText: substring,
          confidence: 50, // Lower confidence for substrings (estimated)
          bbox: null, // May not have precise bbox
          score: 0,
          metadata: {
            length: normalized.length,
            digitCount: (normalized.match(/\d/g) || []).length,
            letterCount: (normalized.match(/[A-Z]/g) || []).length,
          },
        });
        seenCodes.add(normalized);
      }
    });

    // ========== PATTERN 4: Spatial clustering ==========
    // Group nearby words that together form a code
    if (raw.words && Array.isArray(raw.words)) {
      const spatialCandidates = this._extractSpatialClusters(raw.words);
      spatialCandidates.forEach(candidate => {
        const normalized = this._normalizeCandidate(candidate.text);
        if (normalized && !seenCodes.has(normalized)) {
          candidates.push({
            text: normalized,
            source: 'spatial_cluster',
            originalText: candidate.text,
            confidence: candidate.confidence,
            bbox: candidate.bbox,
            score: 0,
            metadata: {
              clusterSize: candidate.wordCount,
              length: normalized.length,
              digitCount: (normalized.match(/\d/g) || []).length,
              letterCount: (normalized.match(/[A-Z]/g) || []).length,
            },
          });
          seenCodes.add(normalized);
        }
      });
    }

    // ========== PATTERN 5: Known prefix matching ==========
    // Codes starting with known prefixes (CI, CV, DI, DV, FC, FD, PL)
    const knownPrefixes = ['CI', 'CV', 'DI', 'DV', 'FC', 'FD', 'PL'];
    const prefixCandidates = this._extractByPrefixes(text, knownPrefixes);
    prefixCandidates.forEach(candidate => {
      const normalized = this._normalizeCandidate(candidate);
      if (normalized && !seenCodes.has(normalized)) {
        candidates.push({
          text: normalized,
          source: 'prefix_match',
          originalText: candidate,
          confidence: 70, // High confidence if matches known prefix
          bbox: null,
          score: 0,
          metadata: {
            length: normalized.length,
            digitCount: (normalized.match(/\d/g) || []).length,
            letterCount: (normalized.match(/[A-Z]/g) || []).length,
            hasKnownPrefix: true,
          },
        });
        seenCodes.add(normalized);
      }
    });

    // ========== PATTERN 6: Alternative separators ==========
    // Handle different separators: space, hyphen, dot, slash
    const altSeparatorCandidates = this._extractAlternativeSeparators(text);
    altSeparatorCandidates.forEach(candidate => {
      const normalized = this._normalizeCandidate(candidate);
      if (normalized && !seenCodes.has(normalized)) {
        candidates.push({
          text: normalized,
          source: 'alt_separator',
          originalText: candidate,
          confidence: 60,
          bbox: null,
          score: 0,
          metadata: {
            length: normalized.length,
            digitCount: (normalized.match(/\d/g) || []).length,
            letterCount: (normalized.match(/[A-Z]/g) || []).length,
          },
        });
        seenCodes.add(normalized);
      }
    });

    return candidates.filter(c => c.text && c.text.length >= 5); // Minimum code length
  }

  /**
   * Normalize candidate text to standard format
   * @param {string} text - Raw text
   * @returns {string|null} - Normalized text or null if invalid
   */
  static _normalizeCandidate(text) {
    if (!text || typeof text !== 'string') return null;

    // Remove spaces, normalize separators to hyphen
    let normalized = text
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '') // Remove spaces
      .replace(/[\.\/]/g, '-') // Normalize separators to hyphen
      .replace(/[^\w\-]/g, ''); // Remove special chars except hyphen and word chars

    // Basic validation: must have at least 2 letters and some digits/letters after
    if (!/[A-Z]{2,}/.test(normalized)) {
      return null;
    }

    return normalized;
  }

  /**
   * Extract combinations of adjacent words
   * @param {Array} words - OCR words array
   * @returns {Array} - Candidate combinations
   */
  static _extractWordCombinations(words) {
    if (!words || words.length < 2) return [];

    const combinations = [];
    const maxDistance = 50; // Max pixel distance to consider "adjacent"

    for (let i = 0; i < words.length - 1; i++) {
      for (let j = i + 1; j < Math.min(i + 4, words.length); j++) {
        const distance = Math.abs(words[j].bbox.x0 - words[i].bbox.x1);

        if (distance <= maxDistance) {
          // Check if words are on roughly same line
          const yDiff = Math.abs(words[j].bbox.y0 - words[i].bbox.y0);
          if (yDiff <= Math.max(words[i].bbox.height, words[j].bbox.height)) {
            const combined = words
              .slice(i, j + 1)
              .map(w => w.text)
              .join('');

            combinations.push({
              text: combined,
              wordCount: j - i + 1,
              avgConfidence:
                words
                  .slice(i, j + 1)
                  .reduce((sum, w) => sum + w.confidence, 0) /
                (j - i + 1),
              bbox: {
                x0: words[i].bbox.x0,
                y0: Math.min(...words.slice(i, j + 1).map(w => w.bbox.y0)),
                x1: words[j].bbox.x1,
                y1: Math.max(...words.slice(i, j + 1).map(w => w.bbox.y1)),
              },
            });
          }
        }
      }
    }

    return combinations;
  }

  /**
   * Extract substrings matching code patterns
   * @param {string} text - Full OCR text
   * @returns {Array} - Potential code substrings
   */
  static _extractSubstrings(text) {
    const candidates = [];
    const patterns = [
      /([A-Z]{2,3}[\d\-A-Z]+)/g, // Letters followed by digits/letters
      /([A-Z]{2,3}[\d]{2,}[\w\-]*)/g, // Code + numbers
      /([A-Z][A-Z][\w\d\-]{3,})/g, // Two letters + more
    ];

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        if (match[1].length >= 5) {
          candidates.push(match[1]);
        }
      }
    });

    return [...new Set(candidates)]; // Deduplicate
  }

  /**
   * Extract clusters of nearby words (spatial reasoning)
   * @param {Array} words - OCR words with bbox
   * @returns {Array} - Spatial clusters
   */
  static _extractSpatialClusters(words) {
    const clusters = [];
    const usedIndices = new Set();

    for (let i = 0; i < words.length; i++) {
      if (usedIndices.has(i)) continue;

      const cluster = [words[i]];
      usedIndices.add(i);

      // Find words nearby (same line or very close)
      for (let j = i + 1; j < words.length; j++) {
        if (usedIndices.has(j)) continue;

        const xGap = words[j].bbox.x0 - words[i].bbox.x1;
        const yDiff = Math.abs(words[j].bbox.y0 - words[i].bbox.y0);
        const maxGap = 100; // Max pixel gap
        const maxYDiff = 30;

        if (xGap <= maxGap && yDiff <= maxYDiff) {
          cluster.push(words[j]);
          usedIndices.add(j);
        }
      }

      if (cluster.length > 1) {
        clusters.push({
          text: cluster.map(w => w.text).join(''),
          wordCount: cluster.length,
          confidence: cluster.reduce((sum, w) => sum + w.confidence, 0) / cluster.length,
          bbox: {
            x0: Math.min(...cluster.map(w => w.bbox.x0)),
            y0: Math.min(...cluster.map(w => w.bbox.y0)),
            x1: Math.max(...cluster.map(w => w.bbox.x1)),
            y1: Math.max(...cluster.map(w => w.bbox.y1)),
          },
        });
      }
    }

    return clusters;
  }

  /**
   * Extract by known prefixes
   * @param {string} text - Full text
   * @param {Array} prefixes - Known prefixes
   * @returns {Array} - Matches
   */
  static _extractByPrefixes(text, prefixes) {
    const candidates = [];
    const pattern = new RegExp(`(${prefixes.join('|')})[A-Z0-9\\-]{2,}`, 'g');

    let match;
    while ((match = pattern.exec(text)) !== null) {
      candidates.push(match[1]);
    }

    return candidates;
  }

  /**
   * Handle alternative separators
   * @param {string} text - Full text
   * @returns {Array} - Candidates with alt separators
   */
  static _extractAlternativeSeparators(text) {
    const candidates = [];
    const patterns = [
      /([A-Z]{2,3}\s+[\d\-A-Z]+)/g, // Space separated
      /([A-Z]{2,3}\/[\d\-A-Z]+)/g, // Slash separated
      /([A-Z]{2,3}\.[\d\-A-Z]+)/g, // Dot separated
    ];

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        candidates.push(match[1]);
      }
    });

    return candidates;
  }

  /**
   * Filter candidates by quality criteria
   * @param {Array} candidates - Raw candidates
   * @param {Object} options - Filter options
   * @returns {Array} - Filtered candidates
   */
  static filterCandidates(candidates, options = {}) {
    const {
      minLength = 5,
      maxLength = 20,
      minConfidence = 30,
      preferredSources = null, // If specified, prioritize these sources
    } = options;

    return candidates.filter(c => {
      const passesLength = c.text.length >= minLength && c.text.length <= maxLength;
      const passesConfidence = (c.confidence || 0) >= minConfidence;
      const passesSource = !preferredSources || preferredSources.includes(c.source);

      return passesLength && passesConfidence && passesSource;
    });
  }

  /**
   * Deduplicate similar candidates
   * @param {Array} candidates - Candidates to deduplicate
   * @param {number} threshold - Similarity threshold (0-1)
   * @returns {Array} - Deduplicated candidates
   */
  static deduplicateCandidates(candidates, threshold = 0.85) {
    const unique = [];
    const seen = new Set();

    candidates.forEach(candidate => {
      const isNew = !Array.from(seen).some(existing =>
        this._similarity(candidate.text, existing) >= threshold
      );

      if (isNew) {
        unique.push(candidate);
        seen.add(candidate.text);
      }
    });

    return unique;
  }

  /**
   * Calculate similarity between two strings (Levenshtein-based)
   * @private
   */
  static _similarity(a, b) {
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;

    const distance = this._levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * Levenshtein distance calculation
   * @private
   */
  static _levenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = Array(b.length + 1)
      .fill(null)
      .map(() => Array(a.length + 1).fill(0));

    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }

    return matrix[b.length][a.length];
  }
}

module.exports = CandidateService;
