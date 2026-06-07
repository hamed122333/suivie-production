import React, { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Modal, Button, Input } from './ui';
import { formatQuantity } from '../utils/formatters';

/**
 * Modal affiché lorsque le planificateur passe une commande en préparation
 * (drag « À Préparer » → « En Préparation »).
 *
 * - « Complète »  → toute la quantité passe en préparation (flux normal).
 * - « Partielle » → saisie de la quantité préparée ; le reste est calculé,
 *   et le commercial responsable sera notifié pour validation client.
 *
 * @param {object} task            Tâche déplacée
 * @param {boolean} working        Action en cours
 * @param {() => void} onClose     Annuler (la fiche ne bouge pas)
 * @param {({mode, quantity}) => void} onConfirm  mode = 'COMPLETE' | 'PARTIAL'
 */
function PreparationModal({ task, working = false, onClose, onConfirm }) {
  const total = Math.round(Number(task?.quantity || 0));
  const [mode, setMode] = useState('COMPLETE');
  const [quantity, setQuantity] = useState(() => (total > 1 ? Math.floor(total / 2) : ''));

  const prepared = Number(quantity);
  const partialInvalid = mode === 'PARTIAL' && (!Number.isFinite(prepared) || prepared <= 0 || prepared >= total);
  const remaining = mode === 'PARTIAL' && !partialInvalid ? total - Math.round(prepared) : 0;
  const progress = useMemo(() => {
    if (mode !== 'PARTIAL' || partialInvalid || total <= 0) return mode === 'COMPLETE' ? 100 : 0;
    return Math.max(0, Math.min(100, Math.round((prepared / total) * 100)));
  }, [mode, prepared, total, partialInvalid]);

  if (!task) return null;

  const footer = (
    <>
      <Button variant="ghost" onClick={onClose} disabled={working}>Annuler</Button>
      <Button
        variant="primary"
        loading={working}
        disabled={partialInvalid}
        onClick={() => onConfirm({ mode, quantity: mode === 'PARTIAL' ? Math.round(prepared) : total })}
      >
        Confirmer
      </Button>
    </>
  );

  return (
    <Modal isOpen onClose={onClose} title="Passage en préparation" size="sm" footer={footer}>
      <p style={{ margin: 0, marginBottom: 'var(--space-4)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
        Commande <strong>{task.title}</strong> — quantité totale <strong>{formatQuantity(total)}</strong>
      </p>

      <div style={{ display: 'grid', gap: '0.6rem', marginBottom: 'var(--space-4)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, cursor: 'pointer' }}>
          <input type="radio" name="prep-mode" value="COMPLETE" checked={mode === 'COMPLETE'} disabled={working} onChange={() => setMode('COMPLETE')} />
          Préparation complète ({formatQuantity(total)})
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, cursor: 'pointer' }}>
          <input type="radio" name="prep-mode" value="PARTIAL" checked={mode === 'PARTIAL'} disabled={working} onChange={() => setMode('PARTIAL')} />
          Préparation partielle
        </label>
      </div>

      {mode === 'PARTIAL' && (
        <>
          <Input
            type="number"
            label="Quantité préparable maintenant"
            min="1"
            max={Math.max(1, total - 1)}
            value={quantity}
            disabled={working}
            onChange={(e) => setQuantity(e.target.value)}
            hint="Le commercial responsable sera notifié pour validation client."
          />
          <div style={{ marginTop: 'var(--space-4)', padding: '0.75rem', borderRadius: 8, background: '#f8fafc', color: '#334155', fontSize: 'var(--font-size-sm)' }}>
            <div><strong>Préparé :</strong> {partialInvalid ? '—' : formatQuantity(prepared)} / {formatQuantity(total)} ({progress}%)</div>
            <div><strong>Restant (reliquat) :</strong> {partialInvalid ? '—' : formatQuantity(remaining)}</div>
          </div>
        </>
      )}
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
