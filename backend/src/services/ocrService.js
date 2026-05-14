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
  async processScan(imageBuffer) {
    try {
      // 1. Pré-traitement : redimensionnement, niveaux de gris, CLAHE, sharpen.
      const processedBuffer = await ImagePreprocessor.preprocess(imageBuffer);

      // 2. OCR via Tesseract.js
      //    - Langues : fra+eng (français + anglais pour étiquettes bilingues ;
      //      l'espagnol a été retiré car il génère du bruit inutile).
      //    - PSM 11 (SPARSE_TEXT) : Tesseract recherche du texte partout dans
      //      l'image sans supposer une mise en page uniforme → meilleur pour
      //      les étiquettes industrielles avec blocs de texte dispersés.
      //    - preserve_interword_spaces : conserve les espaces inter-mots pour
      //      améliorer la lisibilité des numéros de série et codes articles.
      const { data } = await Tesseract.recognize(processedBuffer, 'fra+eng', {
        logger: m => {
          if (m.status === 'recognizing text') {
            console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
          }
        },
        tessedit_pageseg_mode: '11', // PSM 11 : Sparse text
        preserve_interword_spaces: '1',
      });

      // 3. Normalisation : correction des erreurs OCR courantes (O/0, I/1, etc.).
      const normalizedText = NormalizationService.normalizeText(data.text);
      console.log('--- Normalized OCR Output ---\n', normalizedText);

      // 4. Convertir le format bbox Tesseract {x0,y0,x1,y1} en format SmartParser
      //    {left, top, right, bottom, width, height} pour que les heuristiques
      //    de positionnement puissent être appliquées correctement.
      const words = (data.words || []).map(w => ({
        text: w.text,
        // Tesseract retourne confidence entre 0-100 ; normaliser en 0-1.
        // Les mots non reconnus peuvent avoir confidence=undefined → défaut 0
        // (signifie que la confiance est inconnue, non que la valeur est fausse).
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

      // 5. Analyse contextuelle intelligente.
      //    IMPORTANT : SmartParser.parse() attend un objet {rawText, normalizedText,
      //    words}. Passer une chaîne brute renvoie des résultats vides car les
      //    propriétés .rawText / .normalizedText / .words seraient indéfinies.
      const extractedData = SmartParser.parse({
        rawText: data.text,
        normalizedText,
        words,
      });

      return {
        success: true,
        data: extractedData,
        rawText: normalizedText, // Pour debug si besoin
      };

    } catch (error) {
      console.error('OCR Service Full Error:', error);
      return { success: false, error: 'Échec de l\'analyse de l\'image' };
    }
  }
}

module.exports = new OCRService();

