import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Modal, Button, Input, Select } from './ui';

/**
 * Modal de correction d'une commande importée (super admin).
 * Permet de corriger les champs sources d'anomalies : commercial, client,
 * date de livraison, référence article, quantité.
 *
 * @param {object} task         Commande à corriger
 * @param {Array}  commercials  Comptes commerciaux [{ commercial_id, name }]
 * @param {boolean} working
 * @param {() => void} onClose
 * @param {(form) => void} onSave  Reçoit { clientName, commercialId, plannedDate, itemReference, quantity }
 */
function OrderEditModal({ task, commercials = [], working = false, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    clientName: task?.client_name || '',
    commercialId: task?.commercial_id || '',
    plannedDate: task?.planned_date ? String(task.planned_date).slice(0, 10) : '',
    itemReference: task?.item_reference || '',
    quantity: task?.quantity != null ? String(task.quantity) : '',
  }));

  if (!task) return null;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const commercialOptions = commercials.map((c) => ({
    value: c.commercial_id,
    label: `${c.name} (${c.commercial_id})`,
  }));

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Corriger la commande"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={working}>Annuler</Button>
          <Button variant="primary" onClick={() => onSave(form)} loading={working}>Enregistrer</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <Select
          label="Commercial"
          placeholder="Non assigné"
          options={commercialOptions}
          value={form.commercialId}
          onChange={set('commercialId')}
          hint="Assignez le bon commercial si le code VL est introuvable."
        />
        <Input label="Client" value={form.clientName} onChange={set('clientName')} placeholder="Nom du client" />
        <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
          <Input label="Référence article" value={form.itemReference} onChange={set('itemReference')} placeholder="ex. CI2939" />
          <Input label="Quantité" type="number" min="0" value={form.quantity} onChange={set('quantity')} />
        </div>
        <Input label="Date de livraison" type="date" value={form.plannedDate} onChange={set('plannedDate')} />
      </div>
    </Modal>
  );
}

OrderEditModal.propTypes = {
  task: PropTypes.object,
  commercials: PropTypes.array,
  working: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
};

export default OrderEditModal;
