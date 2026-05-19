const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticate, requireRoles } = require('../middleware/auth');

router.get(
  '/',
  authenticate,
  requireRoles(['planner', 'super_admin', 'commercial']),
  notificationController.list
);
// Literal route must precede the parameterized '/:id/read' route,
// otherwise Express matches 'read-all' as the ':id' param.
router.patch(
  '/read-all',
  authenticate,
  requireRoles(['planner', 'super_admin', 'commercial']),
  notificationController.markAllAsRead
);
router.patch(
  '/:id/read',
  authenticate,
  requireRoles(['planner', 'super_admin', 'commercial']),
  notificationController.markAsRead
);

module.exports = router;
