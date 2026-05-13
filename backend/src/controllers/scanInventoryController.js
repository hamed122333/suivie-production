const path = require('path');
const fs = require('fs');
const aiService = require('../services/aiService');
const scanInventoryModel = require('../models/scanInventoryModel');
const articleCodeConfigModel = require('../models/articleCodeConfigModel');

const UPLOAD_DIR = path.join(__dirname, '../../uploads/scan-inventory');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const scanInventoryController = {
    extractCodesWithConfig(text, configPatterns) {
        const codes = [];
        
        for (const config of configPatterns) {
            try {
                const regex = new RegExp(config.pattern_regex, 'gi');
                const matches = text.match(regex) || [];
                
                for (const match of matches) {
                    const cleanCode = match.replace(/[^A-Z0-9]/gi, '').toUpperCase();
                    if (cleanCode.length >= 5) {
                        codes.push({
                            code: cleanCode,
                            type: config.label,
                            confidence: 70,
                            configId: config.id
                        });
                    }
                }
            } catch (e) {
                console.error('Regex error for config:', config.name, e.message);
            }
        }
        
        const uniqueCodes = [];
        const seen = new Set();
        for (const code of codes) {
            if (!seen.has(code.code)) {
                seen.add(code.code);
                uniqueCodes.push(code);
            }
        }
        
        return uniqueCodes;
    },

    async uploadAndScan(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No image file provided' });
            }

            const imagePath = req.file.path;
            
            const aiResult = await aiService.analyzeImage(imagePath);

            let codes = aiResult.codes || [];
            
            if (!aiResult.success || codes.length === 0) {
                console.log('Ollama failed, falling back to regex patterns...');
                try {
                    const config = await articleCodeConfigModel.getActive();
                    codes = scanInventoryController.extractCodesWithConfig(aiResult.rawResponse || '', config);
                } catch (e) {
                    console.error('Fallback error:', e.message);
                }
            }

            const imageUrl = `/uploads/scan-inventory/${req.file.filename}`;
            
            const savedScan = await scanInventoryModel.create({
                imageUrl,
                codes,
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
                    codes,
                    totalCodes: codes.length,
                    processingTime: aiResult.processingTime || 0,
                    method: aiResult.method || 'fallback'
                },
                rawResponse: aiResult.rawResponse || ''
            });
        } catch (error) {
            console.error('Scan upload error:', error);
            res.status(500).json({ error: 'Internal server error', details: error.message });
        }
    },

    async getCodeConfigs(req, res) {
        try {
            const configs = await articleCodeConfigModel.getAll();
            res.json({ configs });
        } catch (error) {
            console.error('Get configs error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async updateCodeConfig(req, res) {
        try {
            const { id } = req.params;
            const updated = await articleCodeConfigModel.update(id, req.body);
            
            if (!updated) {
                return res.status(404).json({ error: 'Config not found' });
            }
            
            res.json({ config: updated });
        } catch (error) {
            console.error('Update config error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async toggleCodeConfig(req, res) {
        try {
            const { id } = req.params;
            const { isActive } = req.body;
            const updated = await articleCodeConfigModel.toggleActive(id, isActive);
            
            res.json({ config: updated });
        } catch (error) {
            console.error('Toggle config error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async checkOllamaStatus(req, res) {
        try {
            const status = await aiService.checkConnection();
            res.json(status);
        } catch (error) {
            res.json({ connected: false, error: error.message });
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
            
            let csv = 'ID,Date,Code,Type,Confidence\n';
            
            scans.forEach(scan => {
                const codes = scan.codes || [];
                if (codes.length === 0) {
                    csv += `${scan.id},${scan.scanned_at},,,\n`;
                } else {
                    codes.forEach(c => {
                        csv += `${scan.id},${scan.scanned_at},${c.code},${c.type || ''},${c.confidence || ''}\n`;
                    });
                }
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