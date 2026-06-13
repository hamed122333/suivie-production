import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Modal, Button, Input } from './ui';
import { getDeliveryProgress } from '../constants/task';
import { formatQuantity } from '../utils/formatters';
import { WorkflowStepper, WorkflowTaskSummary } from './WorkflowModalShared';

const MIN_PARTIAL_QTY = 1;

function defaultQty(remaining) {
  if (remaining <= 1) return '';
  const max = remaining - 1;
  return String(Math.min(max, Math.max(MIN_PARTIAL_QTY, Math.floor(remaining / 2))));
}

function parseQty(value, remaining) {
  if (remaining <= 1) return null;
  const max = remaining - 1;
  const n = parseInt(String(value).trim(), 10);
  if (!Number.isFinite(n)) return null;
  if (n < MIN_PARTIAL_QTY || n > max) return null;
  return n;
}

function DeliveryModal({ task, working = false, onClose, onConfirm }) {
  const progress = getDeliveryProgress(task) || {
    total: Math.round(Number(task?.quantity || 0)),
    delivered: 0,
    remaining: Math.round(Number(task?.quantity || 0)),
    pct: 0,
    inProgress: false,
  };

  const { total, delivered: alreadyDelivered, remaining } = progress;
  const canPartial = remaining > 1;

  const [mode, setMode] = useState('COMPLETE');
  const [quantity, setQuantity] = useState(() => defaultQty(remaining));

  if (!task) return null;

  const thisShip = mode === 'PARTIAL' ? parseQty(quantity, remaining) : remaining;
  const afterDelivered = thisShip != null ? alreadyDelivered + thisShip : alreadyDelivered;
  const afterRemaining = thisShip != null ? total - afterDelivered : remaining;
  const afterPct = total > 0 && thisShip != null ? Math.round((afterDelivered / total) * 100) : progress.pct;
  const partialReady = mode !== 'PARTIAL' || thisShip != null;

  const handleClose = () => {
    if (!working) onClose();
  };

  const handleConfirm = () => {
    if (mode === 'PARTIAL') {
      const n = parseQty(quantity, remaining);
      if (n == null) return;
      onConfirm({ mode, quantity: n });
      return;
    }
    onConfirm({ mode, quantity: remaining });
  };

  const footer = (
    <>
      <Button variant="ghost" onClick={handleClose} disabled={working}>Annuler</Button>
      <Button variant="primary" loading={working} disabled={!partialReady} onClick={handleConfirm}>
        {mode === 'PARTIAL' ? 'Enregistrer cette livraison' : (alreadyDelivered > 0 ? 'Livrer le reliquat' : 'Confirmer la livraison')}
      </Button>
    </>
  );

  return (
    <Modal
      isOpen
      onClose={handleClose}
      title="Confirmation de livraison"
      size="md"
      className="wf-modal"
      closeOnOverlay={!working}
      closeOnEsc={!working}
      footer={footer}
    >
      <div className="wf-modal__layout">
        <WorkflowStepper fromStatus="DONE" toStatus="DELIVERED" compact />
        <p className="wf-modal__lead">
          {alreadyDelivered > 0
            ? 'Complétez la livraison ou enregistrez une nouvelle quantité partielle sur la même commande.'
            : 'Indiquez si toute la quantité est livrée au client ou seulement une partie.'}
        </p>

        <hr className="wf-modal__divider" />

        <WorkflowTaskSummary task={task} />

        {alreadyDelivered > 0 && (
          <div className="wf-modal__pct">
            <span className="wf-modal__label">Progression actuelle</span>
            <div className="wf-modal__pct-bar" role="img" aria-label={`${progress.pct} pour cent livré`}>
              <div className="wf-modal__pct-bar-seg wf-modal__pct-bar-seg--prep" style={{ width: `${progress.pct}%` }} />
              <div className="wf-modal__pct-bar-seg wf-modal__pct-bar-seg--remain" style={{ width: `${100 - progress.pct}%` }} />
            </div>
            <div className="wf-modal__pct-row">
              <span>
                Livré <strong>{progress.pct}%</strong>
                <em>{formatQuantity(alreadyDelivered)} / {formatQuantity(total)} pcs</em>
              </span>
              <span>
                Reste <strong>{100 - progress.pct}%</strong>
                <em>{formatQuantity(remaining)} pcs</em>
              </span>
            </div>
          </div>
        )}

        <hr className="wf-modal__divider" />

        <span className="wf-modal__label" id="delivery-mode-label">Cette livraison</span>
        <div className="wf-modal__choice-grid" role="radiogroup" aria-labelledby="delivery-mode-label">
          <label className={`wf-modal__choice${mode === 'COMPLETE' ? ' wf-modal__choice--selected' : ''}`}>
            <input type="radio" name="delivery-mode" checked={mode === 'COMPLETE'} disabled={working} onChange={() => setMode('COMPLETE')} />
            <span className="wf-modal__choice-title">{alreadyDelivered > 0 ? 'Livrer le reliquat' : 'Complète'}</span>
            <span className="wf-modal__choice-desc">{formatQuantity(remaining)} pcs</span>
          </label>

          <label className={`wf-modal__choice${mode === 'PARTIAL' ? ' wf-modal__choice--selected' : ''}${!canPartial ? ' wf-modal__choice--disabled' : ''}`}>
            <input
              type="radio"
              name="delivery-mode"
              checked={mode === 'PARTIAL'}
              disabled={working || !canPartial}
              onChange={() => {
                setMode('PARTIAL');
                if (!quantity) setQuantity(defaultQty(remaining));
              }}
            />
            <span className="wf-modal__choice-title">Partielle</span>
            <span className="wf-modal__choice-desc">
              {!canPartial ? 'Il ne reste qu\'1 pièce' : 'Une partie maintenant, le reste plus tard'}
            </span>
          </label>
        </div>

        {mode === 'PARTIAL' && canPartial && (
          <>
            <Input
              id="delivery-qty-input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              label="Quantité livrée maintenant"
              value={quantity}
              disabled={working}
              onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ''))}
              hint={`Entre ${MIN_PARTIAL_QTY} et ${remaining - 1} pcs (reste ${formatQuantity(remaining)} à livrer)`}
            />
            {thisShip != null && (
              <div className="wf-modal__pct">
                <span className="wf-modal__label">Après cette livraison</span>
                <div
                  className="wf-modal__pct-bar"
                  role="img"
                  aria-label={`${afterPct} pour cent livré au total`}
                >
                  <div className="wf-modal__pct-bar-seg wf-modal__pct-bar-seg--prep" style={{ width: `${afterPct}%` }} />
                  <div className="wf-modal__pct-bar-seg wf-modal__pct-bar-seg--remain" style={{ width: `${100 - afterPct}%` }} />
                </div>
                <div className="wf-modal__pct-row">
                  <span>
                    Total livré <strong>{afterPct}%</strong>
                    <em>{formatQuantity(afterDelivered)} pcs</em>
                  </span>
                  <span>
                    Reste <strong>{100 - afterPct}%</strong>
                    <em>{formatQuantity(afterRemaining)} pcs</em>
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

DeliveryModal.propTypes = {
  task: PropTypes.object,
  working: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
};

export default DeliveryModal;
