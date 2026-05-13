/**
 * Stock Scan Page
 * Main interface for article code scanning
 * - Image upload via drag & drop or webcam
 * - Real-time OCR processing
 * - Intelligent candidate selection
 * - User validation and correction
 * - Excel export
 */

import React, { useState, useCallback } from 'react';
import UploadZone from '../components/UploadZone';
import WebcamCapture from '../components/WebcamCapture';
import ScanPreview from '../components/ScanPreview';
import BoundingBoxViewer from '../components/BoundingBoxViewer';
import ResultCard from '../components/ResultCard';
import CorrectionModal from '../components/CorrectionModal';
import ScanHistory from '../components/ScanHistory';
import useScanner from '../hooks/useScanner';
import { scanApi } from '../services/scanApi';
import './StockScanPage.css';

export default function StockScanPage() {
  const {
    scans,
    loading,
    error,
    processScan,
    recordCorrection,
    exportToExcel,
  } = useScanner();

  const [activeTab, setActiveTab] = useState('scan'); // scan, history
  const [currentScan, setCurrentScan] = useState(null);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [supplier, setSupplier] = useState('');
  const [labelType, setLabelType] = useState('printed');
  const [useWebcam, setUseWebcam] = useState(false);

  /**
   * Handle image upload (from drag & drop or file input)
   */
  const handleImageUpload = useCallback(async (file) => {
    if (!file) return;

    try {
      // Preview image
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target.result);
      reader.readAsDataURL(file);

      // Convert to base64 for API
      const arrayBuffer = await file.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');

      // Process scan
      const result = await processScan({
        imageBuffer: base64,
        filename: file.name,
        supplier: supplier || undefined,
        labelType,
      });

      if (result) {
        setCurrentScan(result);
        setActiveTab('result');
      }
    } catch (err) {
      console.error('Upload error:', err);
    }
  }, [supplier, labelType, processScan]);

  /**
   * Handle webcam capture
   */
  const handleWebcamCapture = useCallback(async (imageSrc) => {
    try {
      // Convert data URL to base64
      const base64 = imageSrc.split(',')[1];

      // Process scan
      const result = await processScan({
        imageBuffer: base64,
        filename: `webcam_${Date.now()}.jpg`,
        supplier: supplier || undefined,
        labelType,
      });

      if (result) {
        setCurrentScan(result);
        setImagePreview(imageSrc);
        setActiveTab('result');
        setUseWebcam(false);
      }
    } catch (err) {
      console.error('Webcam capture error:', err);
    }
  }, [supplier, labelType, processScan]);

  /**
   * Handle user correction
   */
  const handleCorrection = useCallback(async (correctedText, reason) => {
    try {
      if (!currentScan?.id) return;

      const result = await recordCorrection(currentScan.id, correctedText, reason);

      if (result) {
        setShowCorrectionModal(false);
        // Refresh scan data
        const updated = await scanApi.getScan(currentScan.id);
        setCurrentScan(updated);
      }
    } catch (err) {
      console.error('Correction error:', err);
    }
  }, [currentScan, recordCorrection]);

  /**
   * Handle Excel export
   */
  const handleExport = useCallback(async (filters) => {
    try {
      const result = await exportToExcel(filters);
      if (result) {
        // Trigger download
        const dataStr = JSON.stringify(result.data);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = result.filename || 'scans.json';
        link.click();
      }
    } catch (err) {
      console.error('Export error:', err);
    }
  }, [exportToExcel]);

  return (
    <div className="stock-scan-page">
      <header className="scan-header">
        <h1>📱 Article Code Scanner</h1>
        <p>Intelligent label scanning with OCR</p>
      </header>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      )}

      <div className="scan-container">
        {/* Navigation tabs */}
        <nav className="scan-tabs">
          <button
            className={`tab ${activeTab === 'scan' ? 'active' : ''}`}
            onClick={() => setActiveTab('scan')}
          >
            📸 Scan
          </button>
          <button
            className={`tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            📋 History ({scans.length})
          </button>
          <button
            className={`tab ${activeTab === 'result' ? 'active' : ''}`}
            disabled={!currentScan}
            onClick={() => setActiveTab('result')}
          >
            ✓ Result
          </button>
        </nav>

        {/* Scan Tab: Upload or Webcam */}
        {activeTab === 'scan' && (
          <div className="scan-content">
            <div className="scan-options">
              <div className="option-group">
                <label>Label Type</label>
                <select
                  value={labelType}
                  onChange={(e) => setLabelType(e.target.value)}
                  className="input-select"
                >
                  <option value="printed">📄 Printed</option>
                  <option value="thermal">🌡️ Thermal</option>
                  <option value="barcode">📊 Barcode</option>
                  <option value="handwritten">✍️ Handwritten</option>
                </select>
              </div>

              <div className="option-group">
                <label>Supplier (Optional)</label>
                <input
                  type="text"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="e.g., ABC Corporation"
                  className="input-text"
                />
              </div>

              <div className="option-group">
                <button
                  className={`toggle-btn ${useWebcam ? 'active' : ''}`}
                  onClick={() => setUseWebcam(!useWebcam)}
                >
                  {useWebcam ? '🖼️ Use File Upload' : '📷 Use Webcam'}
                </button>
              </div>
            </div>

            {useWebcam ? (
              <WebcamCapture
                onCapture={handleWebcamCapture}
                loading={loading}
              />
            ) : (
              <UploadZone
                onUpload={handleImageUpload}
                loading={loading}
                preview={imagePreview}
              />
            )}
          </div>
        )}

        {/* History Tab: Previous scans */}
        {activeTab === 'history' && (
          <div className="history-content">
            <ScanHistory
              scans={scans}
              onSelectScan={(scan) => {
                setCurrentScan(scan);
                setActiveTab('result');
              }}
              onExport={handleExport}
              loading={loading}
            />
          </div>
        )}

        {/* Result Tab: Detected code and candidates */}
        {activeTab === 'result' && currentScan && (
          <div className="result-content">
            <div className="result-layout">
              {/* Left: Image with bounding boxes */}
              <div className="result-image">
                {imagePreview && (
                  <BoundingBoxViewer
                    imageSrc={imagePreview}
                    candidates={currentScan.candidates || []}
                    visualizations={currentScan.visualizations}
                  />
                )}
              </div>

              {/* Right: Detected code and candidates */}
              <div className="result-details">
                <ResultCard
                  scan={currentScan}
                  onConfirm={() => {
                    // Mark as confirmed
                    recordCorrection(
                      currentScan.id,
                      currentScan.scan?.detectedCode,
                      'User confirmed'
                    );
                  }}
                  onCorrect={() => setShowCorrectionModal(true)}
                />

                <div className="candidates-list">
                  <h3>Alternative Candidates</h3>
                  <div className="candidates-scroll">
                    {currentScan.candidates?.slice(1, 5).map((candidate, idx) => (
                      <div
                        key={idx}
                        className="candidate-item"
                        onClick={() => setShowCorrectionModal(true)}
                      >
                        <span className="candidate-text">{candidate.text}</span>
                        <span className="candidate-score">
                          {Math.round(candidate.score)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {currentScan.ocrStats && (
                  <div className="ocr-stats">
                    <h4>OCR Statistics</h4>
                    <p>
                      Words detected: <strong>{currentScan.ocrStats.totalWords}</strong>
                    </p>
                    <p>
                      Page confidence: <strong>{currentScan.ocrStats.pageConfidence}%</strong>
                    </p>
                    <p>
                      Processing time: <strong>{currentScan.processingTime}ms</strong>
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="result-actions">
              <button
                className="btn btn-primary"
                onClick={() => {
                  recordCorrection(
                    currentScan.id,
                    currentScan.scan?.detectedCode,
                    'User confirmed'
                  );
                }}
              >
                ✓ Confirm
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setShowCorrectionModal(true)}
              >
                ✏️ Correct
              </button>
              <button
                className="btn btn-outline"
                onClick={() => {
                  setActiveTab('scan');
                  setCurrentScan(null);
                  setImagePreview(null);
                }}
              >
                ↻ New Scan
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Correction modal */}
      {showCorrectionModal && currentScan && (
        <CorrectionModal
          originalCode={currentScan.scan?.detectedCode}
          candidates={currentScan.candidates || []}
          onSubmit={handleCorrection}
          onClose={() => setShowCorrectionModal(false)}
        />
      )}
    </div>
  );
}
