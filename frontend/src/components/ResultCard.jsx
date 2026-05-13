/**
 * Result Card Component
 * Displays detected article code with confidence and options
 */

import React from 'react';
import './ResultCard.css';

export default function ResultCard({ scan, onConfirm, onCorrect }) {
  const detectedCode = scan.scan?.detectedCode || scan.detectedCode;
  const score = scan.scan?.score || scan.score || 0;
  const confidence = scan.scan?.confidence || scan.confidence || 0;

  const getScoreColor = (s) => {
    if (s >= 80) return '#27ae60';
    if (s >= 60) return '#f39c12';
    if (s >= 40) return '#f1c40f';
    return '#e74c3c';
  };

  return (
    <div className="result-card">
      <div className="result-header">
        <h2>🎯 Detected Code</h2>
      </div>

      <div className="result-main">
        <div className="detected-code">
          <code>{detectedCode}</code>
        </div>

        <div className="score-display">
          <div className="score-item">
            <label>Confidence</label>
            <div className="score-bar">
              <div
                className="score-fill"
                style={{
                  width: `${confidence}%`,
                  backgroundColor: getScoreColor(confidence),
                }}
              ></div>
            </div>
            <span className="score-value">{Math.round(confidence)}%</span>
          </div>

          <div className="score-item">
            <label>Overall Score</label>
            <div className="score-bar">
              <div
                className="score-fill"
                style={{
                  width: `${score}%`,
                  backgroundColor: getScoreColor(score),
                }}
              ></div>
            </div>
            <span className="score-value">{Math.round(score)}%</span>
          </div>
        </div>
      </div>

      <div className="result-info">
        <div className="info-row">
          <span className="info-label">Detection Source:</span>
          <span className="info-value">{scan.scan?.source || 'Unknown'}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Code Length:</span>
          <span className="info-value">{detectedCode?.length} characters</span>
        </div>
      </div>

      <div className="confidence-indicator">
        {score >= 80 && (
          <div className="indicator excellent">
            <span>✓ High Confidence</span>
          </div>
        )}
        {score >= 60 && score < 80 && (
          <div className="indicator good">
            <span>✓ Good Confidence</span>
          </div>
        )}
        {score >= 40 && score < 60 && (
          <div className="indicator fair">
            <span>⚠ Fair Confidence</span>
          </div>
        )}
        {score < 40 && (
          <div className="indicator poor">
            <span>⚠ Low Confidence</span>
          </div>
        )}
      </div>

      <div className="result-actions-small">
        <button className="action-btn confirm" onClick={onConfirm}>
          ✓ Confirm
        </button>
        <button className="action-btn correct" onClick={onCorrect}>
          ✏️ Correct
        </button>
      </div>
    </div>
  );
}
