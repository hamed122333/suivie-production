const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { authenticate, requireSuperAdmin, requireSuperAdminOrPlanner, requireCommercial } = require('../middleware/auth');

// Réordonner le tableau (super_admin ou planner)
router.patch('/board', authenticate, requireSuperAdminOrPlanner, taskController.reorderBoard);

// Lire toutes les tâches (tous les utilisateurs authentifiés)
router.get('/', authenticate, taskController.getAll);
router.get('/:id', authenticate, taskController.getById);

// Créer une tâche : commercial ET super_admin
router.post('/', authenticate, requireCommercial, taskController.create);

// Modifier une tâche complète : super_admin seulement
router.put('/:id', authenticate, requireSuperAdmin, taskController.update);

// Changer le statut : super_admin ET planner
router.put('/:id/status', authenticate, requireSuperAdminOrPlanner, taskController.updateStatus);

// Supprimer : super_admin seulement
router.delete('/:id', authenticate, requireSuperAdmin, taskController.delete);

module.exports = router;
