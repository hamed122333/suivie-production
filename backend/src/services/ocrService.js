const Tesseract = require('tesseract.js');
const ImagePreprocessor = require('./imagePreprocessor');
const NormalizationService = require('./normalizationService');
const SmartParser = require('./smartParser');

/**
 * Service principal coordinateur de l'OCR.
 *
 * Pipeline :
 *   1. Pré-traitement de l'image (imagePreprocessor) pour améliorer le contraste.
 *   2. Reconnaissance via Tesseract.js en mode PSM 11 (sparse text) adapté aux
 *      étiquettes industrielles dont le texte n'est pas dans un bloc uniforme.
 *   3. Normalisation du texte brut (correction du bruit OCR courant).
 *   4. Extraction structurée via SmartParser avec les données complètes :
 *      texte brut, texte normalisé ET coordonnées de chaque mot (bbox).
 */
class OCRService {
  _mapWords(words = []) {
    return (words || []).map(w => ({
      text: w.text,
      // Tesseract retourne confidence entre 0-100 ; normaliser en 0-1.
      confidence: typeof w.confidence === 'number' ? w.confidence / 100 : 0,
      bbox: w.bbox ? {
        left: w.bbox.x0,
        top: w.bbox.y0,
        right: w.bbox.x1,
        bottom: w.bbox.y1,
        width: (w.bbox.x1 || 0) - (w.bbox.x0 || 0),
        height: (w.bbox.y1 || 0) - (w.bbox.y0 || 0),
      } : null,
    }));
  }

  _mergeTexts(texts = []) {
    const lines = [];
    const seen = new Set();
    for (const t of texts) {
      const split = String(t || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      for (const line of split) {
        const key = line.toUpperCase();
        if (seen.has(key)) continue;
        seen.add(key);
        lines.push(line);
      }
    }
    return lines.join('\n');
  }

  _countDetectedFields(parsed = {}) {
    const fields = ['supplier', 'reel_serial_number', 'weight_kg', 'width_mm', 'grammage'];
    return fields.reduce((acc, f) => {
      const v = parsed?.[f]?.value;
      return acc + (v ? 1 : 0);
    }, 0);
  }

  async _recognizePass(imageBuffer, psm, passName) {
    const { data } = await Tesseract.recognize(imageBuffer, 'fra+eng', {
      logger: m => {
        if (m.status === 'recognizing text') {
          console.log(`OCR ${passName} Progress: ${Math.round(m.progress * 100)}%`);
        }
      },
      tessedit_pageseg_mode: String(psm),
      preserve_interword_spaces: '1',
    });

    return {
      passName,
      psm,
      text: data.text || '',
      words: this._mapWords(data.words || []),
    };
  }

  async processScan(imageBuffer) {
    try {
      // 1. Pré-traitement : redimensionnement, niveaux de gris, CLAHE, sharpen.
      const processedBuffer = await ImagePreprocessor.preprocess(imageBuffer);

      // 2. OCR multi-pass :
      //    - processed + PSM 6 : texte en bloc homogène
      //    - processed + PSM 11 : texte épars
      //    - original + PSM 6 : fallback si le preprocess dégrade certains glyphes
      const passes = await Promise.all([
        this._recognizePass(processedBuffer, 6, 'processed-psm6'),
        this._recognizePass(processedBuffer, 11, 'processed-psm11'),
        this._recognizePass(imageBuffer, 6, 'original-psm6'),
      ]);

      const mergedRawText = this._mergeTexts(passes.map((p) => p.text));
      const mergedWords = passes.flatMap((p) => p.words || []);
      const mergedNormalizedText = NormalizationService.normalizeText(mergedRawText);
      console.log('--- Normalized OCR Output (Merged) ---\n', mergedNormalizedText);

      // 3. Parsing principal sur texte fusionné.
      let extractedData = SmartParser.parse({
        rawText: mergedRawText,
        normalizedText: mergedNormalizedText,
        words: mergedWords,
      });

      // 4. Si trop peu de champs trouvés, tester aussi chaque passe et garder le meilleur.
      const mergedScore = this._countDetectedFields(extractedData);
      if (mergedScore < 3) {
        const perPass = passes.map((p) => {
          const normalized = NormalizationService.normalizeText(p.text);
          const parsed = SmartParser.parse({
            rawText: p.text,
            normalizedText: normalized,
            words: p.words,
          });
          return { passName: p.passName, parsed, score: this._countDetectedFields(parsed), normalized };
        }).sort((a, b) => b.score - a.score);

        const bestPass = perPass[0];
        if (bestPass && bestPass.score > mergedScore) {
          extractedData = bestPass.parsed;
        }
      }

      return {
        success: true,
        data: extractedData,
        rawText: mergedNormalizedText, // Pour debug si besoin
      };

    } catch (error) {
      console.error('OCR Service Full Error:', error);
      return { success: false, error: 'Échec de l\'analyse de l\'image' };
    }
  }
}

module.exports = new OCRService();
