const express = require('express');
const router = express.Router();
const multer = require('multer');
const userController = require('../controllers/userController');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Récupérer tous les utilisateurs
router.get('/', authenticate, userController.getAll);

// Créer un utilisateur : super admin uniquement
router.post('/', authenticate, requireSuperAdmin, userController.create);

// Importer une liste de commerciaux : super admin uniquement
router.post('/import-commercials', authenticate, requireSuperAdmin, upload.single('file'), userController.importCommercials);

// Supprimer un utilisateur : super admin uniquement
router.delete('/:id', authenticate, requireSuperAdmin, userController.delete);

module.exports = router;
