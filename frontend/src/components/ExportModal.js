import React, { useState, useEffect } from 'react';

const ExportModal = ({ isOpen, onClose, onExport, currentWorkspaceId }) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [exportAll, setExportAll] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setExportAll(currentWorkspaceId === 'all' || !currentWorkspaceId);
    }
  }, [isOpen, currentWorkspaceId]);

  if (!isOpen) return null;

  const handleExport = () => {
    onExport(startDate || null, endDate || null, exportAll);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '450px' }}>
        <div className="modal-header">
          <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Exporter les tâches
          </h3>
          <button className="modal-close" onClick={onClose} title="Fermer">✕</button>
        </div>
        <p style={{ marginBottom: '20px', fontSize: '0.875rem', color: '#6b7280', lineHeight: '1.4' }}>
          Sélectionnez une période pour affiner votre export. Laissez les champs vides pour exporter l'intégralité des données.
        </p>

        <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '4px' }}>Date de début</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db', boxSizing: 'border-box' }}
            />
          </div>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '4px' }}>Date de fin</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        {currentWorkspaceId !== 'all' && currentWorkspaceId != null && (
          <div style={{ marginBottom: '24px', padding: '12px', backgroundColor: '#f3f4f6', borderRadius: '6px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem', margin: 0, cursor: 'pointer', color: '#374151' }}>
              <input
                type="checkbox"
                checked={exportAll}
                onChange={(e) => setExportAll(e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer', margin: 0 }}
              />
              <span>Inclure les tâches de <strong>tous les espaces</strong></span>
            </label>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
          >
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleExport}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            Télécharger Excel
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;

