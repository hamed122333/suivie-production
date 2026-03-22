const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.patch('/board', authenticate, requireAdmin, taskController.reorderBoard);
router.get('/', authenticate, taskController.getAll);
router.get('/:id', authenticate, taskController.getById);
router.post('/', authenticate, requireAdmin, taskController.create);
router.put('/:id', authenticate, requireAdmin, taskController.update);
router.put('/:id/status', authenticate, taskController.updateStatus);
router.delete('/:id', authenticate, requireAdmin, taskController.delete);

module.exports = router;
