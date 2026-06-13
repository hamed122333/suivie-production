import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Modal, Button, Input } from './ui';
import { formatQuantity } from '../utils/formatters';
import { WorkflowStepper, WorkflowTaskSummary } from './WorkflowModalShared';

const MIN_PARTIAL_QTY = 1;

function defaultQty(total) {
  if (total <= 1) return '';
  const max = total - 1;
  return String(Math.min(max, Math.max(MIN_PARTIAL_QTY, Math.floor(total / 2))));
}

function parseQty(value, total) {
  const max = Math.max(MIN_PARTIAL_QTY, total - 1);
  const n = parseInt(String(value).trim(), 10);
  if (!Number.isFinite(n)) return null;
  if (n < MIN_PARTIAL_QTY || n > max) return null;
  return n;
}

function PreparationModal({ task, working = false, onClose, onConfirm }) {
  const total = Math.round(Number(task?.quantity || 0));
  const maxPartial = Math.max(MIN_PARTIAL_QTY, total - 1);

  const [mode, setMode] = useState('COMPLETE');
  const [quantity, setQuantity] = useState(() => defaultQty(total));

  if (!task) return null;

  const prepared = parseQty(quantity, total);
  const partialReady = mode !== 'PARTIAL' || prepared != null;
  const remaining = prepared != null ? total - prepared : 0;
  const prepPct = prepared != null && total > 0 ? Math.round((prepared / total) * 100) : 0;
  const remainPct = prepared != null && total > 0 ? 100 - prepPct : 0;

  const handleClose = () => {
    if (!working) onClose();
  };

  const handleConfirm = () => {
    if (mode === 'PARTIAL') {
      const n = parseQty(quantity, total);
      if (n == null) return;
      onConfirm({ mode, quantity: n });
      return;
    }
    onConfirm({ mode, quantity: total });
  };

  const footer = (
    <>
      <Button variant="ghost" onClick={handleClose} disabled={working}>Annuler</Button>
      <Button variant="primary" loading={working} disabled={!partialReady} onClick={handleConfirm}>
        {mode === 'PARTIAL' ? 'Envoyer au commercial' : 'Lancer la préparation'}
      </Button>
    </>
  );

  return (
    <Modal
      isOpen
      onClose={handleClose}
      title="Passage en préparation"
      size="md"
      className="wf-modal"
      closeOnOverlay={!working}
      closeOnEsc={!working}
      footer={footer}
    >
      <div className="wf-modal__layout">
        <WorkflowStepper fromStatus="TODO" toStatus="IN_PROGRESS" compact />
        <p className="wf-modal__lead">
          Indiquez si toute la quantité part en production ou seulement une partie.
        </p>

        <hr className="wf-modal__divider" />

        <WorkflowTaskSummary task={task} />

        <hr className="wf-modal__divider" />

        <span className="wf-modal__label" id="prep-mode-label">Type de préparation</span>
        <div className="wf-modal__choice-grid" role="radiogroup" aria-labelledby="prep-mode-label">
          <label className={`wf-modal__choice${mode === 'COMPLETE' ? ' wf-modal__choice--selected' : ''}`}>
            <input type="radio" name="prep-mode" checked={mode === 'COMPLETE'} disabled={working} onChange={() => setMode('COMPLETE')} />
            <span className="wf-modal__choice-title">Complète</span>
            <span className="wf-modal__choice-desc">{formatQuantity(total)} pcs</span>
          </label>

          <label className={`wf-modal__choice${mode === 'PARTIAL' ? ' wf-modal__choice--selected' : ''}${total <= 1 ? ' wf-modal__choice--disabled' : ''}`}>
            <input
              type="radio"
              name="prep-mode"
              checked={mode === 'PARTIAL'}
              disabled={working || total <= 1}
              onChange={() => {
                setMode('PARTIAL');
                if (!quantity) setQuantity(defaultQty(total));
              }}
            />
            <span className="wf-modal__choice-title">Partielle</span>
            <span className="wf-modal__choice-desc">
              {total <= 1 ? 'Non disponible' : 'Reliquat à valider par le client'}
            </span>
          </label>
        </div>

        {mode === 'PARTIAL' && total > 1 && (
          <>
            <Input
              id="prep-qty-input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              label="Quantité préparable maintenant"
              value={quantity}
              disabled={working}
              onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ''))}
              hint={`Entre ${MIN_PARTIAL_QTY} et ${maxPartial} sur ${formatQuantity(total)} pcs`}
            />
            {prepared != null && (
              <div className="wf-modal__pct">
                <span className="wf-modal__label">Répartition</span>
                <div
                  className="wf-modal__pct-bar"
                  role="img"
                  aria-label={`${prepPct} % en préparation, ${remainPct} % en reliquat`}
                >
                  <div className="wf-modal__pct-bar-seg wf-modal__pct-bar-seg--prep" style={{ width: `${prepPct}%` }} />
                  <div className="wf-modal__pct-bar-seg wf-modal__pct-bar-seg--remain" style={{ width: `${remainPct}%` }} />
                </div>
                <div className="wf-modal__pct-row">
                  <span>
                    Préparation <strong>{prepPct}%</strong>
                    <em>{formatQuantity(prepared)} pcs</em>
                  </span>
                  <span>
                    Reliquat <strong>{remainPct}%</strong>
                    <em>{formatQuantity(remaining)} pcs</em>
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

PreparationModal.propTypes = {
  task: PropTypes.object,
  working: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
};

export default PreparationModal;
