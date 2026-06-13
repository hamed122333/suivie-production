const express = require('express');
const router = express.Router();
const stockImportController = require('../controllers/stockImportController');
const { excelUpload: upload } = require('../middleware/upload');
const { authenticate, requireRoles } = require('../middleware/auth');

// Upload an Excel file — planner and super_admin only
router.post(
  '/upload',
  authenticate,
  requireRoles(['planner', 'importer']),
  upload.single('file'),
  stockImportController.upload
);

// Manually add stock — planner et importateur
router.post(
  '/manual',
  authenticate,
  requireRoles(['planner', 'importer']),
  stockImportController.createManual
);

// Get all imported articles — all authenticated users
router.get('/', authenticate, stockImportController.getAll);

// Get stock by article reference
router.get('/article/:article', authenticate, stockImportController.getByArticle);

// Get active tasks for a specific article
router.get('/:id/active-tasks', authenticate, stockImportController.getActiveTasks);

// Update stock record — planner and super_admin only
router.put(
  '/:id',
  authenticate,
  requireRoles(['planner']),
  stockImportController.update
);

// Delete stock record — planner and super_admin only
router.delete(
  '/:id',
  authenticate,
  requireRoles(['planner']),
  stockImportController.delete
);

// Adjust stock quantity (add/subtract) — planner and super_admin only
router.patch(
  '/:id/adjust',
  authenticate,
  requireRoles(['planner']),
  stockImportController.adjustQuantity
);

// Set absolute quantity for article — planner and super_admin only
router.patch(
  '/article/:article/quantity',
  authenticate,
  requireRoles(['planner']),
  stockImportController.setQuantity
);

// Force recalculate allocation for all articles — admin only
router.post(
  '/recalculate-all',
  authenticate,
  requireRoles(['planner']),
  stockImportController.recalculateAll
);

module.exports = router;
