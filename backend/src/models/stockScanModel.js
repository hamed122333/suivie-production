/**
 * Stock Scan Model
 * Direct PostgreSQL queries for scan operations
 */

const db = require('../config/db');

class StockScanModel {
  /**
   * Create a new scan record
   */
  static async createScan(scanData) {
    const {
      imageFilename,
      imageWidth,
      imageHeight,
      imageFormat,
      imageSizeBytes,
      ocrRawText,
      ocrConfidence,
      ocrLanguage,
      ocrWordsCount,
      detectedCode,
      detectedScore,
      detectedSource,
      detectedConfidence,
      bboxX0,
      bboxY0,
      bboxX1,
      bboxY1,
      processingTimeMs,
      preprocessingApplied,
      supplier,
      labelType,
      notes,
      userId,
    } = scanData;

    const query = `
      INSERT INTO stock_scans (
        image_filename, image_width, image_height, image_format, image_size_bytes,
        ocr_raw_text, ocr_confidence, ocr_language, ocr_words_count,
        detected_code, detected_score, detected_source, detected_confidence,
        bbox_x0, bbox_y0, bbox_x1, bbox_y1,
        processing_time_ms, preprocessing_applied,
        supplier, label_type, notes, user_id, status
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13,
        $14, $15, $16, $17,
        $18, $19,
        $20, $21, $22, $23, 'pending'
      )
      RETURNING *;
    `;

    const values = [
      imageFilename,
      imageWidth,
      imageHeight,
      imageFormat,
      imageSizeBytes,
      ocrRawText,
      ocrConfidence,
      ocrLanguage || 'fra',
      ocrWordsCount,
      detectedCode,
      detectedScore,
      detectedSource,
      detectedConfidence,
      bboxX0,
      bboxY0,
      bboxX1,
      bboxY1,
      processingTimeMs,
      JSON.stringify(preprocessingApplied || {}),
      supplier,
      labelType,
      notes,
      userId,
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  }

  /**
   * Add candidates for a scan
   */
  static async addCandidates(scanId, candidates) {
    const values = [];
    const placeholders = [];
    let paramIndex = 1;

    candidates.forEach((candidate, rank) => {
      const {
        text,
        source,
        originalText,
        totalScore,
        confidence,
        scores,
        metadata,
        bbox,
      } = candidate;

      placeholders.push(`(
        $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++},
        $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++},
        $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++},
        $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}
      )`);

      values.push(
        scanId,
        text,
        source,
        originalText,
        totalScore,
        confidence,
        scores?.prefixMatch || 0,
        scores?.lengthMatch || 0,
        scores?.digitLetterRatio || 0,
        scores?.ocrConfidence || 0,
        scores?.spatialIsolation || 0,
        scores?.pattern || 0,
        scores?.sourceQuality || 0,
        scores?.noDatePattern || 0,
        scores?.noWeightPattern || 0,
        bbox?.x0 || null,
        bbox?.y0 || null,
        bbox?.x1 || null,
        bbox?.y1 || null,
        JSON.stringify(metadata || {}),
        rank + 1
      );
    });

    const query = `
      INSERT INTO scan_candidates (
        scan_id, text, source, original_text, total_score, ocr_confidence,
        score_prefix, score_length, score_digit_letter_ratio, score_ocr_confidence,
        score_spatial_isolation, score_pattern, score_source_quality,
        score_no_date, score_no_weight,
        bbox_x0, bbox_y0, bbox_x1, bbox_y1, metadata, rank
      ) VALUES ${placeholders.join(', ')}
      RETURNING *;
    `;

    const result = await db.query(query, values);
    return result.rows;
  }

  /**
   * Record user correction
   */
  static async recordCorrection(correctionData) {
    const {
      scanId,
      userId,
      originalText,
      correctedText,
      wasCorrect,
      reason,
      feedbackType,
    } = correctionData;

    const query = `
      INSERT INTO scan_corrections (
        scan_id, user_id, original_text, corrected_text, was_correct, reason, feedback_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;

    const values = [
      scanId,
      userId,
      originalText,
      correctedText,
      wasCorrect || false,
      reason,
      feedbackType || 'correction',
    ];

    const result = await db.query(query, values);

    // Update scan status to 'corrected'
    await db.query(
      'UPDATE stock_scans SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['corrected', scanId]
    );

    return result.rows[0];
  }

  /**
   * Get scan by ID with candidates
   */
  static async getScanWithCandidates(scanId) {
    const scanQuery = 'SELECT * FROM stock_scans WHERE id = $1;';
    const candidatesQuery =
      'SELECT * FROM scan_candidates WHERE scan_id = $1 ORDER BY rank;';

    const [scanResult, candidatesResult] = await Promise.all([
      db.query(scanQuery, [scanId]),
      db.query(candidatesQuery, [scanId]),
    ]);

    if (scanResult.rows.length === 0) {
      return null;
    }

    return {
      ...scanResult.rows[0],
      candidates: candidatesResult.rows,
    };
  }

  /**
   * Update scan status
   */
  static async updateScanStatus(scanId, status) {
    const query = `
      UPDATE stock_scans
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *;
    `;

    const result = await db.query(query, [status, scanId]);
    return result.rows[0];
  }

  /**
   * List scans with filters
   */
  static async listScans(filters = {}) {
    const {
      status,
      supplier,
      labelType,
      dateFrom,
      dateTo,
      userId,
      limit = 50,
      offset = 0,
    } = filters;

    let query = 'SELECT * FROM stock_scans WHERE 1=1';
    const values = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      values.push(status);
    }

    if (supplier) {
      query += ` AND supplier = $${paramIndex++}`;
      values.push(supplier);
    }

    if (labelType) {
      query += ` AND label_type = $${paramIndex++}`;
      values.push(labelType);
    }

    if (dateFrom) {
      query += ` AND created_at >= $${paramIndex++}`;
      values.push(dateFrom);
    }

    if (dateTo) {
      query += ` AND created_at <= $${paramIndex++}`;
      values.push(dateTo);
    }

    if (userId) {
      query += ` AND user_id = $${paramIndex++}`;
      values.push(userId);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++};`;
    values.push(limit, offset);

    const result = await db.query(query, values);
    return result.rows;
  }

  /**
   * Get scan statistics
   */
  static async getStatistics(filters = {}) {
    const { dateFrom, dateTo, supplier, labelType } = filters;

    let query = `
      SELECT
        COUNT(*) as total_scans,
        COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed,
        COUNT(CASE WHEN status = 'corrected' THEN 1 END) as corrected,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        AVG(detected_score) as avg_score,
        AVG(ocr_confidence) as avg_ocr_confidence,
        MIN(processing_time_ms) as min_processing_time,
        MAX(processing_time_ms) as max_processing_time,
        AVG(processing_time_ms) as avg_processing_time
      FROM stock_scans
      WHERE 1=1
    `;

    const values = [];
    let paramIndex = 1;

    if (dateFrom) {
      query += ` AND created_at >= $${paramIndex++}`;
      values.push(dateFrom);
    }

    if (dateTo) {
      query += ` AND created_at <= $${paramIndex++}`;
      values.push(dateTo);
    }

    if (supplier) {
      query += ` AND supplier = $${paramIndex++}`;
      values.push(supplier);
    }

    if (labelType) {
      query += ` AND label_type = $${paramIndex++}`;
      values.push(labelType);
    }

    query += ';';

    const result = await db.query(query, values);
    return result.rows[0];
  }

  /**
   * Get supplier metrics
   */
  static async getSupplierMetrics(supplier) {
    const query = `
      SELECT * FROM supplier_metrics WHERE supplier = $1;
    `;

    const result = await db.query(query, [supplier]);
    return result.rows[0];
  }

  /**
   * Update supplier metrics
   */
  static async updateSupplierMetrics(supplier, metrics) {
    const {
      totalScans,
      correctScans,
      accuracy,
      commonPrefixes,
      commonLabelTypes,
      averageCodeLength,
      commonErrors,
      notes,
    } = metrics;

    const query = `
      INSERT INTO supplier_metrics (
        supplier, total_scans, correct_scans, accuracy,
        common_prefixes, common_label_types, average_code_length,
        common_errors, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (supplier) DO UPDATE SET
        total_scans = excluded.total_scans,
        correct_scans = excluded.correct_scans,
        accuracy = excluded.accuracy,
        common_prefixes = excluded.common_prefixes,
        common_label_types = excluded.common_label_types,
        average_code_length = excluded.average_code_length,
        common_errors = excluded.common_errors,
        notes = excluded.notes,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;

    const values = [
      supplier,
      totalScans,
      correctScans,
      accuracy,
      JSON.stringify(commonPrefixes || []),
      JSON.stringify(commonLabelTypes || []),
      averageCodeLength,
      JSON.stringify(commonErrors || []),
      notes,
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  }

  /**
   * Export scans to file
   */
  static async recordExport(exportData) {
    const {
      userId,
      exportType,
      exportFilename,
      dateFrom,
      dateTo,
      supplierFilter,
      statusFilter,
      recordsCount,
      exportDataUrl,
      notes,
    } = exportData;

    const query = `
      INSERT INTO scan_exports (
        user_id, export_type, export_filename,
        date_from, date_to, supplier_filter, status_filter,
        records_count, export_data_url, export_status, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'completed', $10)
      RETURNING *;
    `;

    const values = [
      userId,
      exportType,
      exportFilename,
      dateFrom,
      dateTo,
      supplierFilter,
      statusFilter,
      recordsCount,
      exportDataUrl,
      notes,
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  }

  /**
   * Audit log entry
   */
  static async logAuditEntry(scanId, userId, action, details, ipAddress) {
    const query = `
      INSERT INTO scan_audit_log (scan_id, user_id, action, details, ip_address)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;

    const values = [scanId, userId, action, JSON.stringify(details || {}), ipAddress];
    const result = await db.query(query, values);
    return result.rows[0];
  }
}

module.exports = StockScanModel;
