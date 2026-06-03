const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { excelUpload: upload } = require('../middleware/upload');
const { authenticate, requireSuperAdmin, requireRoles } = require('../middleware/auth');

// Récupérer tous les utilisateurs — réservé aux rôles qui en ont besoin
// (filtres/affectations). Évite la divulgation des emails de tous les comptes
// aux rôles non privilégiés (commercial/livreur/user).
router.get('/', authenticate, requireRoles(['planner', 'super_admin']), userController.getAll);

// Créer un utilisateur : super admin uniquement
router.post('/', authenticate, requireSuperAdmin, userController.create);

// Importer une liste de commerciaux : super admin uniquement
router.post('/import-commercials', authenticate, requireSuperAdmin, upload.single('file'), userController.importCommercials);

// Modifier un utilisateur : super admin uniquement
router.put('/:id', authenticate, requireSuperAdmin, userController.update);

// Supprimer un utilisateur : super admin uniquement
router.delete('/:id', authenticate, requireSuperAdmin, userController.delete);

module.exports = router;
