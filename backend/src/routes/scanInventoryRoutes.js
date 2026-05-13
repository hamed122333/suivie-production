const express = require('express');
const multer = require('multer');
const path = require('path');
const scanInventoryController = require('../controllers/scanInventoryController');

const router = express.Router();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../../uploads/scan-inventory'));
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (extname && mimetype) {
            return cb(null, true);
        }
        cb(new Error('Only image files are allowed'));
    }
});

router.post('/upload', upload.single('image'), scanInventoryController.uploadAndScan);
router.get('/history', scanInventoryController.getHistory);
router.get('/stats', scanInventoryController.getStats);
router.get('/export', scanInventoryController.exportCSV);
router.get('/:id', scanInventoryController.getScan);
router.delete('/:id', scanInventoryController.deleteScan);

module.exports = router;