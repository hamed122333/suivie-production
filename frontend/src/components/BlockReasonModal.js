import React, { useState } from 'react';

const COMMON_REASONS = [
  'Lack of raw materials',
  'Machine busy / under maintenance',
  'Lack of staff',
  'Waiting for approval',
  'Supply chain delay',
  'Technical issue',
];

const BlockReasonModal = ({ task, onConfirm, onCancel }) => {
  const [reason, setReason] = useState('');
  const [custom, setCustom] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!reason.trim()) return;
    onConfirm(reason.trim());
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3 className="modal-title">🚫 Block Task</h3>
          <button className="modal-close" onClick={onCancel}>✕</button>
        </div>
        <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>
          Task: <strong>{task?.title}</strong>
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Reason for blocking</label>
            {!custom ? (
              <>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  style={{ marginBottom: '0.5rem' }}
                >
                  <option value="">Select a reason...</option>
                  {COMMON_REASONS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setCustom(true)}
                  style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '0.8rem', padding: 0 }}
                >
                  + Enter custom reason
                </button>
              </>
            ) : (
              <>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Describe the blocking reason..."
                  rows={3}
                  style={{ resize: 'vertical' }}
                />
                <button
                  type="button"
                  onClick={() => { setCustom(false); setReason(''); }}
                  style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '0.8rem', padding: 0 }}
                >
                  ← Choose from list
                </button>
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn btn-danger" disabled={!reason.trim()}>
              Mark as Blocked
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BlockReasonModal;
