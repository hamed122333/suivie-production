/**
 * Stock Scan Routes
 * API endpoints for article code scanning and management
 */

const express = require('express');
const { requireRoles } = require('../middleware/auth');
const StockScanController = require('../controllers/stockScanController');

const router = express.Router();

/**
 * Process a scan (upload image, run OCR, detect code)
 * POST /api/scans
 * Body: { imageBuffer (base64), filename?, supplier?, labelType? }
 * Roles: super_admin, planner, commercial
 */
router.post('/', requireRoles(['super_admin', 'planner', 'commercial']), async (req, res) => {
  await StockScanController.processScan(req, res);
});

/**
 * Get scan details with all candidates
 * GET /api/scans/:id
 * Roles: super_admin, planner, commercial
 */
router.get('/:id', requireRoles(['super_admin', 'planner', 'commercial']), async (req, res) => {
  await StockScanController.getScan(req, res);
});

/**
 * Record user correction/validation
 * POST /api/scans/:id/correct
 * Body: { correctedText, reason? }
 * Roles: super_admin, planner, commercial
 */
router.post('/:id/correct', requireRoles(['super_admin', 'planner', 'commercial']), async (req, res) => {
  await StockScanController.recordCorrection(req, res);
});

/**
 * List scans with filters
 * GET /api/scans?status=pending&supplier=ABC&limit=50&offset=0
 * Query: status?, supplier?, labelType?, dateFrom?, dateTo?, limit?, offset?
 * Roles: super_admin, planner, commercial
 */
router.get('/', requireRoles(['super_admin', 'planner', 'commercial']), async (req, res) => {
  await StockScanController.listScans(req, res);
});

/**
 * Get scanning statistics
 * GET /api/scans/stats?dateFrom=2024-01-01&supplier=ABC&labelType=printed
 * Query: dateFrom?, dateTo?, supplier?, labelType?
 * Roles: super_admin, planner
 */
router.get('/stats', requireRoles(['super_admin', 'planner']), async (req, res) => {
  await StockScanController.getStatistics(req, res);
});

/**
 * Get supplier-specific learning insights
 * GET /api/scans/learning/insights?supplier=ABC
 * Query: supplier (required)
 * Roles: super_admin, planner
 */
router.get('/learning/insights', requireRoles(['super_admin', 'planner']), async (req, res) => {
  await StockScanController.getLearningInsights(req, res);
});

/**
 * Export scans to Excel/CSV
 * POST /api/scans/export
 * Body: { format: 'excel'|'csv', dateFrom?, dateTo?, supplier?, status? }
 * Roles: super_admin, planner
 */
router.post('/export', requireRoles(['super_admin', 'planner']), async (req, res) => {
  await StockScanController.exportScans(req, res);
});

/**
 * Initialize OCR service
 * POST /api/scans/init
 * Roles: super_admin
 */
router.post('/init', requireRoles(['super_admin']), async (req, res) => {
  await StockScanController.initializeOCR(req, res);
});

module.exports = router;
