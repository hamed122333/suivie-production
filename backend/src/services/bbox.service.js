/**
 * Bounding Box Service
 *
 * Handles bounding box data for visualization and spatial analysis:
 * - Converts OCR bounding boxes to standard format
 * - Creates visual overlays for web display
 * - Calculates spatial relationships
 * - Exports bbox data for frontend react-konva visualization
 *
 * No image manipulation - just bbox calculations and data
 */

class BBoxService {
  /**
   * Format bbox for frontend visualization
   * @param {Object} bbox - Bounding box from OCR
   * @param {Object} imageStats - Image dimensions
   * @returns {Object} - Formatted bbox with normalized coordinates
   */
  static formatBBoxForFrontend(bbox, imageStats = {}) {
    const imageWidth = imageStats.original?.width || 1000;
    const imageHeight = imageStats.original?.height || 1000;

    return {
      x: bbox.x0,
      y: bbox.y0,
      width: bbox.width || bbox.x1 - bbox.x0,
      height: bbox.height || bbox.y1 - bbox.y0,
      x1: bbox.x1,
      y1: bbox.y1,
      // Normalized coordinates (0-1 range)
      normalized: {
        x: bbox.x0 / imageWidth,
        y: bbox.y0 / imageHeight,
        width: (bbox.width || bbox.x1 - bbox.x0) / imageWidth,
        height: (bbox.height || bbox.y1 - bbox.y0) / imageHeight,
      },
    };
  }

  /**
   * Create visualization rectangles for candidates
   * @param {Array} candidates - Scored candidates
   * @param {Object} imageStats - Image metadata
   * @returns {Array} - Rectangles for react-konva
   */
  static createVisualizationRectangles(candidates, imageStats = {}) {
    return candidates
      .filter(c => c.bbox)
      .map((candidate, index) => ({
        id: `bbox-${index}`,
        candidate: candidate.text,
        score: candidate.totalScore,
        stroke: this._getColorByScore(candidate.totalScore),
        strokeWidth: 2,
        fill: 'rgba(255, 0, 0, 0.1)',
        ...this.formatBBoxForFrontend(candidate.bbox, imageStats),
      }));
  }

  /**
   * Color coding by score for visualization
   * @param {number} score - Score 0-100
   * @returns {string} - RGB color
   */
  static _getColorByScore(score) {
    if (score >= 80) return '#00AA00'; // Green - excellent
    if (score >= 60) return '#FFAA00'; // Orange - good
    if (score >= 40) return '#FFFF00'; // Yellow - fair
    return '#FF0000'; // Red - poor
  }

  /**
   * Calculate spatial relationships between candidates
   * @param {Array} candidates - Candidates with bboxes
   * @returns {Object} - Spatial analysis
   */
  static analyzeSpatialRelationships(candidates) {
    const relationships = [];

    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const c1 = candidates[i];
        const c2 = candidates[j];

        if (!c1.bbox || !c2.bbox) continue;

        relationships.push({
          from: c1.text,
          to: c2.text,
          distance: this._calculateDistance(c1.bbox, c2.bbox),
          horizontalGap: this._calculateHorizontalGap(c1.bbox, c2.bbox),
          verticalGap: this._calculateVerticalGap(c1.bbox, c2.bbox),
          alignment: this._detectAlignment(c1.bbox, c2.bbox),
          overlap: this._calculateOverlap(c1.bbox, c2.bbox),
        });
      }
    }

    return relationships;
  }

  /**
   * Detect if bboxes are horizontally/vertically aligned
   * @param {Object} bbox1
   * @param {Object} bbox2
   * @returns {string} - 'horizontal', 'vertical', or 'diagonal'
   */
  static _detectAlignment(bbox1, bbox2) {
    const yDiff = Math.abs((bbox1.y0 + bbox1.y1) / 2 - (bbox2.y0 + bbox2.y1) / 2);
    const xDiff = Math.abs((bbox1.x0 + bbox1.x1) / 2 - (bbox2.x0 + bbox2.x1) / 2);

    const maxHeight = Math.max(bbox1.y1 - bbox1.y0, bbox2.y1 - bbox2.y0);
    const maxWidth = Math.max(bbox1.x1 - bbox1.x0, bbox2.x1 - bbox2.x0);

    if (yDiff < maxHeight * 0.3) return 'horizontal';
    if (xDiff < maxWidth * 0.3) return 'vertical';
    return 'diagonal';
  }

  /**
   * Calculate center distance between two bboxes
   */
  static _calculateDistance(bbox1, bbox2) {
    const c1 = {
      x: (bbox1.x0 + bbox1.x1) / 2,
      y: (bbox1.y0 + bbox1.y1) / 2,
    };
    const c2 = {
      x: (bbox2.x0 + bbox2.x1) / 2,
      y: (bbox2.y0 + bbox2.y1) / 2,
    };

    return Math.sqrt(Math.pow(c2.x - c1.x, 2) + Math.pow(c2.y - c1.y, 2));
  }

  /**
   * Calculate horizontal gap between bboxes
   */
  static _calculateHorizontalGap(bbox1, bbox2) {
    const left = Math.max(bbox1.x0, bbox2.x0);
    const right = Math.min(bbox1.x1, bbox2.x1);

    if (right > left) {
      return 0; // Overlapping
    }

    return Math.min(
      Math.abs(bbox2.x0 - bbox1.x1), // bbox1 on left
      Math.abs(bbox1.x0 - bbox2.x1) // bbox2 on left
    );
  }

  /**
   * Calculate vertical gap between bboxes
   */
  static _calculateVerticalGap(bbox1, bbox2) {
    const top = Math.max(bbox1.y0, bbox2.y0);
    const bottom = Math.min(bbox1.y1, bbox2.y1);

    if (bottom > top) {
      return 0; // Overlapping
    }

    return Math.min(
      Math.abs(bbox2.y0 - bbox1.y1), // bbox1 on top
      Math.abs(bbox1.y0 - bbox2.y1) // bbox2 on top
    );
  }

  /**
   * Calculate overlap area between bboxes
   * @returns {number} - Overlap percentage (0-100)
   */
  static _calculateOverlap(bbox1, bbox2) {
    const xOverlap = Math.max(
      0,
      Math.min(bbox1.x1, bbox2.x1) - Math.max(bbox1.x0, bbox2.x0)
    );
    const yOverlap = Math.max(
      0,
      Math.min(bbox1.y1, bbox2.y1) - Math.max(bbox1.y0, bbox2.y0)
    );

    if (xOverlap === 0 || yOverlap === 0) return 0;

    const area1 = (bbox1.x1 - bbox1.x0) * (bbox1.y1 - bbox1.y0);
    const area2 = (bbox2.x1 - bbox2.x0) * (bbox2.y1 - bbox2.y0);
    const overlapArea = xOverlap * yOverlap;

    return (overlapArea / Math.min(area1, area2)) * 100;
  }

  /**
   * Group candidates by region (clustering)
   * @param {Array} candidates - Candidates with bboxes
   * @param {number} maxDistance - Max pixel distance for grouping
   * @returns {Array} - Clusters of nearby candidates
   */
  static clusterByRegion(candidates, maxDistance = 200) {
    const clusters = [];
    const used = new Set();

    candidates.forEach((candidate, i) => {
      if (used.has(i) || !candidate.bbox) return;

      const cluster = [candidate];
      used.add(i);

      candidates.forEach((other, j) => {
        if (used.has(j) || !other.bbox) return;

        const distance = this._calculateDistance(candidate.bbox, other.bbox);
        if (distance <= maxDistance) {
          cluster.push(other);
          used.add(j);
        }
      });

      clusters.push({
        candidates: cluster,
        count: cluster.length,
        boundingBox: this._calculateClusterBBox(cluster),
        avgScore:
          cluster.reduce((sum, c) => sum + c.totalScore, 0) / cluster.length,
      });
    });

    return clusters;
  }

  /**
   * Calculate bounding box that encloses all candidates in cluster
   */
  static _calculateClusterBBox(candidates) {
    const validBBoxes = candidates.filter(c => c.bbox);

    if (validBBoxes.length === 0) return null;

    return {
      x0: Math.min(...validBBoxes.map(c => c.bbox.x0)),
      y0: Math.min(...validBBoxes.map(c => c.bbox.y0)),
      x1: Math.max(...validBBoxes.map(c => c.bbox.x1)),
      y1: Math.max(...validBBoxes.map(c => c.bbox.y1)),
      width:
        Math.max(...validBBoxes.map(c => c.bbox.x1)) -
        Math.min(...validBBoxes.map(c => c.bbox.x0)),
      height:
        Math.max(...validBBoxes.map(c => c.bbox.y1)) -
        Math.min(...validBBoxes.map(c => c.bbox.y0)),
    };
  }

  /**
   * Export bboxes as SVG overlay
   * @param {Array} candidates - Candidates with bboxes
   * @param {Object} imageStats - Image dimensions
   * @returns {string} - SVG string
   */
  static exportAsSVG(candidates, imageStats = {}) {
    const imageWidth = imageStats.original?.width || 1000;
    const imageHeight = imageStats.original?.height || 1000;

    let svg = `<svg width="${imageWidth}" height="${imageHeight}" xmlns="http://www.w3.org/2000/svg">`;

    candidates.forEach((candidate, index) => {
      if (!candidate.bbox) return;

      const bbox = candidate.bbox;
      const color = this._getColorByScore(candidate.totalScore);

      svg += `
        <rect
          x="${bbox.x0}"
          y="${bbox.y0}"
          width="${bbox.width || bbox.x1 - bbox.x0}"
          height="${bbox.height || bbox.y1 - bbox.y0}"
          fill="none"
          stroke="${color}"
          stroke-width="2"
        />
        <text
          x="${bbox.x0}"
          y="${bbox.y0 - 5}"
          fill="${color}"
          font-size="12"
          font-weight="bold"
        >${candidate.text} (${candidate.totalScore})</text>
      `;
    });

    svg += '</svg>';
    return svg;
  }

  /**
   * Export bboxes as JSON for storage
   * @param {Array} candidates - Candidates with bboxes
   * @returns {Array} - JSON-serializable bbox array
   */
  static exportAsJSON(candidates) {
    return candidates.map(candidate => ({
      text: candidate.text,
      score: candidate.totalScore,
      source: candidate.source,
      confidence: candidate.confidence,
      bbox: candidate.bbox || null,
      metadata: candidate.metadata,
    }));
  }

  /**
   * Validate bboxes (check for NaN, negative dimensions, etc)
   * @param {Array} candidates - Candidates to validate
   * @returns {Object} - Validation report
   */
  static validateBBoxes(candidates) {
    const issues = [];
    const valid = [];

    candidates.forEach((candidate, index) => {
      if (!candidate.bbox) {
        valid.push(candidate);
        return;
      }

      const bbox = candidate.bbox;
      const errors = [];

      if (!Number.isFinite(bbox.x0)) errors.push('Invalid x0');
      if (!Number.isFinite(bbox.y0)) errors.push('Invalid y0');
      if (!Number.isFinite(bbox.x1)) errors.push('Invalid x1');
      if (!Number.isFinite(bbox.y1)) errors.push('Invalid y1');

      if (bbox.x1 <= bbox.x0) errors.push('x1 <= x0');
      if (bbox.y1 <= bbox.y0) errors.push('y1 <= y0');

      if (errors.length === 0) {
        valid.push(candidate);
      } else {
        issues.push({
          candidate: candidate.text,
          index,
          errors,
        });
      }
    });

    return {
      valid,
      issues,
      totalChecked: candidates.length,
      validCount: valid.length,
      issuedCount: issues.length,
    };
  }
}

module.exports = BBoxService;
