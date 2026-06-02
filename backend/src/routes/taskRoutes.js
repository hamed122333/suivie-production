const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { excelUpload: upload } = require('../middleware/upload');
const { authenticate, requireRoles, requireSuperAdmin, requireCommercial, requirePlanner, requireLivreur } = require('../middleware/auth');


// ── Commercial review workflow ──────────────────────────────────────────────
// List tasks waiting for commercial approval
router.get('/pending-approval', authenticate, requireRoles(['commercial', 'planner', 'super_admin']), taskController.getPendingApproval);
// Approve selected tasks (commercial/super_admin → triggers FIFO → TODO or WAITING_STOCK)
// planner is a read-only spectator here
router.post('/approve', authenticate, requireRoles(['commercial', 'super_admin']), taskController.approveOrders);
// Reject (delete) selected pending tasks
router.post('/reject', authenticate, requireRoles(['commercial', 'super_admin']), taskController.rejectOrders);

// Exporter les tches via Excel
router.get('/export', authenticate, taskController.exportExcel);

// Lire toutes les tches (tous les utilisateurs authentifis)
router.get('/', authenticate, taskController.getAll);
router.post('/bulk', authenticate, requireCommercial, taskController.createBulk);
router.post('/import-orders', authenticate, requireSuperAdmin, upload.single('file'), taskController.importOrders);
router.get('/:id/details', authenticate, taskController.getDetail);
router.post('/:id/comments', authenticate, taskController.addComment);
router.get('/:id', authenticate, taskController.getById);

// Créer une tâche : commercial uniquement, toujours dans TODO
router.post('/', authenticate, requireCommercial, taskController.create);

// Modifier une tâche complète : planificateur et commercial
router.put('/:id', authenticate, requireRoles(['planner', 'commercial', 'super_admin']), taskController.update);
router.put('/:id/date-negotiation', authenticate, requireRoles(['planner', 'commercial']), taskController.applyDateNegotiation);

// Confirmer une tâche prédictive : commercial et planner
router.put('/:id/confirm-predictive', authenticate, requireRoles(['planner', 'commercial']), taskController.confirmPredictive);

// Convertir type de tâche (PREDICTIVE <-> STANDARD) : planificateur uniquement
router.post('/:id/convert-type', authenticate, requirePlanner, taskController.convertTaskType);

// Changer le statut : planificateur uniquement
router.put('/:id/status', authenticate, requirePlanner, taskController.updateStatus);

// Marquer comme livré : livreur (et super_admin via hasRole logic)
router.post('/:id/mark-delivered', authenticate, requireLivreur, taskController.markDelivered);

// Supprimer : planificateur, commercial et super_admin
router.delete('/:id', authenticate, requireRoles(['planner', 'commercial', 'super_admin']), taskController.delete);

module.exports = router;
