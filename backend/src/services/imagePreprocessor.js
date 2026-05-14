const sharp = require('sharp');

/**
 * Service pour préparer l'image avant l'OCR afin d'augmenter la précision.
 */
class ImagePreprocessor {
  async preprocess(imageBuffer) {
    try {
      return await sharp(imageBuffer)
        .resize(1600, null, { withoutEnlargement: true }) // Redimensionner pour une meilleure détection OCR
        .grayscale()
        .normalize()
        .sharpen({ sigma: 1.5 }) // Accentuation plus forte
        .threshold(160) // Seuil de binarisation ajusté
        .toBuffer();
    } catch (error) {
      console.error('Image Preprocessing Error:', error);
      return imageBuffer; // Retourner l'original en cas d'échec
    }
  }
}

module.exports = new ImagePreprocessor();
