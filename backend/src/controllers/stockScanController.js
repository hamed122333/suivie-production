/**
 * Stock Scan Controller
 *
 * Orchestrates the complete scanning pipeline:
 * 1. Image upload/preprocessing
 * 2. OCR extraction
 * 3. Candidate generation
 * 4. Intelligent scoring
 * 5. Result storage
 * 6. User correction handling
 */

const StockScanModel = require('../models/stockScanModel');
const PreprocessService = require('../services/preprocess.service');
const OCRService = require('../services/ocr.service');
const CandidateService = require('../services/candidate.service');
const ScoringService = require('../services/scoring.service');
const BBoxService = require('../services/bbox.service');
const LearningService = require('../services/learning.service');

class StockScanController {
  /**
   * Main scan endpoint: upload image and process
   * POST /api/scans
   */
  static async processScan(req, res) {
    try {
      const startTime = Date.now();
      const { imageBuffer, filename, supplier, labelType } = req.body;
      const userId = req.user?.id;

      if (!imageBuffer) {
        return res.status(400).json({
          error: 'Image buffer required',
        });
      }

      // Convert base64 to buffer if needed
      let buffer = imageBuffer;
      if (typeof imageBuffer === 'string') {
        buffer = Buffer.from(imageBuffer, 'base64');
      }

      // === STEP 1: Preprocess image ===
      const { processed, metadata: imageStats } =
        await PreprocessService.preprocessForOCR(buffer);

      // === STEP 2: OCR extraction ===
      const ocrData = await OCRService.extractText(processed);

      // Also get words with detailed info
      const wordsWithConfidence =
        await OCRService.extractWordsWithConfidence(processed);

      // === STEP 3: Generate candidates ===
      const rawCandidates = await CandidateService.generateCandidates(
        ocrData,
        imageStats
      );

      // Filter candidates by quality
      const filtered = CandidateService.filterCandidates(rawCandidates, {
        minLength: 5,
        maxLength: 15,
        minConfidence: 30,
      });

      // Deduplicate similar candidates
      const candidates = CandidateService.deduplicateCandidates(filtered);

      // === STEP 4: Score candidates ===
      const context = {
        previousCodes: [], // Could load from database
      };

      const scoredCandidates = ScoringService.scoreCandidates(
        candidates,
        imageStats,
        context
      );

      // === STEP 5: Get top candidate ===
      const topCandidate = scoredCandidates[0];

      if (!topCandidate) {
        return res.status(400).json({
          error: 'No valid article codes detected in image',
          ocrData,
        });
      }

      // === STEP 6: Create visualization ===
      const visualizations = BBoxService.createVisualizationRectangles(
        scoredCandidates.slice(0, 5), // Top 5
        imageStats
      );

      // === STEP 7: Store in database ===
      const scan = await StockScanModel.createScan({
        imageFilename: filename || 'unnamed.jpg',
        imageWidth: imageStats.original?.width,
        imageHeight: imageStats.original?.height,
        imageFormat: imageStats.original?.format,
        imageSizeBytes: buffer.length,
        ocrRawText: ocrData.text,
        ocrConfidence: ocrData.confidence,
        ocrLanguage: 'fra',
        ocrWordsCount: ocrData.raw?.words?.length || 0,
        detectedCode: topCandidate.text,
        detectedScore: topCandidate.totalScore,
        detectedSource: topCandidate.source,
        detectedConfidence: topCandidate.confidence,
        bboxX0: topCandidate.bbox?.x0,
        bboxY0: topCandidate.bbox?.y0,
        bboxX1: topCandidate.bbox?.x1,
        bboxY1: topCandidate.bbox?.y1,
        processingTimeMs: Date.now() - startTime,
        preprocessingApplied: imageStats.preprocessing,
        supplier,
        labelType,
        userId,
      });

      // Store all candidates
      const storedCandidates = await StockScanModel.addCandidates(
        scan.id,
        scoredCandidates.slice(0, 10) // Top 10
      );

      // === STEP 8: Log audit ===
      await StockScanModel.logAuditEntry(
        scan.id,
        userId,
        'scan_created',
        {
          candidatesGenerated: scoredCandidates.length,
          topScore: topCandidate.totalScore,
          processingTime: Date.now() - startTime,
        },
        req.ip
      );

      // === Return response ===
      return res.status(200).json({
        success: true,
        scan: {
          id: scan.id,
          detectedCode: topCandidate.text,
          score: topCandidate.totalScore,
          confidence: topCandidate.confidence,
          source: topCandidate.source,
        },
        candidates: scoredCandidates.slice(0, 5).map(c => ({
          text: c.text,
          score: c.totalScore,
          confidence: c.confidence,
          source: c.source,
        })),
        visualizations,
        processingTime: Date.now() - startTime,
        ocrStats: {
          totalWords: ocrData.raw?.words?.length || 0,
          pageConfidence: ocrData.confidence,
        },
      });
    } catch (error) {
      console.error('Scan processing error:', error);
      res.status(500).json({
        error: 'Scan processing failed',
        message: error.message,
      });
    }
  }

  /**
   * Get scan details with all candidates
   * GET /api/scans/:id
   */
  static async getScan(req, res) {
    try {
      const { id } = req.params;

      const scan = await StockScanModel.getScanWithCandidates(id);

      if (!scan) {
        return res.status(404).json({ error: 'Scan not found' });
      }

      // Enrich with scoring explanations
      const enrichedCandidates = scan.candidates.map(candidate => ({
        ...candidate,
        explanation: ScoringService.explainScore(candidate),
      }));

      res.json({
        ...scan,
        candidates: enrichedCandidates,
      });
    } catch (error) {
      console.error('Get scan error:', error);
      res.status(500).json({
        error: 'Failed to retrieve scan',
        message: error.message,
      });
    }
  }

  /**
   * Record user correction
   * POST /api/scans/:id/correct
   */
  static async recordCorrection(req, res) {
    try {
      const { id } = req.params;
      const { correctedText, reason } = req.body;
      const userId = req.user?.id;

      if (!correctedText) {
        return res.status(400).json({
          error: 'correctedText is required',
        });
      }

      // Get original scan
      const scan = await StockScanModel.getScanWithCandidates(id);
      if (!scan) {
        return res.status(404).json({ error: 'Scan not found' });
      }

      // Check if correction matches any of the candidates
      const matchingCandidate = scan.candidates.find(
        c => c.text === correctedText
      );

      // Record correction
      const correction = await StockScanModel.recordCorrection({
        scanId: id,
        userId,
        originalText: scan.detected_code,
        correctedText,
        wasCorrect: scan.detected_code === correctedText,
        reason,
        feedbackType:
          scan.detected_code === correctedText ? 'confirmation' : 'correction',
      });

      // Update scan status
      await StockScanModel.updateScanStatus(id, 'corrected');

      // Log audit
      await StockScanModel.logAuditEntry(
        id,
        userId,
        'correction_recorded',
        {
          originalCode: scan.detected_code,
          correctedCode: correctedText,
          wasAccurate: scan.detected_code === correctedText,
        },
        req.ip
      );

      // Build learning data (for non-ML learning)
      const learningRecord = LearningService.recordCorrection({
        originalText: scan.detected_code,
        correctedText,
        imageId: id,
        supplier: scan.supplier,
        labelType: scan.label_type,
        confidence: scan.detected_confidence,
        score: scan.detected_score,
        allCandidates: scan.candidates,
        userReason: reason,
      });

      res.json({
        success: true,
        correction,
        learningRecord,
      });
    } catch (error) {
      console.error('Correction error:', error);
      res.status(500).json({
        error: 'Failed to record correction',
        message: error.message,
      });
    }
  }

  /**
   * List scans with filters
   * GET /api/scans?status=pending&supplier=ABC&limit=50
   */
  static async listScans(req, res) {
    try {
      const {
        status,
        supplier,
        labelType,
        dateFrom,
        dateTo,
        limit = 50,
        offset = 0,
      } = req.query;

      const scans = await StockScanModel.listScans({
        status,
        supplier,
        labelType,
        dateFrom,
        dateTo,
        limit: parseInt(limit),
        offset: parseInt(offset),
      });

      res.json({
        scans,
        count: scans.length,
        limit: parseInt(limit),
        offset: parseInt(offset),
      });
    } catch (error) {
      console.error('List scans error:', error);
      res.status(500).json({
        error: 'Failed to list scans',
        message: error.message,
      });
    }
  }

  /**
   * Get scanning statistics
   * GET /api/scans/stats?dateFrom=2024-01-01&supplier=ABC
   */
  static async getStatistics(req, res) {
    try {
      const { dateFrom, dateTo, supplier, labelType } = req.query;

      const stats = await StockScanModel.getStatistics({
        dateFrom,
        dateTo,
        supplier,
        labelType,
      });

      res.json(stats);
    } catch (error) {
      console.error('Statistics error:', error);
      res.status(500).json({
        error: 'Failed to get statistics',
        message: error.message,
      });
    }
  }

  /**
   * Get learning insights
   * GET /api/scans/learning/insights?supplier=ABC
   */
  static async getLearningInsights(req, res) {
    try {
      const { supplier } = req.query;

      if (!supplier) {
        return res.status(400).json({
          error: 'supplier query parameter is required',
        });
      }

      const metrics = await StockScanModel.getSupplierMetrics(supplier);
      const insights = LearningService.getSupplierInsights(
        metrics?.common_errors || [],
        supplier
      );

      res.json({
        supplier,
        metrics,
        insights,
      });
    } catch (error) {
      console.error('Learning insights error:', error);
      res.status(500).json({
        error: 'Failed to get learning insights',
        message: error.message,
      });
    }
  }

  /**
   * Export scans to Excel
   * POST /api/scans/export
   */
  static async exportScans(req, res) {
    try {
      const { format = 'excel', dateFrom, dateTo, supplier, status } = req.body;
      const userId = req.user?.id;

      // Get scans
      const scans = await StockScanModel.listScans({
        status,
        supplier,
        dateFrom,
        dateTo,
        limit: 10000,
        offset: 0,
      });

      // Format data for export
      const exportData = scans.map(scan => ({
        Date: new Date(scan.created_at).toLocaleDateString('fr-FR'),
        'Article Code': scan.detected_code,
        Score: scan.detected_score,
        Supplier: scan.supplier,
        'Label Type': scan.label_type,
        Status: scan.status,
        'OCR Confidence': scan.ocr_confidence,
      }));

      // Record export
      const exportRecord = await StockScanModel.recordExport({
        userId,
        exportType: format,
        exportFilename: `scans_${Date.now()}.${format === 'excel' ? 'xlsx' : 'csv'}`,
        dateFrom,
        dateTo,
        supplierFilter: supplier,
        statusFilter: status,
        recordsCount: scans.length,
        notes: 'Manual export',
      });

      res.json({
        success: true,
        exportRecord,
        data: exportData,
        count: scans.length,
      });
    } catch (error) {
      console.error('Export error:', error);
      res.status(500).json({
        error: 'Failed to export scans',
        message: error.message,
      });
    }
  }

  /**
   * Initialize OCR (call once at startup)
   * POST /api/scans/init
   */
  static async initializeOCR(req, res) {
    try {
      await OCRService.initialize();
      res.json({
        success: true,
        message: 'OCR service initialized',
      });
    } catch (error) {
      console.error('OCR initialization error:', error);
      res.status(500).json({
        error: 'Failed to initialize OCR',
        message: error.message,
      });
    }
  }
}

module.exports = StockScanController;
