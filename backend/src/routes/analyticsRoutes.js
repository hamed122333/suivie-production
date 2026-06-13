const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { authenticate, requireRoles } = require('../middleware/auth');

// Page Analytics — réservée au super_admin (observateur stratégique).
router.get('/commercials', authenticate, requireRoles(['super_admin']), analyticsController.commercialPerformance);

module.exports = router;
