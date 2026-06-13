import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Modal, Button, Select } from './ui';
import { WorkflowStepper, WorkflowTaskSummary } from './WorkflowModalShared';

const COMMON_REASONS = [
  'Rupture de matière première',
  'Machine occupée ou en maintenance',
  'Manque de personnel',
  'Attente de validation',
  'Retard fournisseur',
  'Problème technique',
];

function BlockReasonModal({ task, onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  const [custom, setCustom] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!task) return null;

  const fromStatus = task.status === 'BLOCKED' ? 'IN_PROGRESS' : task.status;

  const handleClose = () => {
    if (!submitting) onCancel();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setSubmitting(false);
    }
  };

  const footer = (
    <>
      <Button variant="ghost" onClick={handleClose} disabled={submitting}>Annuler</Button>
      <Button
        variant="danger"
        type="submit"
        form="block-reason-form"
        disabled={!reason.trim()}
        loading={submitting}
      >
        Confirmer le blocage
      </Button>
    </>
  );

  return (
    <Modal
      isOpen
      onClose={handleClose}
      title="Bloquer la commande"
      size="md"
      className="wf-modal"
      closeOnOverlay={!submitting}
      closeOnEsc={!submitting}
      footer={footer}
    >
      <form id="block-reason-form" className="wf-modal__layout" onSubmit={handleSubmit}>
        <WorkflowStepper fromStatus={fromStatus} toStatus="BLOCKED" compact />
        <p className="wf-modal__lead">
          Sélectionnez ou saisissez le motif du blocage.
        </p>

        <hr className="wf-modal__divider" />

        <WorkflowTaskSummary task={task} />

        <hr className="wf-modal__divider" />

        {!custom ? (
          <>
            <Select
              label="Motif"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={submitting}
              placeholder="Sélectionner un motif…"
              options={COMMON_REASONS.map((r) => ({ value: r, label: r }))}
            />
            <button
              type="button"
              className="wf-modal__link"
              disabled={submitting}
              onClick={() => setCustom(true)}
            >
              Saisir un motif personnalisé
            </button>
          </>
        ) : (
          <>
            <div className="ui-field">
              <label className="ui-field__label" htmlFor="block-custom-reason">
                Motif personnalisé
              </label>
              <textarea
                id="block-custom-reason"
                className="ui-field__control wf-modal__textarea"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Décrire le motif…"
                rows={3}
                disabled={submitting}
              />
            </div>
            <button
              type="button"
              className="wf-modal__link wf-modal__link--muted"
              disabled={submitting}
              onClick={() => { setCustom(false); setReason(''); }}
            >
              Revenir à la liste
            </button>
          </>
        )}
      </form>
    </Modal>
  );
}

BlockReasonModal.propTypes = {
  task: PropTypes.object,
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};

export default BlockReasonModal;
