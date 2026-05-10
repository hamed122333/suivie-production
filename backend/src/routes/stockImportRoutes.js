const express = require('express');
const multer = require('multer');
const router = express.Router();
const stockImportController = require('../controllers/stockImportController');
const { authenticate, requireRoles } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv'
    ];
    if (allowed.includes(file.mimetype) || /\.(xls|xlsx|csv)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers Excel ou CSV sont acceptés'));
    }
  },
});

// Upload an Excel file — planner and super_admin only
router.post(
  '/upload',
  authenticate,
  requireRoles(['planner', 'super_admin']),
  upload.single('file'),
  stockImportController.upload
);

// Manually add stock — planner and super_admin only
router.post(
  '/manual',
  authenticate,
  requireRoles(['planner', 'super_admin']),
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
  requireRoles(['planner', 'super_admin']),
  stockImportController.update
);

// Delete stock record — planner and super_admin only
router.delete(
  '/:id',
  authenticate,
  requireRoles(['planner', 'super_admin']),
  stockImportController.delete
);

// Adjust stock quantity (add/subtract) — planner and super_admin only
router.patch(
  '/:id/adjust',
  authenticate,
  requireRoles(['planner', 'super_admin']),
  stockImportController.adjustQuantity
);

// Set absolute quantity for article — planner and super_admin only
router.patch(
  '/article/:article/quantity',
  authenticate,
  requireRoles(['planner', 'super_admin']),
  stockImportController.setQuantity
);

// Force recalculate allocation for all articles — admin only
router.post(
  '/recalculate-all',
  authenticate,
  requireRoles(['super_admin']),
  stockImportController.recalculateAll
);

module.exports = router;
