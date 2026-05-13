const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const ocrService = require('../services/ocrService');
const scanInventoryModel = require('../models/scanInventoryModel');

const UPLOAD_DIR = path.join(__dirname, '../../uploads/scan-inventory');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const scanInventoryController = {
    async uploadAndScan(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No image file provided' });
            }

            const imagePath = req.file.path;
            const originalName = req.file.originalname;
            
            const ocrResult = await ocrService.processImage(imagePath);

            if (!ocrResult.success) {
                return res.status(500).json({ 
                    error: 'OCR processing failed',
                    details: ocrResult.error 
                });
            }

            const imageUrl = `/uploads/scan-inventory/${req.file.filename}`;
            
            const savedScan = await scanInventoryModel.create({
                imageUrl,
                codes: ocrResult.codes,
                createdBy: req.user?.id
            });

            fs.unlink(imagePath, (err) => {
                if (err) console.error('Failed to delete temp file:', err);
            });

            res.json({
                success: true,
                scan: {
                    id: savedScan.id,
                    imageUrl,
                    codes: ocrResult.codes,
                    totalCodes: ocrResult.codes.length,
                    confidence: ocrResult.confidence,
                    processingTime: ocrResult.processingTime
                }
            });
        } catch (error) {
            console.error('Scan upload error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async getHistory(req, res) {
        try {
            const limit = parseInt(req.query.limit) || 50;
            const offset = parseInt(req.query.offset) || 0;
            
            const scans = await scanInventoryModel.getAll(limit, offset);
            
            res.json({ scans });
        } catch (error) {
            console.error('Get history error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async getScan(req, res) {
        try {
            const { id } = req.params;
            const scan = await scanInventoryModel.getById(id);
            
            if (!scan) {
                return res.status(404).json({ error: 'Scan not found' });
            }
            
            res.json({ scan });
        } catch (error) {
            console.error('Get scan error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async deleteScan(req, res) {
        try {
            const { id } = req.params;
            const deleted = await scanInventoryModel.delete(id);
            
            if (!deleted) {
                return res.status(404).json({ error: 'Scan not found' });
            }
            
            res.json({ success: true, deleted });
        } catch (error) {
            console.error('Delete scan error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async getStats(req, res) {
        try {
            const stats = await scanInventoryModel.getStats();
            res.json({ stats });
        } catch (error) {
            console.error('Get stats error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async exportCSV(req, res) {
        try {
            const scans = await scanInventoryModel.getAllForExport();
            
            let csv = 'ID,Date,Codes,Image URL\n';
            
            scans.forEach(scan => {
                const codes = JSON.stringify(scan.codes).replace(/"/g, '""');
                csv += `${scan.id},${scan.scanned_at},${codes},${scan.image_url || ''}\n`;
            });
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=inventory-scan-export.csv');
            res.send(csv);
        } catch (error) {
            console.error('Export CSV error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
};

module.exports = scanInventoryController;