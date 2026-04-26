const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { authenticate, requireRoles, requireCommercial, requirePlanner } = require('../middleware/auth');

// Réordonner le tableau : planificateur uniquement
router.patch('/board', authenticate, requirePlanner, taskController.reorderBoard);

// Exporter les tches via Excel
router.get('/export', authenticate, taskController.exportExcel);

// Lire toutes les tches (tous les utilisateurs authentifis)
router.get('/', authenticate, taskController.getAll);
router.post('/bulk', authenticate, requireCommercial, taskController.createBulk);
router.get('/:id/details', authenticate, taskController.getDetail);
router.post('/:id/comments', authenticate, taskController.addComment);
router.get('/:id', authenticate, taskController.getById);

// Créer une tâche : commercial uniquement, toujours dans TODO
router.post('/', authenticate, requireCommercial, taskController.create);

// Modifier une tâche complète : planificateur et commercial
router.put('/:id', authenticate, requireRoles(['planner', 'commercial']), taskController.update);

// Changer le statut : planificateur uniquement
router.put('/:id/status', authenticate, requirePlanner, taskController.updateStatus);

// Approuver le stock d une commande hors stock et la passer en TODO : planificateur uniquement
router.post('/:id/approve-stock', authenticate, requirePlanner, taskController.approveStock);

// Supprimer : planificateur, commercial et super_admin
router.delete('/:id', authenticate, requireRoles(['planner', 'commercial', 'super_admin']), taskController.delete);

module.exports = router;
