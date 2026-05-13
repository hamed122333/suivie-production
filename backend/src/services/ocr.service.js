/**
 * OCR Service using Tesseract.js
 *
 * Extracts text from preprocessed images with:
 * - Confidence scores for each detected text
 * - Bounding box coordinates for spatial analysis
 * - Support for French + multi-language detection
 * - Raw OCR data for analysis
 *
 * Dependencies: Tesseract.js (Wasm-based, no native compilation needed)
 */

const Tesseract = require('tesseract.js');
const fs = require('fs').promises;
const path = require('path');

class OCRService {
  static initialized = false;
  static worker = null;

  /**
   * Initialize Tesseract worker (call once at startup)
   */
  static async initialize() {
    if (this.initialized) return;

    try {
      this.worker = await Tesseract.createWorker({
        langPath: 'https://tessdata.projectnaptha.com/4.0_best_lstm',
        cachePath: path.join(process.cwd(), '.tesseract_cache'),
      });

      // Load French language model
      await this.worker.loadLanguage('fra');
      await this.worker.initialize('fra');
      await this.worker.setParameters(Tesseract.OEM.LSTM_ONLY, Tesseract.PSM.AUTO);

      this.initialized = true;
      console.log('✅ Tesseract OCR initialized with French language');
    } catch (error) {
      throw new Error(`Tesseract initialization failed: ${error.message}`);
    }
  }

  /**
   * Extract text with bounding boxes from image
   * @param {Buffer} imageBuffer - Preprocessed image buffer
   * @param {Object} options - OCR options
   * @returns {Promise<{text: string, confidence: number, boxes: Array, raw: Object}>}
   */
  static async extractText(imageBuffer, options = {}) {
    const {
      language = 'fra+eng', // French + English for article codes
      psm = Tesseract.PSM.AUTO, // Page segmentation mode
      returnCanvas = false,
    } = options;

    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Recognize text from buffer
      const {
        data: { text, confidence, lines, words, hocr },
      } = await this.worker.recognize(imageBuffer, {
        langs: language.split('+'),
      });

      // Parse words with bounding boxes
      const boxes = this._parseWordsWithBoxes(words);

      return {
        text: text.trim(),
        confidence, // Overall page confidence (0-100)
        boxes,
        raw: {
          words,
          lines,
          hocr, // HTML OCR for detailed positioning
          recognized: new Date().toISOString(),
        },
      };
    } catch (error) {
      throw new Error(`OCR extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract with detailed confidence per word
   * @param {Buffer} imageBuffer - Preprocessed image buffer
   * @returns {Promise<Array>} - Array of {text, confidence, bbox}
   */
  static async extractWordsWithConfidence(imageBuffer) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const { data } = await this.worker.recognize(imageBuffer);

      return data.words.map(word => ({
        text: word.text,
        confidence: word.confidence,
        bbox: {
          x0: word.bbox.x0,
          y0: word.bbox.y0,
          x1: word.bbox.x1,
          y1: word.bbox.y1,
          width: word.bbox.x1 - word.bbox.x0,
          height: word.bbox.y1 - word.bbox.y0,
        },
        // Detect if word is likely part of article code based on characteristics
        isCodeLike: this._isCodeLike(word.text),
      }));
    } catch (error) {
      throw new Error(`Word extraction failed: ${error.message}`);
    }
  }

  /**
   * Detect text regions (lines and blocks)
   * @param {Buffer} imageBuffer - Preprocessed image buffer
   * @returns {Promise<Object>} - Grouped text by region
   */
  static async detectRegions(imageBuffer) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const { data } = await this.worker.recognize(imageBuffer);

      // Group words by line
      const lineMap = {};
      data.words.forEach(word => {
        const lineId = Math.round(word.bbox.y0 / word.bbox.height);
        if (!lineMap[lineId]) {
          lineMap[lineId] = [];
        }
        lineMap[lineId].push(word);
      });

      // Convert to sorted regions
      const regions = Object.entries(lineMap)
        .sort(([a], [b]) => a - b)
        .map(([lineId, words]) => ({
          lineId: parseInt(lineId),
          text: words.map(w => w.text).join(' '),
          words: words.map(w => ({
            text: w.text,
            confidence: w.confidence,
            bbox: w.bbox,
          })),
          bbox: {
            x0: Math.min(...words.map(w => w.bbox.x0)),
            y0: Math.min(...words.map(w => w.bbox.y0)),
            x1: Math.max(...words.map(w => w.bbox.x1)),
            y1: Math.max(...words.map(w => w.bbox.y1)),
          },
        }));

      return {
        regions,
        totalLines: regions.length,
      };
    } catch (error) {
      throw new Error(`Region detection failed: ${error.message}`);
    }
  }

  /**
   * Multi-language detection and extraction
   * @param {Buffer} imageBuffer - Image buffer
   * @returns {Promise<Object>} - Text and detected languages
   */
  static async detectAndExtract(imageBuffer) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Try multiple language combinations
      const languages = ['fra+eng', 'eng', 'fra'];
      const results = {};

      for (const lang of languages) {
        const { data } = await this.worker.recognize(imageBuffer, {
          langs: lang.split('+'),
        });

        results[lang] = {
          text: data.text.trim(),
          confidence: data.confidence,
          wordCount: data.words.length,
        };
      }

      // Return best result
      const best = Object.entries(results).sort(
        ([, a], [, b]) => b.confidence - a.confidence
      )[0];

      return {
        text: best[1].text,
        confidence: best[1].confidence,
        detectedLanguages: best[0],
        allAttempts: results,
      };
    } catch (error) {
      throw new Error(`Multi-language extraction failed: ${error.message}`);
    }
  }

  /**
   * Recognize specific text patterns (dates, numbers, codes)
   * @param {Buffer} imageBuffer - Image buffer
   * @returns {Promise<Object>} - Patterns found
   */
  static async recognizePatterns(imageBuffer) {
    const { boxes: words } = await this.extractWordsWithConfidence(imageBuffer);

    const patterns = {
      dates: [],
      numbers: [],
      codes: [],
      weights: [],
    };

    const dateRegex = /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/;
    const numberRegex = /^[\d\,\.]+$/;
    const codeRegex = /^[A-Z]{2,3}[\d\-]+$/; // Article codes
    const weightRegex = /^[\d\.]+\s*(kg|g|ml|l)$/i;

    words.forEach(word => {
      if (dateRegex.test(word.text)) {
        patterns.dates.push(word);
      } else if (codeRegex.test(word.text)) {
        patterns.codes.push(word);
      } else if (numberRegex.test(word.text)) {
        patterns.numbers.push(word);
      } else if (weightRegex.test(word.text)) {
        patterns.weights.push(word);
      }
    });

    return patterns;
  }

  /**
   * Cleanup resources (call at shutdown)
   */
  static async shutdown() {
    if (this.worker) {
      await this.worker.terminate();
      this.initialized = false;
      console.log('✅ Tesseract worker terminated');
    }
  }

  /**
   * Private: Parse words with bounding boxes
   */
  static _parseWordsWithBoxes(words) {
    return words.map(word => ({
      text: word.text,
      confidence: word.confidence,
      bbox: {
        x0: word.bbox.x0,
        y0: word.bbox.y0,
        x1: word.bbox.x1,
        y1: word.bbox.y1,
        width: word.bbox.x1 - word.bbox.x0,
        height: word.bbox.y1 - word.bbox.y0,
        center: {
          x: (word.bbox.x0 + word.bbox.x1) / 2,
          y: (word.bbox.y0 + word.bbox.y1) / 2,
        },
      },
    }));
  }

  /**
   * Private: Check if word looks like code
   */
  static _isCodeLike(text) {
    // Codes often have: 2-3 letters followed by numbers, hyphens, or letters
    return /^[A-Z]{2,3}[\d\-A-Z]+$/.test(text) && text.length >= 5;
  }
}

module.exports = OCRService;
