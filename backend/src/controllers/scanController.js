const path = require('path');
const fs = require('fs');
const ImagePreprocessor = require('../services/imagePreprocessor');
const OCRService = require('../services/ocrService');
const SmartParser = require('../services/smartParser');
const ConfidenceScorer = require('../services/confidenceScorer');
const NormalizationService = require('../services/normalizationService');
const pool = require('../config/db');

const UPLOAD_DIR = path.join(__dirname, '../../uploads/scans');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const imagePreprocessor = new ImagePreprocessor();
const ocrService = new OCRService();
const smartParser = new SmartParser();
const confidenceScorer = new ConfidenceScorer();
const normalizationService = new NormalizationService();

const scanController = {
    async uploadImage(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No image file provided' });
            }

            const uploadRelativePath = `/uploads/scans/${req.file.filename}`;
            
            const scanId = await createScanRecord(uploadRelativePath);
            
            res.json({
                success: true,
                scan_id: scanId,
                image_url: uploadRelativePath
            });
        } catch (error) {
            console.error('Upload error:', error);
            res.status(500).json({ error: 'Upload failed', details: error.message });
        }
    },

    async processScan(req, res) {
        try {
            const { scan_id } = req.params;
            const scan = await getScanRecord(scan_id);
            
            if (!scan) {
                return res.status(404).json({ error: 'Scan not found' });
            }

            let imagePath = scan.image_url;
            if (!imagePath.startsWith('/')) {
                imagePath = '/' + imagePath.replace(/\\/g, '/');
            }
            const fullPath = path.join(__dirname, '../..', imagePath);
            if (!fs.existsSync(fullPath)) {
                return res.status(404).json({ error: 'Image file not found' });
            }

            const imageBuffer = fs.readFileSync(fullPath);
            
            const preprocessedBuffer = await imagePreprocessor.preprocess(imageBuffer);
            
            const ocrResult = await ocrService.extractText(preprocessedBuffer);
            
            if (!ocrResult.success) {
                await updateScanStatus(scan_id, 'failed');
                return res.status(500).json({ 
                    success: false,
                    error: 'OCR failed',
                    details: ocrResult.error
                });
            }

            const parsedFields = smartParser.parseAll(ocrResult.rawText);
            
            const normalizedFields = normalizationService.normalizeAllFields(parsedFields);
            
            const overallConfidence = confidenceScorer.calculateOverallConfidence(normalizedFields);
            
            await updateScanFields(scan_id, {
                raw_ocr_text: ocrResult.rawText,
                supplier: normalizedFields.supplier?.value || null,
                supplier_confidence: normalizedFields.supplier?.confidence || 0,
                width: normalizedFields.width?.value || null,
                width_confidence: normalizedFields.width?.confidence || 0,
                weight: normalizedFields.weight?.value || null,
                weight_confidence: normalizedFields.weight?.confidence || 0,
                reel_serial_number: normalizedFields.reel_serial_number?.value || null,
                reel_confidence: normalizedFields.reel_serial_number?.confidence || 0,
                status: 'pending'
            });

            await updateScanStatus(scan_id, 'processed');

            res.json({
                success: true,
                scan_id,
                fields: {
                    supplier: normalizedFields.supplier?.value,
                    width: normalizedFields.width?.value,
                    weight: normalizedFields.weight?.value,
                    reel_serial_number: normalizedFields.reel_serial_number?.value
                },
                confidences: {
                    supplier: confidenceScorer.formatConfidence(normalizedFields.supplier?.confidence || 0),
                    width: confidenceScorer.formatConfidence(normalizedFields.width?.confidence || 0),
                    weight: confidenceScorer.formatConfidence(normalizedFields.weight?.confidence || 0),
                    reel_serial_number: confidenceScorer.formatConfidence(normalizedFields.reel_serial_number?.confidence || 0)
                },
                overall_confidence: confidenceScorer.formatConfidence(overallConfidence),
                raw_text: ocrResult.rawText,
                processing_time: ocrResult.processingTime
            });
        } catch (error) {
            console.error('Process error:', error);
            res.status(500).json({ error: 'Processing failed', details: error.message });
        }
    },

    async updateScan(req, res) {
        try {
            const { scan_id } = req.params;
            const { supplier, width, weight, reel_serial_number, bobine_place } = req.body;
            
            const scan = await getScanRecord(scan_id);
            if (!scan) {
                return res.status(404).json({ error: 'Scan not found' });
            }

            await updateScanFields(scan_id, {
                supplier: supplier || null,
                width: width || null,
                weight: weight || null,
                reel_serial_number: reel_serial_number || null,
                bobine_place: bobine_place || null
            });

            res.json({ success: true, scan_id });
        } catch (error) {
            console.error('Update error:', error);
            res.status(500).json({ error: 'Update failed', details: error.message });
        }
    },

    async validateScan(req, res) {
        try {
            const { scan_id } = req.params;
            
            const scan = await getScanRecord(scan_id);
            if (!scan) {
                return res.status(404).json({ error: 'Scan not found' });
            }

            await updateScanStatus(scan_id, 'validated');

            res.json({ success: true, scan_id, status: 'validated' });
        } catch (error) {
            console.error('Validate error:', error);
            res.status(500).json({ error: 'Validation failed', details: error.message });
        }
    },

    async getScan(req, res) {
        try {
            const { scan_id } = req.params;
            const scan = await getScanRecord(scan_id);
            
            if (!scan) {
                return res.status(404).json({ error: 'Scan not found' });
            }

            res.json({
                success: true,
                scan: formatScanResponse(scan)
            });
        } catch (error) {
            console.error('Get scan error:', error);
            res.status(500).json({ error: 'Failed to get scan', details: error.message });
        }
    },

    async getHistory(req, res) {
        try {
            const limit = parseInt(req.query.limit) || 50;
            const offset = parseInt(req.query.offset) || 0;
            const status = req.query.status;
            
            const scans = await getScanHistory(limit, offset, status);
            
            res.json({
                success: true,
                scans: scans.map(formatScanResponse),
                total: scans.length
            });
        } catch (error) {
            console.error('History error:', error);
            res.status(500).json({ error: 'Failed to get history', details: error.message });
        }
    }
};

async function createScanRecord(imagePath) {
    const query = `
        INSERT INTO scans (image_url, status, created_at)
        VALUES ($1, 'uploading', NOW())
        RETURNING id
    `;
    const result = await pool.query(query, [imagePath.replace(/\\/g, '/')]);
    return result.rows[0].id;
}

async function getScanRecord(scanId) {
    const query = 'SELECT * FROM scans WHERE id = $1';
    const result = await pool.query(query, [scanId]);
    return result.rows[0];
}

async function updateScanStatus(scanId, status) {
    const query = 'UPDATE scans SET status = $1 WHERE id = $2';
    await pool.query(query, [status, scanId]);
}

async function updateScanFields(scanId, fields) {
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) {
            updates.push(`${key} = $${paramIndex}`);
            values.push(value);
            paramIndex++;
        }
    }
    
    if (updates.length === 0) return;
    
    updates.push(`updated_at = NOW()`);
    values.push(scanId);
    
    const query = `UPDATE scans SET ${updates.join(', ')} WHERE id = $${paramIndex}`;
    await pool.query(query, values);
}

async function getScanHistory(limit, offset, status) {
    let query = 'SELECT * FROM scans';
    const params = [];
    
    if (status) {
        query += ' WHERE status = $1';
        params.push(status);
        query += ' ORDER BY created_at DESC LIMIT $2 OFFSET $3';
        params.push(limit, offset);
    } else {
        query += ' ORDER BY created_at DESC LIMIT $1 OFFSET $2';
        params.push(limit, offset);
    }
    
    const result = await pool.query(query, params);
    return result.rows;
}

function formatScanResponse(scan) {
    return {
        id: scan.id,
        image_url: scan.image_url,
        raw_ocr_text: scan.raw_ocr_text,
        supplier: scan.supplier,
        width: scan.width,
        weight: scan.weight,
        reel_serial_number: scan.reel_serial_number,
        bobine_place: scan.bobine_place,
        status: scan.status,
        created_at: scan.created_at,
        confidences: {
            supplier: scan.supplier_confidence,
            width: scan.width_confidence,
            weight: scan.weight_confidence,
            reel_serial_number: scan.reel_confidence
        }
    };
}

module.exports = scanController;