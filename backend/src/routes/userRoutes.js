const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.get('/', authenticate, userController.getAll);
router.post('/', authenticate, requireAdmin, userController.create);

module.exports = router;
