import React from 'react';
import PropTypes from 'prop-types';
import Modal from '../Modal';
import Button from '../Button';

/**
 * Dialogue de confirmation réutilisable (remplace window.confirm).
 *
 * @param {boolean} isOpen
 * @param {string} title
 * @param {React.ReactNode} message
 * @param {string} [confirmLabel='Confirmer']
 * @param {string} [cancelLabel='Annuler']
 * @param {boolean} [danger]   Style rouge pour les actions destructives
 * @param {boolean} [working]  Action en cours
 * @param {() => void} onConfirm
 * @param {() => void} onClose
 */
function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  danger = false,
  working = false,
  onConfirm,
  onClose,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={working}>{cancelLabel}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={working}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 'var(--font-size-md)', color: 'var(--color-text)' }}>{message}</p>
    </Modal>
  );
}

ConfirmDialog.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  title: PropTypes.string.isRequired,
  message: PropTypes.node,
  confirmLabel: PropTypes.string,
  cancelLabel: PropTypes.string,
  danger: PropTypes.bool,
  working: PropTypes.bool,
  onConfirm: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default ConfirmDialog;
