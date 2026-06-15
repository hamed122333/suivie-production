const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { authenticate, requireRoles } = require('../middleware/auth');

// Page Analytics — réservée au super_admin (observateur stratégique).
router.get('/commercials', authenticate, requireRoles(['super_admin']), analyticsController.commercialPerformance);

// Métriques de flux Kanban — super_admin (observateur) + planner (pilote du flux).
router.get('/flow', authenticate, requireRoles(['super_admin', 'planner']), analyticsController.flowMetrics);

module.exports = router;
