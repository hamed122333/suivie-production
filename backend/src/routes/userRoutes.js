const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');

router.get('/', authenticate, userController.getAll);
router.post('/', authenticate, requireSuperAdmin, userController.create);

module.exports = router;
