const express = require('express');
const router = express.Router();
const workspaceController = require('../controllers/workspaceController');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');

router.get('/', authenticate, workspaceController.getAll);
router.post('/', authenticate, requireSuperAdmin, workspaceController.create);

module.exports = router;

