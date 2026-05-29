const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticate, requireRoles } = require('../middleware/auth');

router.get(
  '/',
  authenticate,
  requireRoles(['planner', 'super_admin', 'commercial', 'livreur']),
  notificationController.list
);
router.patch(
  '/:id/read',
  authenticate,
  requireRoles(['planner', 'super_admin', 'commercial', 'livreur']),
  notificationController.markAsRead
);
router.patch(
  '/read-all',
  authenticate,
  requireRoles(['planner', 'super_admin', 'commercial', 'livreur']),
  notificationController.markAllAsRead
);

module.exports = router;
