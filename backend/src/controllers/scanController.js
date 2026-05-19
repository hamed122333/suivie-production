const OCRService = require('../services/ocrService');

/**
 * Contrôleur pour gérer les scans d'étiquettes.
 */
exports.scanLabel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Aucun fichier image fourni' });
    }

    const result = await OCRService.processScan(req.file.buffer);

    if (!result.success) {
      return res.status(500).json({ message: result.error });
    }

    res.json(result.data);
  } catch (error) {
    console.error('Scan Controller Error:', error);
    res.status(500).json({ message: 'Erreur lors du traitement de l\'image' });
  }
};

