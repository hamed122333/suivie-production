/**
 * Correction Modal Component
 * Allows user to correct or confirm detected code
 */

import React, { useState } from 'react';
import './CorrectionModal.css';

export default function CorrectionModal({ originalCode, candidates = [], onSubmit, onClose }) {
  const [selectedCode, setSelectedCode] = useState(originalCode);
  const [customCode, setCustomCode] = useState('');
  const [reason, setReason] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  const handleSubmit = () => {
    const finalCode = useCustom ? customCode : selectedCode;

    if (!finalCode || finalCode.trim() === '') {
      alert('Please select or enter an article code');
      return;
    }

    onSubmit(finalCode, reason);
  };

  const codeToUse = useCustom ? customCode : selectedCode;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Correct Article Code</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          {/* Original code display */}
          <div className="correction-section">
            <h3>Original Detection</h3>
            <div className="original-code">
              <code>{originalCode}</code>
            </div>
          </div>

          {/* Candidate selection */}
          {candidates.length > 0 && (
            <div className="correction-section">
              <h3>Suggested Alternatives</h3>
              <div className="candidates-options">
                {candidates.map((candidate, idx) => (
                  <label key={idx} className="candidate-option">
                    <input
                      type="radio"
                      name="code"
                      value={candidate.text}
                      checked={selectedCode === candidate.text && !useCustom}
                      onChange={(e) => {
                        setSelectedCode(e.target.value);
                        setUseCustom(false);
                      }}
                    />
                    <span className="option-text">
                      <span className="option-code">{candidate.text}</span>
                      <span className="option-score">{Math.round(candidate.score)}%</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Custom code input */}
          <div className="correction-section">
            <label className="custom-toggle">
              <input
                type="checkbox"
                checked={useCustom}
                onChange={(e) => setUseCustom(e.target.checked)}
              />
              <span>Enter custom code</span>
            </label>

            {useCustom && (
              <div className="custom-input-group">
                <label htmlFor="customCode">Article Code</label>
                <input
                  id="customCode"
                  type="text"
                  value={customCode}
                  onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                  placeholder="e.g., CI-123-ABC"
                  className="custom-input"
                  autoFocus
                />
              </div>
            )}
          </div>

          {/* Reason for correction */}
          <div className="correction-section">
            <label htmlFor="reason">Reason (Optional)</label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why are you correcting this code? (helps improve detection)"
              className="reason-input"
              rows="3"
            />
          </div>

          {/* Preview */}
          <div className="correction-preview">
            <span>Will confirm:</span>
            <code className="preview-code">{codeToUse}</code>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-submit" onClick={handleSubmit}>
            ✓ Confirm Correction
          </button>
        </div>
      </div>
    </div>
  );
}
