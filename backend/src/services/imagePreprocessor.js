const sharp = require('sharp');

/**
 * Service pour préparer l'image avant l'OCR afin d'augmenter la précision.
 */
class ImagePreprocessor {
  async preprocess(imageBuffer) {
    try {
      return await sharp(imageBuffer)
        .grayscale() // Convertir en noir et blanc
        .normalize() // Améliorer le contraste
        .sharpen()   // Accentuer les contours
        .threshold(150) // Binarisation (optionnel, dépend de la qualité de l'image)
        .toBuffer();
    } catch (error) {
      console.error('Image Preprocessing Error:', error);
      return imageBuffer; // Retourner l'original en cas d'échec
    }
  }
}

module.exports = new ImagePreprocessor();

