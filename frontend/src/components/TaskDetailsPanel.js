import React, { useCallback, useEffect, useState } from 'react';
import { TASK_PRIORITY_CONFIG, TASK_STATUS_CONFIG, TASK_STATUS_OPTIONS } from '../constants/task';
import { taskAPI } from '../services/api';
import { formatDate, formatDateTime, formatNumber, formatRelativeDate, getInitials } from '../utils/formatters';
import './TaskDetailsPanel.css';

const DETAIL_FIELDS = [
  { key: 'client_name', label: 'Client', icon: '👤' },
  { key: 'item_reference', label: 'Article', icon: '📦' },
  { key: 'planned_date', label: 'Date prévue', icon: '🗓️', format: (val) => formatDate(val, { withYear: true }) },
  {
    key: 'quantity',
    label: 'Quantité',
    icon: '📊',
    format: (val, task) => `${formatNumber(val)} ${task.quantity_unit || 'pcs'}`,
  },
];

function buildOperationalSummary(task, history) {
  if (!task) return 'Aucune donnée.';
  const qty = Number(task.quantity || 0);
  const planned = task.planned_date ? formatDate(task.planned_date, { withYear: true }) : null;
  const expectedAction = `${task.expected_action || ''}`.toUpperCase();
  const historyText = (history || []).map((entry) => `${entry.message || ''} ${entry.field_name || ''}`.toLowerCase()).join(' | ');
  const dateNegotiated = historyText.includes('date') || historyText.includes('planifie');

  if (task.status === 'WAITING_STOCK') {
    if (expectedAction.includes('NEW_PRODUCT')) {
      return planned
        ? `Nouveau produit détecté (réf. ${task.item_reference || '—'}) avec ${qty || '—'} pcs demandés. Le commercial a proposé une livraison au ${planned}. En attente de validation stock/planning.`
        : `Nouveau produit détecté (réf. ${task.item_reference || '—'}) avec ${qty || '—'} pcs demandés. En attente de date prévue et validation planner.`;
    }
    return planned
      ? `Stock insuffisant pour ${task.item_reference || 'cet article'}: ${qty || '—'} pcs demandés. Livraison prévue au ${planned}. En attente de confirmation stock pour passage en A faire.`
      : `Stock insuffisant pour ${task.item_reference || 'cet article'}: ${qty || '—'} pcs demandés. En attente d'une date prévue et de confirmation stock.`;
  }

  if (task.status === 'TODO') {
    if (dateNegotiated) {
      return planned
        ? `Stock confirmé. La date de livraison a été négociée puis fixée au ${planned}. La tâche est prête pour lancement production.`
        : 'Stock confirmé après négociation. La tâche est revenue en A faire pour lancement.';
    }
    return planned
      ? `Stock disponible et validé. Date prévue: ${planned}. Tâche prête pour lancement production.`
      : 'Stock disponible et validé. Tâche prête pour lancement production.';
  }

  if (task.status === 'IN_PROGRESS') return 'Ordre de fabrication en cours d’exécution.';
  if (task.status === 'BLOCKED') return `Tâche bloquée${task.blocked_reason ? `: ${task.blocked_reason}` : '.'}`;
  if (task.status === 'DONE') return 'Production terminée. Sortie de stock appliquée.';
  return task.description || 'Suivi en cours.';
}

function buildDateNegotiationSteps(task, history) {
  const entries = Array.isArray(history) ? [...history].reverse() : [];
  const steps = [];

  if (task?.planned_date) {
    steps.push({
      label: 'Date prévue actuelle',
      detail: `${formatDate(task.planned_date, { withYear: true })}`,
    });
  }

  entries.forEach((entry) => {
    const fieldName = `${entry.field_name || ''}`.toLowerCase();
    const message = `${entry.message || ''}`.toLowerCase();
    const actor = entry.actor_name || 'Système';
    const createdAt = formatDateTime(entry.created_at);
    const oldValue = entry.old_value || '—';
    const newValue = entry.new_value || '—';

    if (fieldName.includes('planned') || fieldName.includes('date') || message.includes('date')) {
      steps.push({
        label: `${actor} a mis à jour la date`,
        detail: `${oldValue} → ${newValue} (${createdAt})`,
      });
      return;
    }

    if (entry.action_type === 'stock_confirmed' || message.includes('stock confirme') || message.includes('auto-check stock')) {
      steps.push({
        label: 'Validation planner / système',
        detail: `${entry.message || 'Stock confirmé'} (${createdAt})`,
      });
    }
  });

  return steps;
}

const TaskDetailsPanel = ({
  open,
  taskId,
  refreshSignal = 0,
  canManage = false,
  canEdit = false,
  onClose,
  onEditTask,
  onDeleteTask,
  onTaskUpdated,
}) => {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [commentBody, setCommentBody] = useState('');
  const [nextStatus, setNextStatus] = useState('');
  const [blockReason, setBlockReason] = useState('');
  const [savingAction, setSavingAction] = useState(false);

  const fetchDetail = useCallback(async () => {
    if (!taskId || !open) return;

    setLoading(true);
    setError('');
    try {
      const response = await taskAPI.getDetail(taskId);
      setDetail(response.data);
    } catch (err) {
      setError(err?.response?.data?.error || 'Impossible de charger la fiche.');
    } finally {
      setLoading(false);
    }
  }, [open, taskId]);

  useEffect(() => {
    if (open && taskId) {
      fetchDetail();
    }
  }, [open, taskId, refreshSignal, fetchDetail]);

  useEffect(() => {
    if (!open) return undefined;

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setDetail(null);
      setError('');
      setCommentBody('');
      setNextStatus('');
      setBlockReason('');
    }
  }, [open]);

  if (!open) return null;

  const task = detail?.task;
  const comments = detail?.comments || [];
  const history = detail?.history || [];
  const statusConfig = task ? TASK_STATUS_CONFIG[task.status] || TASK_STATUS_CONFIG.TODO : TASK_STATUS_CONFIG.TODO;
  const priorityConfig = task ? TASK_PRIORITY_CONFIG[task.priority] || TASK_PRIORITY_CONFIG.MEDIUM : TASK_PRIORITY_CONFIG.MEDIUM;
  const qtyDisplay = task?.quantity != null ? `${task.quantity} ${task.quantity_unit || 'pcs'}` : '—';
  const availableStatusOptions = TASK_STATUS_OPTIONS.filter(
    (option) =>
      option.value !== task?.status &&
      option.value !== 'WAITING_STOCK' &&
      task?.status !== 'WAITING_STOCK'
  );
  const operationalSummary = buildOperationalSummary(task, history);
  const dateNegotiationSteps = buildDateNegotiationSteps(task, history);

  const handleCommentSubmit = async (event) => {
    event.preventDefault();
    if (!task || !commentBody.trim()) return;

    setSavingAction(true);
    try {
      await taskAPI.addComment(task.id, commentBody.trim());
      setCommentBody('');
      await fetchDetail();
      await onTaskUpdated?.();
    } catch (err) {
      setError(err?.response?.data?.error || 'Impossible d ajouter le commentaire.');
    } finally {
      setSavingAction(false);
    }
  };

  const handleStatusApply = async () => {
    if (!task || !nextStatus) return;

    setSavingAction(true);
    setError('');
    try {
      await taskAPI.updateStatus(task.id, nextStatus, nextStatus === 'BLOCKED' ? blockReason : null);
      setNextStatus('');
      setBlockReason('');
      await fetchDetail();
      await onTaskUpdated?.();
    } catch (err) {
      setError(err?.response?.data?.error || 'Impossible de mettre a jour le statut.');
    } finally {
      setSavingAction(false);
    }
  };

  return (
    <div className="task-detail__overlay" onClick={onClose}>
      <aside className="task-detail" onClick={(event) => event.stopPropagation()}>
        <div className="task-detail__header">
          <div>
            <div className="task-detail__eyebrow">Fiche de suivi production</div>
            <h3 className="task-detail__title">{task ? task.title : 'Chargement...'}</h3>
            {task && (
              <div className="task-detail__badges">
                <span className="task-detail__badge" style={{ background: statusConfig.bg, color: statusConfig.color }}>
                  {statusConfig.label}
                </span>
                <span className="task-detail__badge" style={{ background: priorityConfig.bg, color: priorityConfig.color }}>
                  Priorite {priorityConfig.label.toLowerCase()}
                </span>
                <span className="task-detail__badge task-detail__badge--neutral">{`SP-${task.id}`}</span>
              </div>
            )}
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {loading && !task ? (
          <div className="task-detail__loading">
            <div className="task-detail__spinner" />
            <p>Chargement de la fiche...</p>
          </div>
        ) : error && !task ? (
          <div className="task-detail__error">{error}</div>
        ) : task ? (
          <>
            {error && <div className="task-detail__error">{error}</div>}

            <section className="task-panel-section task-details">
              <h4 className="task-panel-subtitle">Détails de production</h4>
              <div className="task-details-grid">
                {DETAIL_FIELDS.filter((f) => task[f.key]).map((f) => (
                  <div key={f.key} className="task-detail-item">
                    <span className="task-detail-label" aria-hidden>
                      {f.icon} {f.label}
                    </span>
                    <strong className="task-detail-value">
                      {f.format ? f.format(task[f.key], task) : task[f.key]}
                    </strong>
                  </div>
                ))}
              </div>
              <div className="task-detail__meta-strip">
                <div className="task-detail__meta-pill">
                  <span>Créé le</span>
                  <strong>{formatDateTime(task.created_at)}</strong>
                </div>
                <div className="task-detail__meta-pill">
                  <span>Dernière maj</span>
                  <strong>{formatRelativeDate(task.updated_at || task.created_at)}</strong>
                </div>
                <div className="task-detail__meta-pill">
                  <span>Quantité</span>
                  <strong>{qtyDisplay}</strong>
                </div>
              </div>
              {task.expected_action && (
                <div className="task-detail__expected-action">
                  <strong>Action attendue:</strong> {task.expected_action}
                </div>
              )}
            </section>

            <section className="task-detail__section">
              <div className="task-detail__section-head">
                <h4>Résumé métier</h4>
                <span>{formatRelativeDate(task.updated_at || task.created_at)}</span>
              </div>
              <div className="task-detail__description task-detail__description--emphasis">{operationalSummary}</div>
            </section>

            <section className="task-detail__section">
              <div className="task-detail__section-head">
                <h4>Négociation date</h4>
                <span>{dateNegotiationSteps.length}</span>
              </div>
              <div className="task-detail__timeline">
                {dateNegotiationSteps.length === 0 ? (
                  <div className="task-detail__empty">Aucune négociation de date enregistrée.</div>
                ) : (
                  dateNegotiationSteps.map((step, index) => (
                    <div key={`${step.label}-${index}`} className="task-detail__timeline-item task-detail__timeline-item--history">
                      <span className="task-detail__history-dot" />
                      <div>
                        <div className="task-detail__timeline-head">
                          <strong>{step.label}</strong>
                        </div>
                        <p>{step.detail}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {task.description && (
              <section className="task-detail__section">
                <div className="task-detail__section-head">
                  <h4>Consigne brute</h4>
                </div>
                <div className="task-detail__description">{task.description || 'Aucune consigne ou ligne specifique.'}</div>
              </section>
            )}

            <section className="task-detail__section">
              <div className="task-detail__section-head">
                <h4>Actions</h4>
              </div>
              <div className="task-detail__button-row">
                {canEdit && (
                  <>
                    <button type="button" className="btn btn-secondary" onClick={() => onEditTask?.(task)}>
                      Modifier la fiche
                    </button>
                    <button type="button" className="btn btn-secondary task-detail__danger-btn" onClick={() => onDeleteTask?.(task.id)}>
                      Supprimer la commande
                    </button>
                  </>
                )}
              </div>
              {canManage && (
                <div style={{ marginTop: '1rem' }}>
                  <h4 style={{ marginBottom: '0.5rem', fontSize: '0.85rem', color: '#6b7280', textTransform: 'uppercase' }}>Changer le statut</h4>
                  <div className="task-detail__action-row">
                    <select value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>
                      <option value="">Nouveau statut...</option>
                      {availableStatusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={!nextStatus || savingAction || (nextStatus === 'BLOCKED' && !blockReason.trim())}
                      onClick={handleStatusApply}
                    >
                      {savingAction ? 'Mise a jour...' : 'Appliquer'}
                    </button>
                  </div>
                  {nextStatus === 'BLOCKED' && (
                    <div className="form-group" style={{ marginBottom: 0, marginTop: '0.5rem' }}>
                      <label>Motif du blocage</label>
                      <textarea rows={3} value={blockReason} onChange={(event) => setBlockReason(event.target.value)} />
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="task-detail__section">
              <div className="task-detail__section-head">
                <h4>Commentaires</h4>
                <span>{comments.length}</span>
              </div>
              <form className="task-detail__comment-form" onSubmit={handleCommentSubmit}>
                <textarea
                  rows={3}
                  value={commentBody}
                  onChange={(event) => setCommentBody(event.target.value)}
                  placeholder="Ajouter un commentaire de suivi..."
                />
                <button type="submit" className="btn btn-primary" disabled={!commentBody.trim() || savingAction}>
                  Ajouter
                </button>
              </form>
              <div className="task-detail__timeline">
                {comments.length === 0 ? (
                  <div className="task-detail__empty">Aucun commentaire pour le moment.</div>
                ) : (
                  comments.map((comment) => (
                    <div key={comment.id} className="task-detail__timeline-item">
                      <span className="task-detail__avatar">{getInitials(comment.author_name)}</span>
                      <div>
                        <div className="task-detail__timeline-head">
                          <strong>{comment.author_name || 'Utilisateur'}</strong>
                          <span>{formatDateTime(comment.created_at)}</span>
                        </div>
                        <p>{comment.body}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="task-detail__section">
              <div className="task-detail__section-head">
                <h4>Historique</h4>
                <span>{history.length}</span>
              </div>
              <div className="task-detail__timeline">
                {history.length === 0 ? (
                  <div className="task-detail__empty">Aucun historique enregistre.</div>
                ) : (
                  history.map((entry) => (
                    <div key={entry.id} className="task-detail__timeline-item task-detail__timeline-item--history">
                      <span className="task-detail__history-dot" />
                      <div>
                        <div className="task-detail__timeline-head">
                          <strong>{entry.message || entry.action_type}</strong>
                          <span>{formatDateTime(entry.created_at)}</span>
                        </div>
                        <p>
                          {entry.actor_name ? `${entry.actor_name} ` : ''}
                          {entry.old_value || entry.new_value
                            ? `(${entry.old_value || '—'} → ${entry.new_value || '—'})`
                            : 'a realise cette action.'}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </>
        ) : null}
      </aside>
    </div>
  );
};

export default TaskDetailsPanel;
