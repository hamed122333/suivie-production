/**
 * useScanner Hook
 * Manages scanning state and operations
 */

import { useState, useCallback } from 'react';
import { scanApi } from '../services/scanApi';

export default function useScanner() {
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Process a scan image
   */
  const processScan = useCallback(async (params) => {
    setLoading(true);
    setError(null);

    try {
      const result = await scanApi.processScan(params);
      setScans(prev => [result, ...prev]);
      return result;
    } catch (err) {
      setError(err.message || 'Failed to process scan');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Record user correction
   */
  const recordCorrection = useCallback(async (scanId, correctedText, reason) => {
    setLoading(true);
    setError(null);

    try {
      const result = await scanApi.recordCorrection(scanId, correctedText, reason);
      return result;
    } catch (err) {
      setError(err.message || 'Failed to record correction');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Export scans to Excel
   */
  const exportToExcel = useCallback(async (filters) => {
    setLoading(true);
    setError(null);

    try {
      const result = await scanApi.exportScans(filters);
      return result;
    } catch (err) {
      setError(err.message || 'Failed to export scans');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Load scan history
   */
  const loadHistory = useCallback(async (params) => {
    setLoading(true);
    setError(null);

    try {
      const result = await scanApi.listScans(params);
      setScans(result);
      return result;
    } catch (err) {
      setError(err.message || 'Failed to load history');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    scans,
    loading,
    error,
    processScan,
    recordCorrection,
    exportToExcel,
    loadHistory,
  };
}
