import React, { useState } from 'react';
import { Modal, Button, Input } from './ui';

const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

const ExportModal = ({ isOpen, onClose, onExport }) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const handleExport = () => {
    onExport(startDate || null, endDate || null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Exporter les tâches"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button variant="primary" onClick={handleExport} leftIcon={<DownloadIcon />}>
            Télécharger Excel
          </Button>
        </>
      }
    >
      <p style={{ marginBottom: 'var(--space-5)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
        Sélectionnez une période pour affiner votre export. Laissez les champs vides pour tout exporter.
      </p>
      <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
        <Input type="date" label="Date de début" value={startDate} onChange={e => setStartDate(e.target.value)} />
        <Input type="date" label="Date de fin" value={endDate} onChange={e => setEndDate(e.target.value)} />
      </div>
    </Modal>
  );
};

export default ExportModal;
