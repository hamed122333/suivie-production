import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ARTICLE_CATEGORY_CONFIG, TASK_PRIORITY_CONFIG, TASK_STATUS_CONFIG } from '../constants/task';
import { taskAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatDateTime, formatNumber, getInitials } from '../utils/formatters';
import TaskTypeToggle from './TaskTypeToggle';
import './TaskDetailsPanel.css';

/* ─── pure helpers ───────────────────────────────────────────────────────── */

function fmtVal(v) {
  if (v == null || v === '') return v;
  const s = `${v}`.trim();
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }
  return s;
}

function getPrefix(ref) {
  if (!ref) return '';
  const u = ref.toUpperCase();
  const dash = u.indexOf('-');
  return dash > 0 ? u.slice(0, dash) : u.slice(0, 2);
}

function daysFromNow(dateStr) {
  if (!dateStr) return null;
  return Math.ceil(
    (new Date(dateStr).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000
  );
}

/* Build a conversation thread from history entries related to date negotiation */
function buildNegotThread(history) {
  const isDateRelated = (e) => {
    const a = (e.action_type || '').toLowerCase();
    const f = (e.field_name  || '').toLowerCase();
    const m = (e.message     || '').toLowerCase();
    return a === 'date_negotiation'
      || f.includes('proposed_delivery')
      || f.includes('planned_date')
      || m.includes('proposé une date')
      || m.includes('date proposée')
      || m.includes('date acceptée')
      || m.includes('date refusée')
      || m.includes('date négociée')
      || m.includes('date de livraison');
  };
  // Reverse so oldest is first (chat order: top = oldest, bottom = newest)
  return [...history].filter(isDateRelated).reverse();
}

/* ─── status config ──────────────────────────────────────────────────────── */
const NEGOT_CFG = {
  PENDING_PLANNER_REVIEW:    { label: 'En attente planner',    color: '#7c3aed', bg: '#f5f3ff' },
  PENDING_COMMERCIAL_REVIEW: { label: 'En attente commercial', color: '#c2410c', bg: '#fff7ed' },
  ACCEPTED:                  { label: '✓ Date validée',        color: '#15803d', bg: '#f0fdf4' },
  REJECTED:                  { label: 'Refusée',               color: '#b91c1c', bg: '#fef2f2' },
};

const HISTORY_PREVIEW = 5;

/* ─── component ──────────────────────────────────────────────────────────── */
const TaskDetailsPanel = ({
  open,
  taskId,
  refreshSignal = 0,
  canManage  = false,
  canEdit    = false,
  canConfirmPredictive = false,
  onClose,
  onEditTask,
  onDeleteTask,
  onTaskUpdated,
  onConfirmPredictive,
}) => {
  const { isPlanner, isCommercial, canMarkDelivered } = useAuth();

  const [detail,         setDetail]         = useState(null);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState('');
  const [savingAction,   setSavingAction]   = useState(false);
  const [dateProposal,   setDateProposal]   = useState('');
  const [proposeOpen,    setProposeOpen]    = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  /* ─ fetch ─ */
  const fetchDetail = useCallback(async () => {
    if (!taskId || !open) return;
    setLoading(true); setError('');
    try {
      const res = await taskAPI.getDetail(taskId);
      setDetail(res.data);
    } catch (err) {
      setError(err?.response?.data?.error || 'Impossible de charger la fiche.');
    } finally { setLoading(false); }
  }, [open, taskId]);

  useEffect(() => { if (open && taskId) fetchDetail(); }, [open, taskId, refreshSignal, fetchDetail]);

  useEffect(() => {
    if (!open) return undefined;
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) { setDetail(null); setError(''); setDateProposal(''); setProposeOpen(false); setShowAllHistory(false); }
  }, [open]);

  const task    = detail?.task;
  // Memoize the raw array so it's a stable reference for downstream useMemo hooks
  const history = useMemo(() => detail?.history || [], [detail]);

  /* derived — computed before any early return so hook order is stable */
  const statusCfg   = TASK_STATUS_CONFIG[task?.status]    || TASK_STATUS_CONFIG.TODO;
  const priorityCfg = TASK_PRIORITY_CONFIG[task?.priority] || TASK_PRIORITY_CONFIG.MEDIUM;
  const prefix      = getPrefix(task?.item_reference);
  const catCfg      = ARTICLE_CATEGORY_CONFIG[prefix] || null;
  const days        = daysFromNow(task?.planned_date);
  const daysLabel   = days == null ? null : days < 0 ? `${Math.abs(days)}j retard` : days === 0 ? "Aujourd'hui" : `J−${days}`;

  const negStatus = task?.date_negotiation_status;
  const negCfg    = negStatus ? NEGOT_CFG[negStatus] : null;
  const plannerCanConfirm    = isPlanner    && negStatus === 'PENDING_PLANNER_REVIEW';
  const commercialCanConfirm = isCommercial && negStatus === 'PENDING_COMMERCIAL_REVIEW';
  const myTurnToAct          = plannerCanConfirm || commercialCanConfirm;
  const canAct               = isCommercial || isPlanner;

  const negotThread    = useMemo(() => buildNegotThread(history), [history]);
  const visibleHistory = useMemo(
    () => showAllHistory ? [...history].reverse() : [...history].reverse().slice(0, HISTORY_PREVIEW),
    [history, showAllHistory]
  );

  if (!open) return null;

  /* ─ actions ─ */
  const handlePropose = async () => {
    if (!task || !dateProposal) { setError('Veuillez choisir une date.'); return; }
    setSavingAction(true); setError('');
    try {
      await taskAPI.dateNegotiation(task.id, { action: 'PROPOSE', proposedDate: dateProposal, comment: null });
      setDateProposal(''); setProposeOpen(false);
      await fetchDetail(); await onTaskUpdated?.();
    } catch (err) {
      setError(err?.response?.data?.error || 'Impossible de proposer cette date.');
    } finally { setSavingAction(false); }
  };

  const handleAccept = async () => {
    if (!task) return;
    setSavingAction(true); setError('');
    try {
      await taskAPI.dateNegotiation(task.id, { action: 'ACCEPT', proposedDate: null, comment: null });
      await fetchDetail(); await onTaskUpdated?.();
    } catch (err) {
      setError(err?.response?.data?.error || 'Impossible de confirmer la date.');
    } finally { setSavingAction(false); }
  };

  /* ═══════════════════════════════════════════════════════════ render ═══ */
  return (
    <div className="task-detail__overlay" onClick={onClose}>
      <aside className="task-detail" onClick={(e) => e.stopPropagation()}>

        {/* ╔══════════════════════════════════════════ HEADER ══════════╗ */}
        <div className="task-detail__header">
          <div className="task-detail__header-left">
            <div className="task-detail__title-row">
              {catCfg && (
                <span className="task-detail__prefix-badge" style={{ background: catCfg.bg, color: catCfg.color }}>
                  {prefix}
                </span>
              )}
              <h3 className="task-detail__title">{task ? task.title : 'Chargement...'}</h3>
            </div>

            {task && (
              <div className="task-detail__badges">
                <span className="task-detail__badge" style={{ background: statusCfg.bg, color: statusCfg.color }}>
                  {statusCfg.label}
                </span>
                <span className="task-detail__badge" style={{ background: priorityCfg.bg, color: priorityCfg.color }}>
                  {priorityCfg.label}
                </span>
                {task.task_type === 'PREDICTIVE' && (
                  <span className="task-detail__badge task-detail__badge--info">Prévisionnel</span>
                )}
              </div>
            )}
            {task?.description && <p className="task-detail__subtitle">{task.description}</p>}
          </div>

          <div className="task-detail__header-actions">
            {canEdit && (
              <>
                <button type="button" className="btn btn-secondary tdp-icon-btn" title="Modifier" onClick={() => onEditTask?.(task)}>Modifier</button>
                <button type="button" className="btn btn-secondary tdp-icon-btn task-detail__danger-btn" title="Supprimer" onClick={() => onDeleteTask?.(task.id)}>Supprimer</button>
              </>
            )}
            <button type="button" className="modal-close" onClick={onClose}>Fermer</button>
          </div>
        </div>

        {/* loading / error states */}
        {loading && !task ? (
          <div className="task-detail__loading"><div className="task-detail__spinner" /><p>Chargement...</p></div>
        ) : error && !task ? (
          <div className="task-detail__error" style={{ margin: '1rem 1.2rem' }}>{error}</div>
        ) : task ? (
          <>
            {error && <div className="task-detail__error" style={{ margin: '0.5rem 1.2rem 0' }}>{error}</div>}

            {/* ╔══════════════════════════════════════ KPI STRIP ════════╗ */}
            <div className="task-detail__kpi-strip">
              <div className="task-detail__kpi">
                <span>Client</span>
                <strong title={task.client_name}>{task.client_name || '—'}</strong>
              </div>
              <div className="task-detail__kpi">
                <span>Référence</span>
                <strong className="task-detail__kpi-mono">{task.item_reference || '—'}</strong>
              </div>
              <div className="task-detail__kpi">
                <span>Quantité</span>
                <strong>{formatNumber(task.quantity)} <em>{task.quantity_unit || 'pcs'}</em></strong>
              </div>
              <div className={`task-detail__kpi${days != null && days < 0 ? ' task-detail__kpi--danger' : days != null && days <= 2 ? ' task-detail__kpi--warn' : ''}`}>
                <span>Livraison</span>
                <strong>{task.planned_date ? formatDate(task.planned_date) : '—'}</strong>
                {daysLabel && <small className="task-detail__kpi-sub">{daysLabel}</small>}
              </div>
            </div>

            {/* ╔══════════════════════════════════ STOCK SECTION ════════╗ */}
            {(task.stock_available_at_creation != null || task.stock_deficit != null || task.stock_allocated != null) && (
              <section className="task-detail__section">
                <div className="task-detail__section-head">
                  <h4>📦 Stock & Approvisionnement</h4>
                  {task.priority_order != null && (
                    <span className="tdp-fifo-pill">FIFO #{task.priority_order}</span>
                  )}
                </div>

                {/* allocation bar */}
                {task.quantity > 0 && (
                  <div className="task-detail__stock-bar-wrap">
                    <div className="task-detail__stock-bar">
                      <div
                        className={`task-detail__stock-bar-fill ${Number(task.stock_deficit || 0) > 0 ? 'task-detail__stock-bar-fill--partial' : 'task-detail__stock-bar-fill--full'}`}
                        style={{ width: `${Math.min(100, (Number(task.stock_allocated || 0) / Number(task.quantity)) * 100)}%` }}
                      />
                    </div>
                    <div className="task-detail__stock-bar-labels">
                      <span>{formatNumber(task.stock_allocated || 0)} alloués</span>
                      <span>{formatNumber(task.quantity)} demandés</span>
                    </div>
                  </div>
                )}

                {/* numbers grid */}
                <div className="task-details-grid">
                  {task.stock_available_at_creation != null && (
                    <div className="task-detail-item">
                      <span className="task-detail-label">Stock global</span>
                      <strong className="task-detail-value">{formatNumber(task.stock_available_at_creation)} {task.quantity_unit || 'pcs'}</strong>
                    </div>
                  )}
                  {task.stock_allocated != null && (
                    <div className="task-detail-item">
                      <span className={`task-detail-label ${Number(task.stock_allocated) >= Number(task.quantity) ? 'task-detail-label--success' : ''}`}>Alloué</span>
                      <strong className={`task-detail-value ${Number(task.stock_allocated) >= Number(task.quantity) ? 'task-detail-value--success' : ''}`}>
                        {formatNumber(task.stock_allocated)} {task.quantity_unit || 'pcs'}
                      </strong>
                    </div>
                  )}
                  {Number(task.stock_deficit) > 0 && (
                    <div className="task-detail-item">
                      <span className="task-detail-label task-detail-label--danger">⚠ Manquant</span>
                      <strong className="task-detail-value task-detail-value--danger">{formatNumber(task.stock_deficit)} {task.quantity_unit || 'pcs'}</strong>
                    </div>
                  )}
                </div>

                {task.priority_order > 1 && (
                  <div className="task-detail__stock-note">
                    D'autres commandes sur cette référence sont servies en priorité (FIFO par date de livraison).
                  </div>
                )}

                {isPlanner && (
                  <TaskTypeToggle task={task} isPlanner={isPlanner}
                    onTypeChanged={async () => { await fetchDetail(); await onTaskUpdated?.(); }} />
                )}

                {task.task_type === 'PREDICTIVE' && canConfirmPredictive && onConfirmPredictive && (
                  <button type="button" className="btn btn-primary" style={{ width: '100%', marginTop: '0.65rem' }}
                    disabled={savingAction}
                    onClick={async () => {
                      setSavingAction(true);
                      try { await onConfirmPredictive(task.id); await fetchDetail(); }
                      catch (err) { setError(err?.response?.data?.error || 'Impossible de confirmer.'); }
                      finally { setSavingAction(false); }
                    }}>
                    {savingAction ? 'Confirmation…' : 'Confirmer la commande prévisionnelle'}
                  </button>
                )}

                {canMarkDelivered && task.status === 'DONE' && (
                  <button type="button" className="btn btn-primary"
                    style={{ width: '100%', marginTop: '0.65rem', background: '#374151' }}
                    disabled={savingAction}
                    onClick={async () => {
                      setSavingAction(true);
                      try { await taskAPI.markDelivered(task.id); await fetchDetail(); onTaskUpdated?.(); }
                      catch (err) { setError(err?.response?.data?.error || 'Impossible de marquer livré.'); }
                      finally { setSavingAction(false); }
                    }}>
                    {savingAction ? 'Enregistrement…' : 'Marquer livré'}
                  </button>
                )}
              </section>
            )}

            {/* ╔══════════════════════════════ DATE NÉGOCIATION ═════════╗ */}
            {canAct && (
              <section className="task-detail__section">
                <div className="task-detail__section-head">
                  <h4>🗓 Négociation date</h4>
                  {negCfg
                    ? <span className="tdp-negot-status-pill" style={{ background: negCfg.bg, color: negCfg.color }}>{negCfg.label}</span>
                    : <span className="tdp-negot-status-pill">Non démarrée</span>
                  }
                </div>

                {/* ── Thread (messagerie) ── */}
                {negotThread.length > 0 && (
                  <div className="tdp-thread">
                    {negotThread.map((entry) => {
                      const side = entry.actor_role === 'commercial' ? 'commercial' : 'planner';
                      return (
                        <div key={entry.id} className={`tdp-bubble tdp-bubble--${side}`}>
                          <div className="tdp-bubble__meta">
                            <span className="tdp-bubble__actor">{entry.actor_name || 'Système'}</span>
                            <time className="tdp-bubble__time">{formatDateTime(entry.created_at)}</time>
                          </div>
                          <div className="tdp-bubble__body">
                            <span>{entry.message || entry.action_type}</span>
                            {entry.new_value && (
                              <strong className="tdp-bubble__date">📅 {fmtVal(entry.new_value)}</strong>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── Pending proposal card ── */}
                {task.proposed_delivery_date && myTurnToAct && !proposeOpen && (
                  <div className="tdp-pending-card">
                    <div className="tdp-pending-card__left">
                      <div className="tdp-pending-card__date">📅 {formatDate(task.proposed_delivery_date)}</div>
                      <div className="tdp-pending-card__sub">
                        proposé par {task.planned_by_name
                          ? `${task.planned_by_name} (${task.proposed_by_role === 'planner' ? 'planificateur' : 'commercial'})`
                          : (task.proposed_by_role === 'planner' ? 'le planificateur' : 'le commercial')}
                      </div>
                    </div>
                    <div className="tdp-pending-card__actions">
                      <button
                        type="button"
                        className="tdp-btn tdp-btn--accept"
                        disabled={savingAction}
                        onClick={handleAccept}
                      >
                        {savingAction ? '…' : 'Accepter'}
                      </button>
                      <button
                        type="button"
                        className="tdp-btn tdp-btn--counter"
                        disabled={savingAction}
                        onClick={() => setProposeOpen(true)}
                      >
                        Contre-proposer
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Accepted state ── */}
                {negStatus === 'ACCEPTED' && !proposeOpen && (
                  <div className="tdp-accepted-bar">
                    <span>✓ Date validée · {task.planned_date ? formatDate(task.planned_date) : '—'}</span>
                    <button type="button" className="tdp-btn-link" onClick={() => setProposeOpen(true)}>
                      Modifier
                    </button>
                  </div>
                )}

                {/* ── Contre-proposition / modification (ouverte explicitement) ──
                    La proposition initiale se fait désormais au drag Hors Stock PF → À Préparer. */}
                {proposeOpen && (
                  <div className="tdp-propose-form">
                    <label className="tdp-propose-form__label">
                      Proposer une nouvelle date
                    </label>
                    <div className="tdp-propose-form__row">
                      <input
                        type="date"
                        className="task-detail__date-input"
                        value={dateProposal}
                        onChange={(e) => setDateProposal(e.target.value)}
                      />
                      <button
                        type="button"
                        className="tdp-btn tdp-btn--send"
                        disabled={savingAction || !dateProposal}
                        onClick={handlePropose}
                      >
                        {savingAction ? '…' : 'Envoyer'}
                      </button>
                      {proposeOpen && (
                        <button type="button" className="tdp-btn-link" onClick={() => { setProposeOpen(false); setDateProposal(''); }}>
                          Annuler
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Waiting on other party ── */}
                {task.proposed_delivery_date && !myTurnToAct && negStatus !== 'ACCEPTED' && !proposeOpen && (
                  <div className="tdp-waiting-bar">
                    En attente de réponse · date proposée : <strong>{formatDate(task.proposed_delivery_date)}</strong>
                    <button type="button" className="tdp-btn-link" style={{ marginLeft: '0.5rem' }} onClick={() => setProposeOpen(true)}>
                      Modifier
                    </button>
                  </div>
                )}
              </section>
            )}

            {/* ╔═══════════════════════════════════════ HISTORIQUE ══════╗ */}
            <section className="task-detail__section">
              <div className="task-detail__section-head">
                <h4>Historique</h4>
                <span>{history.length} action{history.length !== 1 ? 's' : ''}</span>
              </div>

              {/* actors */}
              <div className="task-detail__actors-strip">
                {task.created_by_name && (
                  <div className="task-detail__actor task-detail__actor--commercial">
                    <span className="task-detail__actor-avatar">{getInitials(task.created_by_name)}</span>
                    <div>
                      <strong>{task.created_by_name}</strong>
                      <span>Commercial</span>
                    </div>
                  </div>
                )}
                {task.planned_by_name && task.planned_by_name !== task.created_by_name && (
                  <div className="task-detail__actor task-detail__actor--planner">
                    <span className="task-detail__actor-avatar">{getInitials(task.planned_by_name)}</span>
                    <div>
                      <strong>{task.planned_by_name}</strong>
                      <span>Planificateur</span>
                    </div>
                  </div>
                )}
              </div>

              {/* timeline */}
              <div className="task-detail__timeline">
                {history.length === 0 ? (
                  <div className="task-detail__empty">Aucune action enregistrée.</div>
                ) : (
                  visibleHistory.map((entry) => {
                    const role = entry.actor_role;
                    const roleLabel = role === 'planner' || role === 'super_admin' ? 'Planificateur'
                      : role === 'commercial' ? 'Commercial' : null;
                    return (
                      <div key={entry.id} className="task-detail__timeline-item task-detail__timeline-item--history">
                        <span className={`task-detail__history-dot task-detail__history-dot--${
                          role === 'commercial' ? 'commercial'
                          : role === 'planner' || role === 'super_admin' ? 'planner'
                          : 'system'
                        }`} />
                        <div style={{ flex: 1 }}>
                          <div className="task-detail__timeline-head">
                            <span className="task-detail__history-actor">
                              {entry.actor_name || 'Système'}
                              {roleLabel && (
                                <span className={`task-detail__history-role task-detail__history-role--${role === 'commercial' ? 'commercial' : 'planner'}`}>
                                  {roleLabel}
                                </span>
                              )}
                            </span>
                            <time className="task-detail__history-time">{formatDateTime(entry.created_at)}</time>
                          </div>
                          <p className="task-detail__history-msg">{entry.message || entry.action_type}</p>
                          {entry.old_value != null && entry.new_value != null && (
                            <p className="task-detail__history-diff">
                              <span className="task-detail__history-old">{fmtVal(entry.old_value)}</span>
                              <span aria-hidden> → </span>
                              <span className="task-detail__history-new">{fmtVal(entry.new_value)}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {history.length > HISTORY_PREVIEW && (
                <button type="button" className="tdp-history-toggle" onClick={() => setShowAllHistory(p => !p)}>
                  {showAllHistory
                    ? 'Réduire'
                    : `${history.length - HISTORY_PREVIEW} action${history.length - HISTORY_PREVIEW > 1 ? 's' : ''} précédente${history.length - HISTORY_PREVIEW > 1 ? 's' : ''}`}
                </button>
              )}
            </section>
          </>
        ) : null}
      </aside>
    </div>
  );
};

export default TaskDetailsPanel;
