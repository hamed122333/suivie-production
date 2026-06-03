import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Modal, Button, Input } from './ui';
import { formatDate } from '../utils/formatters';

/**
 * Modal de validation / négociation de date affiché lorsque le planificateur
 * prend une commande en charge (drag Hors Stock PF → À Préparer).
 *
 * - « Valider la date » → confirme la date de livraison actuelle.
 * - « Proposer une autre date » → envoie une nouvelle date au commercial (négociation).
 *
 * @param {object} task            Tâche déplacée
 * @param {boolean} working        Action en cours
 * @param {() => void} onClose     Annuler (la fiche ne bouge pas)
 * @param {() => void} onValidate  Valider la date actuelle
 * @param {(date: string) => void} onPropose  Proposer une nouvelle date (YYYY-MM-DD)
 */
function DateValidationModal({ task, working = false, onClose, onValidate, onPropose }) {
  const [mode, setMode] = useState('validate'); // 'validate' | 'propose'
  const [newDate, setNewDate] = useState(
    task?.planned_date ? String(task.planned_date).slice(0, 10) : ''
  );

  if (!task) return null;

  const currentDate = task.planned_date ? formatDate(task.planned_date) : '—';

  const footer = mode === 'validate' ? (
    <>
      <Button variant="ghost" onClick={() => setMode('propose')} disabled={working}>
        Proposer une autre date
      </Button>
      <Button variant="primary" onClick={onValidate} loading={working}>
        Valider la date
      </Button>
    </>
  ) : (
    <>
      <Button variant="ghost" onClick={() => setMode('validate')} disabled={working}>
        Retour
      </Button>
      <Button
        variant="primary"
        onClick={() => onPropose(newDate)}
        disabled={!newDate}
        loading={working}
      >
        Envoyer la proposition
      </Button>
    </>
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Prise en charge — date de livraison"
      size="sm"
      footer={footer}
    >
      <p style={{ margin: 0, marginBottom: 'var(--space-4)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
        Commande <strong>{task.title}</strong>
      </p>

      <div style={{ marginBottom: 'var(--space-4)' }}>
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
          Date de livraison demandée
        </span>
        <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text)' }}>
          📦 {currentDate}
        </div>
      </div>

      {mode === 'propose' && (
        <Input
          type="date"
          label="Nouvelle date proposée"
          hint="Le commercial sera notifié pour accepter ou contre-proposer."
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
        />
      )}
    </Modal>
  );
}

DateValidationModal.propTypes = {
  task: PropTypes.object,
  working: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  onValidate: PropTypes.func.isRequired,
  onPropose: PropTypes.func.isRequired,
};

export default DateValidationModal;
