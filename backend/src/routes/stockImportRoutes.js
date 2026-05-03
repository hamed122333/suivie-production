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

// Get active tasks for a specific article
router.get('/:id/active-tasks', authenticate, stockImportController.getActiveTasks);

module.exports = router;
