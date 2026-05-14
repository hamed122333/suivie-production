const express = require('express');
const multer = require('multer');
const path = require('path');
const scanController = require('../controllers/scanController');

const router = express.Router();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../../uploads/scans'));
    },
    filename: (req, file, cb) => {
        const uniqueName = `scan_${Date.now()}_${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
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

router.post('/upload', upload.single('image'), scanController.uploadImage);
router.post('/process/:scan_id', scanController.processScan);
router.get('/scan/:scan_id', scanController.getScan);
router.put('/scan/:scan_id', scanController.updateScan);
router.post('/scan/:scan_id/validate', scanController.validateScan);
router.get('/history', scanController.getHistory);

module.exports = router;