const sharp = require('sharp');

/**
 * Service de pré-traitement d'image pour maximiser la précision de l'OCR.
 *
 * Problème constaté avec l'ancienne implémentation :
 *   - .threshold(160) appliquait une binarisation globale fixe qui détruisait
 *     l'information sur des photos réelles (éclairage non uniforme, ombres,
 *     images WhatsApp / smartphone) en convertissant prématurément l'image
 *     en noir pur / blanc pur avant que l'OCR ne l'analyse.
 *   - withoutEnlargement: true empêchait l'agrandissement des petites images,
 *     réduisant la quantité de texte lisible par Tesseract.
 *
 * Nouvelle stratégie :
 *   1. Redimensionner à 2500 px de large (agrandissement et réduction autorisés)
 *      → Tesseract fonctionne idéalement autour de 300 DPI ; 2500 px couvre
 *        la plupart des étiquettes industrielles photographiées en gros plan.
 *   2. Conversion en niveaux de gris.
 *   3. CLAHE (Contrast Limited Adaptive Histogram Equalization) :
 *      égalisation adaptative du contraste par tuiles → gère les zones sombres
 *      ou claires locales causées par un éclairage inégal.
 *   4. Légère accentuation (sharpen) pour renforcer les contours du texte.
 *   5. PAS de .threshold() global : Tesseract intègre sa propre binarisation
 *      adaptative (Otsu / Leptonica) bien plus efficace sur des niveaux de gris.
 */
class ImagePreprocessor {
  async preprocess(imageBuffer) {
    try {
      return await sharp(imageBuffer)
        // Redimensionner à 2500 px de large ; agrandit les petites images
        // et réduit les grandes (photos haute résolution de smartphone).
        .resize({ width: 2500, withoutEnlargement: false })
        // Conversion en niveaux de gris : réduit le bruit de couleur.
        .grayscale()
        // Égalisation adaptative du contraste (CLAHE) :
        // améliore le contraste localement pour gérer les ombres et
        // l'éclairage non uniforme des photos prises en conditions réelles.
        // Paramètres : grille 4×4 tuiles (compromise entre précision locale et
        // stabilité globale pour une étiquette industrielle standard 10-30 cm),
        // maxSlope:3 limite l'amplification du bruit de fond.
        .clahe({ width: 4, height: 4, maxSlope: 3 })
        // Accentuation légère pour renforcer les bords du texte.
        .sharpen({ sigma: 1.0 })
        // NOTE : .threshold() supprimé intentionnellement — une binarisation
        // globale fixe détruit le contenu sur des images à contraste variable.
        // Tesseract.js gère sa propre binarisation interne (adaptative Otsu).
        .toBuffer();
    } catch (error) {
      console.error('Image Preprocessing Error:', error);
      // Fallback : niveaux de gris + normalisation sans CLAHE en cas d'erreur.
      try {
        return await sharp(imageBuffer)
          .resize({ width: 2500, withoutEnlargement: false })
          .grayscale()
          .normalize()
          .toBuffer();
      } catch (fallbackError) {
        console.error('Image Preprocessing Fallback Error:', fallbackError);
        return imageBuffer; // Retourner l'original en dernier recours.
      }
    }
  }
}

module.exports = new ImagePreprocessor();
