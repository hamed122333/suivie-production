const express = require('express');
const router = express.Router();
const multer = require('multer');
const scanController = require('../controllers/scanController');
const { requireAuth } = require('../middleware/auth');

// Configuration de multer pour stocker l'image temporairement en mémoire
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // Limite 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Format de fichier non supporté. Veuillez uploader une image.'), false);
    }
  }
});

/**
 * @route POST /api/scans/label
 * @desc Analyser une image d'étiquette de bobine
 * @access Private
 */
router.post('/label', requireAuth, upload.single('image'), scanController.scanLabel);

module.exports = router;

