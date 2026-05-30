const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { excelUpload: upload } = require('../middleware/upload');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');

// Récupérer tous les utilisateurs
router.get('/', authenticate, userController.getAll);

// Créer un utilisateur : super admin uniquement
router.post('/', authenticate, requireSuperAdmin, userController.create);

// Importer une liste de commerciaux : super admin uniquement
router.post('/import-commercials', authenticate, requireSuperAdmin, upload.single('file'), userController.importCommercials);

// Supprimer un utilisateur : super admin uniquement
router.delete('/:id', authenticate, requireSuperAdmin, userController.delete);

module.exports = router;
