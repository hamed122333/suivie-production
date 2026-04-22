const express = require('express');
const multer = require('multer');
const stockController = require('../controllers/stockController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
    ];
    if (allowed.includes(file.mimetype) || /\.(xls|xlsx|csv)$/i.test(file.originalname)) {
      cb(null, true);
      return;
    }
    cb(new Error('Seuls les fichiers Excel ou CSV sont acceptés.'));
  },
});

router.post('/import', authenticate, upload.single('file'), stockController.importStock);

module.exports = router;
