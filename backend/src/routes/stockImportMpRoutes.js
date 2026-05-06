const express = require('express');
const multer = require('multer');
const router = express.Router();
const stockImportMpController = require('../controllers/stockImportMpController');
const { authenticate, requireRoles } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv'
    ];
    if (allowed.includes(file.mimetype) || /\.(xls|xlsx|csv)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers Excel ou CSV sont acceptes'));
    }
  },
});

router.post(
  '/upload',
  authenticate,
  requireRoles(['planner', 'super_admin']),
  upload.single('file'),
  stockImportMpController.upload
);

router.post(
  '/manual',
  authenticate,
  requireRoles(['planner', 'super_admin']),
  stockImportMpController.createManual
);

router.get('/', authenticate, stockImportMpController.getAll);

router.get('/:id/active-tasks', authenticate, stockImportMpController.getActiveTasks);

module.exports = router;
