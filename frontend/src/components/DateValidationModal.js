import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Modal, Button, Input } from './ui';
import { formatDate } from '../utils/formatters';
import {
  WorkflowStepper,
  WorkflowTaskSummary,
  WorkflowNegotiationAlert,
  WorkflowDateField,
} from './WorkflowModalShared';

function DateValidationModal({ task, working = false, onClose, onValidate, onPropose }) {
  const [mode, setMode] = useState('validate');
  const [newDate, setNewDate] = useState(() => (
    task?.planned_date ? String(task.planned_date).slice(0, 10) : ''
  ));

  if (!task) return null;

  const handleClose = () => {
    if (!working) onClose();
  };

  const dueDateStr = task.due_date ? String(task.due_date).slice(0, 10) : '';
  const plannedDateStr = task.planned_date ? String(task.planned_date).slice(0, 10) : '';
  const showDueDate = dueDateStr && dueDateStr !== plannedDateStr;

  const footer = mode === 'validate' ? (
    <>
      <Button variant="ghost" onClick={handleClose} disabled={working}>Annuler</Button>
      <Button variant="secondary" onClick={() => setMode('propose')} disabled={working}>
        Proposer une autre date
      </Button>
      <Button variant="primary" onClick={onValidate} loading={working}>
        Valider la date
      </Button>
    </>
  ) : (
    <>
      <Button variant="ghost" onClick={() => setMode('validate')} disabled={working}>Retour</Button>
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
      onClose={handleClose}
      title="Prise en charge"
      size="md"
      className="wf-modal"
      closeOnOverlay={!working}
      closeOnEsc={!working}
      footer={footer}
    >
      <div className="wf-modal__layout">
        <WorkflowStepper fromStatus="WAITING_STOCK" toStatus="TODO" compact />
        <p className="wf-modal__lead">
          Confirmez la date de livraison avant de passer la commande en préparation.
        </p>

        <hr className="wf-modal__divider" />

        <WorkflowTaskSummary task={task} />

        {task.date_negotiation_status && <WorkflowNegotiationAlert task={task} />}

        <hr className="wf-modal__divider" />

        {mode === 'validate' ? (
          <>
            <WorkflowDateField date={task.planned_date} />
            {showDueDate && (
              <p className="wf-modal__meta-line">
                Délai demandé initial : <strong>{formatDate(task.due_date)}</strong>
              </p>
            )}
          </>
        ) : (
          <>
            <WorkflowDateField date={task.planned_date} label="Date actuelle" />
            <Input
              type="date"
              label="Nouvelle date proposée"
              hint="Le commercial sera notifié."
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              disabled={working}
            />
          </>
        )}
      </div>
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
