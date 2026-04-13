const express = require('express');
const router = express.Router();
const workspaceController = require('../controllers/workspaceController');
const { authenticate, requireSuperAdminOrPlanner } = require('../middleware/auth');

router.get('/', authenticate, workspaceController.getAll);
router.post('/', authenticate, requireSuperAdminOrPlanner, workspaceController.create);

module.exports = router;
