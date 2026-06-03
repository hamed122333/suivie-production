import React, { useState } from 'react';
import { Modal, Button, Input } from './ui';

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
          <Button variant="primary" onClick={handleExport}>
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
