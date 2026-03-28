const express = require('express');
const router = express.Router();
const workspaceController = require('../controllers/workspaceController');
const { authenticate, requireCommercial } = require('../middleware/auth');

router.get('/', authenticate, workspaceController.getAll);
router.post('/', authenticate, requireCommercial, workspaceController.create);

module.exports = router;

