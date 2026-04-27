import React from 'react';
import { TASK_PRIORITY_CONFIG, TASK_STATUS_CONFIG, getTaskKey } from '../constants/task';
import { formatDate, formatRelativeDate, getInitials } from '../utils/formatters';
import './TaskCard.css';

function buildShortOpsMessage(task) {
  const qty = Number(task?.quantity || 0);
  const status = task?.status;
  const hasPlannedDate = Boolean(task?.planned_date);
  const expectedAction = `${task?.expected_action || ''}`.toUpperCase();

  if (status === 'WAITING_STOCK') {
    if (expectedAction.includes('NEW_PRODUCT')) {
      return hasPlannedDate
        ? `Nouveau produit en attente stock • Liv. prévue ${formatDate(task.planned_date)}`
        : 'Nouveau produit en attente stock';
    }
    return hasPlannedDate
      ? `Stock insuffisant • ${qty || '—'} pcs demandés • Liv. prévue ${formatDate(task.planned_date)}`
      : `Stock insuffisant • ${qty || '—'} pcs demandés`;
  }

  if (status === 'TODO') {
    return hasPlannedDate
      ? `Stock validé • Prêt à lancer • Date confirmée ${formatDate(task.planned_date)}`
      : 'Stock validé • Prêt à lancer';
  }

  if (status === 'BLOCKED') return 'Bloquée • Action planner requise';
  if (status === 'DONE') return 'Terminé • Sortie stock appliquée';
  if (status === 'IN_PROGRESS') return 'En production';
  return null;
}

function getDateConfirmationBadge(task) {
  if (task?.status !== 'WAITING_STOCK') return null;

  const negotiationStatus = task?.date_negotiation_status;
  const proposedByRole = `${task?.proposed_by_role || ''}`.toLowerCase();

  // Cas 1: dès que la négociation est ACCEPTED, la date est confirmée.
  if (negotiationStatus === 'ACCEPTED') {
    return {
      className: 'task-card__date-check--ok',
      icon: '✓',
      text: proposedByRole === 'planner' ? 'Date modifiée confirmée' : 'Date confirmée',
    };
  }

  // Cas 2: le planner a modifié la date, attente de validation commercial.
  if (negotiationStatus === 'PENDING_COMMERCIAL_REVIEW' && proposedByRole === 'planner') {
    return { className: 'task-card__date-check--info', icon: '●', text: 'Date modifiée (attente commercial)' };
  }

  return { className: 'task-card__date-check--ko', icon: '✕', text: 'Date non confirmée' };
}

const TaskCard = ({ task, onOpen, isDragging }) => {
  if (!task) return null;
  const priority = TASK_PRIORITY_CONFIG[task.priority] || TASK_PRIORITY_CONFIG.MEDIUM;
  const status = TASK_STATUS_CONFIG[task.status] || TASK_STATUS_CONFIG.TODO;
  const when = formatRelativeDate(task.updated_at || task.created_at);
  // Éviter la duplication si le titre contient déjà le nom du client (ex: "PLASTICUM • CI0251")
  const titleIncludesClient = task.client_name && typeof task.title === 'string' && task.title.includes(task.client_name);
  const subtitleClientName = titleIncludesClient ? null : task.client_name;
  const subtitle = [subtitleClientName, task.order_code].filter(Boolean).join(' • ');

  // Eviter la duplication de la quantité (si elle est détaillée dans la description "pcs commandés")
  const hideFooterQuantity = task.description && typeof task.description === 'string' && task.description.includes('commandés');

  const showReference = task.item_reference && task.item_reference !== task.title;
  const shortOpsMessage = buildShortOpsMessage(task);
  const dateCheck = getDateConfirmationBadge(task);

  return (
    <article
      className={`task-card ${isDragging ? 'task-card--dragging' : ''} ${onOpen ? 'task-card--interactive' : ''}`}
      style={{ borderLeftColor: priority.color }}
      onClick={() => onOpen?.(task)}
    >
      <div className="task-card__top">
        <div className="task-card__meta">
          <span className="task-card__key">{getTaskKey(task)}</span>
          <span className={`task-card__priority task-card__priority--${(task.priority || 'MEDIUM').toLowerCase()}`}>
            <span aria-hidden>{priority.icon}</span> {priority.label}
          </span>
        </div>
        <span className="task-card__status" style={{ background: status.bg, color: status.color }}>
          {status.shortLabel}
        </span>
      </div>

      <h4 className="task-card__title">{task.title}</h4>
      {subtitle && <div className="task-card__subtitle">{subtitle}</div>}

      {shortOpsMessage ? <p className="task-card__desc">{shortOpsMessage}</p> : task.description && <p className="task-card__desc">{task.description}</p>}

      {dateCheck && (
        <div className={`task-card__date-check ${dateCheck.className}`} title={dateCheck.text}>
          <span className="task-card__date-check-icon" aria-hidden>
            {dateCheck.icon}
          </span>
          <span>{dateCheck.text}</span>
        </div>
      )}

      <div className="task-card__facts">
        {showReference && <span className="task-card__fact-ref">Réf {task.item_reference}</span>}
        {task.production_line && <span className="task-card__fact-line">{task.production_line}</span>}
        {task.due_date && <span className="task-card__fact-date">Echéance {formatDate(task.due_date)}</span>}
      </div>

      {task.blocked_reason && (
        <div className="task-card__blocked">
          <span aria-hidden>⚠</span>
          <div>
            <strong>Blocage</strong>
            <p>{task.blocked_reason}</p>
          </div>
        </div>
      )}

      <div className="task-card__footer">
        <div className="task-card__footer-copy">
          <span className="task-card__time">{when}</span>
          {!hideFooterQuantity && task.quantity != null && (
            <span className="task-card__quantity">
              {task.quantity} {task.quantity_unit || 'pcs'}
            </span>
          )}
        </div>
        <span className="task-card__avatar" title={task.created_by_name || 'Non assigné'}>
          {getInitials(task.created_by_name)}
        </span>
      </div>
    </article>
  );
};

export default TaskCard;
