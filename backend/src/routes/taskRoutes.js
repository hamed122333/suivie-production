const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { authenticate, requireSuperAdmin, requirePlanner } = require('../middleware/auth');

router.patch('/board', authenticate, requireSuperAdmin, taskController.reorderBoard);
router.get('/', authenticate, taskController.getAll);
router.get('/:id', authenticate, taskController.getById);
router.post('/', authenticate, requireSuperAdmin, taskController.create);
router.put('/:id', authenticate, requireSuperAdmin, taskController.update);
router.put('/:id/status', authenticate, requirePlanner, taskController.updateStatus);
router.delete('/:id', authenticate, requireSuperAdmin, taskController.delete);

module.exports = router;
