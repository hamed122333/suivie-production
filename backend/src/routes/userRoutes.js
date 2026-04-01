const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');

// Récupérer tous les utilisateurs
router.get('/', authenticate, userController.getAll);

// Créer un utilisateur : super admin uniquement
router.post('/', authenticate, requireSuperAdmin, userController.create);

// Supprimer un utilisateur : super admin uniquement
router.delete('/:id', authenticate, requireSuperAdmin, userController.delete);

module.exports = router;
