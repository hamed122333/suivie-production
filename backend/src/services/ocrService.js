const Tesseract = require('tesseract.js');
const ImagePreprocessor = require('./imagePreprocessor');
const NormalizationService = require('./normalizationService');
const SmartParser = require('./smartParser');

/**
 * Service Principal coordinateur de l'OCR.
 */
class OCRService {
  async processScan(imageBuffer) {
    try {
      // 1. Preprocessing
      const processedBuffer = await ImagePreprocessor.preprocess(imageBuffer);

      // 2. OCR (Tesseract)
      const { data: { text } } = await Tesseract.recognize(processedBuffer, 'fra+eng+spa', {
        logger: m => console.log(`OCR Progress: ${m.status} - ${Math.round(m.progress * 100)}%`)
      });

      // 3. Normalization
      const normalizedText = NormalizationService.normalizeText(text);
      console.log('--- Normalized OCR Output ---\n', normalizedText);

      // 4. Smart Contextual Parsing
      const extractedData = SmartParser.parse(normalizedText);

      return {
        success: true,
        data: extractedData,
        rawText: normalizedText // Pour debug si besoin
      };

    } catch (error) {
      console.error('OCR Service Full Error:', error);
      return { success: false, error: 'Échec de l\'analyse de l\'image' };
    }
  }
}

module.exports = new OCRService();

