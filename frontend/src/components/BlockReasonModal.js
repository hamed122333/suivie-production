import React, { useState } from 'react';

const COMMON_REASONS = [
  'Rupture de matiere premiere',
  'Machine occupee ou en maintenance',
  'Manque de personnel',
  'Attente de validation',
  'Retard fournisseur',
  'Probleme technique',
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
          <h3 className="modal-title">🚫 Bloquer la tache</h3>
          <button className="modal-close" onClick={onCancel}>✕</button>
        </div>
        <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>
          Tache : <strong>{task?.title}</strong>
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Motif du blocage</label>
            {!custom ? (
              <>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  style={{ marginBottom: '0.5rem' }}
                >
                  <option value="">Selectionner un motif...</option>
                  {COMMON_REASONS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setCustom(true)}
                  style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '0.8rem', padding: 0 }}
                >
                  + Saisir un motif personnalise
                </button>
              </>
            ) : (
              <>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Decrire le motif du blocage..."
                  rows={3}
                  style={{ resize: 'vertical' }}
                />
                <button
                  type="button"
                  onClick={() => { setCustom(false); setReason(''); }}
                  style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '0.8rem', padding: 0 }}
                >
                  ← Revenir a la liste
                </button>
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onCancel}>Annuler</button>
            <button type="submit" className="btn btn-danger" disabled={!reason.trim()}>
              Confirmer le blocage
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BlockReasonModal;
