/**
 * Stock Scan API Service
 * Handles all API calls to backend scanning endpoints
 */

import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const SCAN_ENDPOINT = `${API_BASE}/api/scans`;

export const scanApi = {
  /**
   * Process a scan image
   */
  processScan: async (params) => {
    const { imageBuffer, filename, supplier, labelType } = params;

    try {
      const response = await axios.post(`${SCAN_ENDPOINT}`, {
        imageBuffer,
        filename,
        supplier,
        labelType,
      });

      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Failed to process scan');
    }
  },

  /**
   * Get scan details
   */
  getScan: async (scanId) => {
    try {
      const response = await axios.get(`${SCAN_ENDPOINT}/${scanId}`);
      return response.data;
    } catch (error) {
      throw new Error('Failed to get scan details');
    }
  },

  /**
   * Record user correction
   */
  recordCorrection: async (scanId, correctedText, reason) => {
    try {
      const response = await axios.post(`${SCAN_ENDPOINT}/${scanId}/correct`, {
        correctedText,
        reason,
      });

      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Failed to record correction');
    }
  },

  /**
   * List scans with filters
   */
  listScans: async (params = {}) => {
    const { status, supplier, labelType, dateFrom, dateTo, limit = 50, offset = 0 } = params;

    try {
      const queryParams = new URLSearchParams();

      if (status) queryParams.append('status', status);
      if (supplier) queryParams.append('supplier', supplier);
      if (labelType) queryParams.append('labelType', labelType);
      if (dateFrom) queryParams.append('dateFrom', dateFrom);
      if (dateTo) queryParams.append('dateTo', dateTo);
      queryParams.append('limit', limit);
      queryParams.append('offset', offset);

      const response = await axios.get(
        `${SCAN_ENDPOINT}?${queryParams.toString()}`
      );

      return response.data.scans || [];
    } catch (error) {
      throw new Error('Failed to list scans');
    }
  },

  /**
   * Get scanning statistics
   */
  getStatistics: async (params = {}) => {
    const { dateFrom, dateTo, supplier, labelType } = params;

    try {
      const queryParams = new URLSearchParams();

      if (dateFrom) queryParams.append('dateFrom', dateFrom);
      if (dateTo) queryParams.append('dateTo', dateTo);
      if (supplier) queryParams.append('supplier', supplier);
      if (labelType) queryParams.append('labelType', labelType);

      const response = await axios.get(
        `${SCAN_ENDPOINT}/stats?${queryParams.toString()}`
      );

      return response.data;
    } catch (error) {
      throw new Error('Failed to get statistics');
    }
  },

  /**
   * Export scans to Excel/CSV
   */
  exportScans: async (params = {}) => {
    const { format = 'excel', dateFrom, dateTo, supplier, status } = params;

    try {
      const response = await axios.post(`${SCAN_ENDPOINT}/export`, {
        format,
        dateFrom,
        dateTo,
        supplier,
        status,
      });

      return response.data;
    } catch (error) {
      throw new Error('Failed to export scans');
    }
  },

  /**
   * Get learning insights for supplier
   */
  getLearningInsights: async (supplier) => {
    try {
      const response = await axios.get(
        `${SCAN_ENDPOINT}/learning/insights?supplier=${supplier}`
      );

      return response.data;
    } catch (error) {
      throw new Error('Failed to get learning insights');
    }
  },
};
