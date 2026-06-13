const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { excelUpload: upload } = require('../middleware/upload');
const { authenticate, requireRoles, requireSuperAdmin, requireCommercial, requirePlanner, requireLivreur } = require('../middleware/auth');


// ── Commercial review workflow ──────────────────────────────────────────────
// Lecture des commandes en attente : commercial (les siennes), planner & super_admin
// (spectateurs), importateur (correction des anomalies).
router.get('/pending-approval', authenticate, requireRoles(['commercial', 'planner', 'super_admin', 'importer']), taskController.getPendingApproval);
// Approuver : le commercial valide ses commandes (déclenche le FIFO).
router.post('/approve', authenticate, requireRoles(['commercial']), taskController.approveOrders);
// Rejeter (supprimer) des commandes en attente : commercial + importateur (nettoyage import).
router.post('/reject', authenticate, requireRoles(['commercial', 'importer']), taskController.rejectOrders);

// Exporter les tches via Excel
router.get('/export', authenticate, taskController.exportExcel);

// Lire toutes les tches (tous les utilisateurs authentifis)
router.get('/', authenticate, taskController.getAll);
router.post('/bulk', authenticate, requireCommercial, taskController.createBulk);
router.post('/import-orders', authenticate, requireRoles(['importer']), upload.single('file'), taskController.importOrders);
router.get('/:id/details', authenticate, taskController.getDetail);
router.post('/:id/comments', authenticate, taskController.addComment);
router.get('/:id', authenticate, taskController.getById);

// Créer une tâche : commercial uniquement, toujours dans TODO
router.post('/', authenticate, requireCommercial, taskController.create);

// Modifier une tâche : planificateur, commercial, importateur (correction d'anomalies)
router.put('/:id', authenticate, requireRoles(['planner', 'commercial', 'importer']), taskController.update);
router.put('/:id/date-negotiation', authenticate, requireRoles(['planner', 'commercial']), taskController.applyDateNegotiation);
// Préparation partielle : REQUEST (planificateur) / APPROVE / REJECT (commercial responsable)
router.put('/:id/partial-preparation', authenticate, requireRoles(['planner', 'commercial']), taskController.applyPartialPreparation);

// Confirmer une tâche prédictive : commercial et planner
router.put('/:id/confirm-predictive', authenticate, requireRoles(['planner', 'commercial']), taskController.confirmPredictive);

// Convertir type de tâche (PREDICTIVE <-> STANDARD) : planificateur uniquement
router.post('/:id/convert-type', authenticate, requirePlanner, taskController.convertTaskType);

// Changer le statut : planificateur uniquement
router.put('/:id/status', authenticate, requirePlanner, taskController.updateStatus);

// Marquer comme livré : livreur uniquement
router.post('/:id/mark-delivered', authenticate, requireLivreur, taskController.markDelivered);

// Supprimer : planificateur et commercial
router.delete('/:id', authenticate, requireRoles(['planner', 'commercial']), taskController.delete);

module.exports = router;
