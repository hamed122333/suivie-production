import React, { useState, useMemo } from 'react';
import { taskAPI } from '../services/api';
import './ConflictResolutionModal.css';

const ConflictResolutionModal = ({ task, onClose, onResolved }) => {
  const [selectedStrategy, setSelectedStrategy] = useState('priority');
  const [negotiatedDate, setNegotiatedDate] = useState('');
  const [splitQuantity, setSplitQuantity] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const conflictingClients = useMemo(() => {
    if (!task?.competing_clients) return [];
    return task.competing_clients.split(',').map(c => c.trim()).filter(Boolean);
  }, [task?.competing_clients]);

  const handleResolve = async () => {
    if (!task?.id) return;

    const payload = { strategy: selectedStrategy };

    if (selectedStrategy === 'negotiate' && !negotiatedDate) {
      setError('Veuillez sélectionner une date de livraison proposée');
      return;
    }
    if (selectedStrategy === 'negotiate') {
      payload.negotiatedDate = negotiatedDate;
    }

    if (selectedStrategy === 'split') {
      if (!splitQuantity || splitQuantity <= 0 || splitQuantity >= task.quantity) {
        setError('Quantité invalide');
        return;
      }
      payload.splitQuantity = parseFloat(splitQuantity);
    }

    setLoading(true);
    setError('');

    try {
      const response = await taskAPI.resolveConflict(task.id, payload);
      if (onResolved) {
        onResolved(response.data);
      }
      onClose();
    } catch (err) {
      setError(err?.response?.data?.error || 'Erreur lors de la résolution du conflit');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay conflict-resolution-modal-overlay" onClick={onClose}>
      <div
        className="modal-content conflict-resolution-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Résoudre conflit stock"
      >
        <div className="conflict-modal__header">
          <h3>🚨 Résoudre Conflit Stock</h3>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            disabled={loading}
            title="Fermer"
          >
            ✕
          </button>
        </div>

        <div className="conflict-modal__body">
          {/* Task & Conflict Summary */}
          <section className="conflict-modal__section">
            <h4 className="conflict-modal__subtitle">Tâche en Conflit</h4>
            <div className="conflict-modal__task-summary">
              <div className="conflict-modal__summary-row">
                <span className="conflict-modal__label">Titre:</span>
                <strong className="conflict-modal__value">{task?.title}</strong>
              </div>
              <div className="conflict-modal__summary-row">
                <span className="conflict-modal__label">Client:</span>
                <strong className="conflict-modal__value">{task?.client_name || 'Non spécifié'}</strong>
              </div>
              <div className="conflict-modal__summary-row">
                <span className="conflict-modal__label">Article:</span>
                <strong className="conflict-modal__value">{task?.item_reference}</strong>
              </div>
              <div className="conflict-modal__summary-row">
                <span className="conflict-modal__label">Quantité Demandée:</span>
                <strong className="conflict-modal__value">{task?.quantity} {task?.quantity_unit || 'pcs'}</strong>
              </div>
              <div className="conflict-modal__summary-row">
                <span className="conflict-modal__label">Stock Disponible:</span>
                <strong className="conflict-modal__value">{task?.stock_available_at_creation || 0}</strong>
              </div>
              {task?.stock_deficit > 0 && (
                <div className="conflict-modal__summary-row conflict-modal__summary-row--danger">
                  <span className="conflict-modal__label">Manquant:</span>
                  <strong className="conflict-modal__value--danger">-{task.stock_deficit} {task?.quantity_unit || 'pcs'}</strong>
                </div>
              )}
            </div>
          </section>

          {/* Competing Tasks */}
          {conflictingClients.length > 0 && (
            <section className="conflict-modal__section">
              <h4 className="conflict-modal__subtitle">Clients en Compétition</h4>
              <div className="conflict-modal__competing-list">
                {conflictingClients.map((client, idx) => (
                  <div key={idx} className="conflict-modal__competing-item">
                    📌 {client}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Resolution Strategies */}
          <section className="conflict-modal__section">
            <h4 className="conflict-modal__subtitle">Stratégie de Résolution</h4>
            <div className="conflict-modal__strategies">
              {/* Priority Strategy */}
              <label className="conflict-modal__strategy-option">
                <input
                  type="radio"
                  name="strategy"
                  value="priority"
                  checked={selectedStrategy === 'priority'}
                  onChange={(e) => setSelectedStrategy(e.target.value)}
                  disabled={loading}
                />
                <div className="conflict-modal__strategy-content">
                  <span className="conflict-modal__strategy-title">Par Priorité</span>
                  <span className="conflict-modal__strategy-desc">
                    Les tâches de priorité inférieure seront bloquées
                  </span>
                </div>
              </label>

              {/* Date Strategy */}
              <label className="conflict-modal__strategy-option">
                <input
                  type="radio"
                  name="strategy"
                  value="date"
                  checked={selectedStrategy === 'date'}
                  onChange={(e) => setSelectedStrategy(e.target.value)}
                  disabled={loading}
                />
                <div className="conflict-modal__strategy-content">
                  <span className="conflict-modal__strategy-title">Par Échéance</span>
                  <span className="conflict-modal__strategy-desc">
                    Les tâches avec échéance ultérieure seront reportées
                  </span>
                </div>
              </label>

              {/* Negotiate Strategy */}
              <label className="conflict-modal__strategy-option">
                <input
                  type="radio"
                  name="strategy"
                  value="negotiate"
                  checked={selectedStrategy === 'negotiate'}
                  onChange={(e) => setSelectedStrategy(e.target.value)}
                  disabled={loading}
                />
                <div className="conflict-modal__strategy-content">
                  <span className="conflict-modal__strategy-title">Négocier Nouvelle Date</span>
                  <span className="conflict-modal__strategy-desc">
                    Proposer une nouvelle date de livraison au client
                  </span>
                  {selectedStrategy === 'negotiate' && (
                    <div className="conflict-modal__strategy-input">
                      <input
                        type="date"
                        value={negotiatedDate}
                        onChange={(e) => setNegotiatedDate(e.target.value)}
                        disabled={loading}
                      />
                    </div>
                  )}
                </div>
              </label>

              {/* Split Strategy */}
              <label className="conflict-modal__strategy-option">
                <input
                  type="radio"
                  name="strategy"
                  value="split"
                  checked={selectedStrategy === 'split'}
                  onChange={(e) => setSelectedStrategy(e.target.value)}
                  disabled={loading}
                />
                <div className="conflict-modal__strategy-content">
                  <span className="conflict-modal__strategy-title">Diviser la Commande</span>
                  <span className="conflict-modal__strategy-desc">
                    Livrer une quantité réduite, puis le reste ultérieurement
                  </span>
                  {selectedStrategy === 'split' && (
                    <div className="conflict-modal__strategy-input">
                      <input
                        type="number"
                        placeholder="Quantité à livrer d'abord"
                        value={splitQuantity}
                        onChange={(e) => setSplitQuantity(e.target.value)}
                        min="1"
                        max={task?.quantity || 100}
                        disabled={loading}
                      />
                      <span className="conflict-modal__strategy-hint">
                        / {task?.quantity} {task?.quantity_unit || 'pcs'}
                      </span>
                    </div>
                  )}
                </div>
              </label>
            </div>
          </section>

          {/* Error Message */}
          {error && (
            <div className="conflict-modal__error">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="conflict-modal__footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={loading}
          >
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleResolve}
            disabled={loading}
          >
            {loading ? 'Résolution...' : 'Résoudre Conflit'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConflictResolutionModal;
