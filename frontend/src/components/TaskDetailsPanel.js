import React, { useCallback, useEffect, useState } from 'react';
import { TASK_PRIORITY_CONFIG, TASK_STATUS_CONFIG, TASK_STATUS_OPTIONS } from '../constants/task';
import { WORKSPACE_TYPE_CONFIG } from '../constants/workspace';
import { taskAPI } from '../services/api';
import { formatDate, formatDateTime, formatNumber, formatRelativeDate, getInitials } from '../utils/formatters';
import './TaskDetailsPanel.css';

const DETAIL_FIELDS = [
  { key: 'client_name', label: 'Client' },
  { key: 'order_code', label: 'Code commande' },
  { key: 'item_reference', label: 'Reference article' },
  {
    key: 'quantity',
    label: 'Quantite',
    render: (task) => (task.quantity != null ? `${formatNumber(task.quantity)} ${task.quantity_unit || ''}`.trim() : '—'),
  },
  { key: 'due_date', label: 'Echeance', render: (task) => formatDate(task.due_date, { withYear: true }) },
  { key: 'planned_date', label: 'Planifiee', render: (task) => formatDate(task.planned_date, { withYear: true }) },
  { key: 'production_line', label: 'Ligne' },
  { key: 'machine', label: 'Machine' },
  { key: 'workshop', label: 'Atelier' },
  { key: 'assigned_to_name', label: 'Responsable' },
  { key: 'workspace_name', label: 'Espace' },
  { key: 'workspace_type', label: 'Type espace', render: (task) => WORKSPACE_TYPE_CONFIG[task.workspace_type]?.label },
];

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

            <section className="task-detail__section">
              <div className="task-detail__section-head">
                <h4>Resume</h4>
                <span>{formatRelativeDate(task.updated_at || task.created_at)}</span>
              </div>
              <div className="task-detail__description" style={{ fontSize: '1.2em', fontWeight: '500', marginBottom: '1.5rem', background: '#f8f9fa', padding: '1rem', borderRadius: '4px' }}>
                {task.description || 'Aucune consigne ou ligne specifique.'}
              </div>

              <div className="task-detail__meta-grid">
                {DETAIL_FIELDS.map((field) => {
                  const rawValue = field.render ? field.render(task) : task[field.key];
                  if (!rawValue || rawValue === '—') return null; // Hide empty fields
                  return (
                    <div key={field.key} className="task-detail__meta-item">
                      <span>{field.label}</span>
                      <strong>{rawValue}</strong>
                    </div>
                  );
                })}
              </div>

              {(task.notes || task.expected_action || task.blocked_reason) && (
                <div className="task-detail__stack">
                  {task.notes && (
                    <div className="task-detail__note">
                      <span>Notes operatoires</span>
                      <p>{task.notes}</p>
                    </div>
                  )}
                  {task.expected_action && (
                    <div className="task-detail__note">
                      <span>Action attendue</span>
                      <p>{task.expected_action}</p>
                    </div>
                  )}
                  {task.blocked_reason && (
                    <div className="task-detail__note task-detail__note--danger">
                      <span>Motif de blocage</span>
                      <p>{task.blocked_reason}</p>
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="task-detail__section">
              <div className="task-detail__section-head">
                <h4>Actions</h4>
              </div>
              <div className="task-detail__action-row" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {canEdit && (
                  <>
                    <button type="button" className="btn btn-secondary" onClick={() => onEditTask?.(task)}>
                      Modifier la fiche
                    </button>
                    <button type="button" className="btn btn-secondary" style={{ color: 'red', borderColor: '#ffe0e0', backgroundColor: '#fff0f0' }} onClick={() => onDeleteTask?.(task.id)}>
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
                      {TASK_STATUS_OPTIONS.filter((option) => option.value !== task.status).map((option) => (
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
