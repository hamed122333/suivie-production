import React from 'react';
import {
  TASK_PRIORITY_CONFIG,
  TASK_STATUS_CONFIG,
  TASK_TYPE_CONFIG,
  WAITING_STOCK_ALERT_DAYS,
  getTaskKey,
  getArticleCategory,
  getCoveragePercent,
} from '../constants/task';
import { formatDate, formatRelativeDate, getInitials } from '../utils/formatters';
import StockAllocationBadge from './StockAllocationBadge';
import './TaskCard.css';

function getDaysUntilPlannedDate(task) {
  if (!task?.planned_date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(task.planned_date) - today) / 86400000);
}

function buildShortOpsMessage(task) {
  const qty = Number(task?.quantity || 0);
  const status = task?.status;
  const expectedAction = `${task?.expected_action || ''}`.toUpperCase();

  if (status === 'WAITING_STOCK') {
    const deficit = task?.stock_deficit != null ? Number(task.stock_deficit) : null;

    if (!task?.is_known_product || expectedAction.includes('NEW_PRODUCT') || expectedAction.includes('STOCK_MISSING')) {
      return 'Nouveau produit — sans référence stock';
    }

    if (deficit !== null && deficit > 0) {
      return `Stock insuffisant — ${deficit} manquants sur ${qty}`;
    }

    return `Stock insuffisant — ${qty || '—'} pcs demandés`;
  }

  if (status === 'TODO') {
    if (task?.task_type === 'PREDICTIVE') return 'Commande prévisionnelle';
    return qty > 0 ? `Stock validé — ${qty} pcs` : 'Stock validé';
  }

  if (status === 'BLOCKED') return 'Bloquée — action requise';
  if (status === 'DONE') return 'Terminé';
  if (status === 'IN_PROGRESS') return 'En production';
  return null;
}

function getDateConfirmationBadge(task) {
  const negotiationStatus = task?.date_negotiation_status;
  const proposedByRole = `${task?.proposed_by_role || ''}`.toLowerCase();
  const proposedDate = task?.proposed_delivery_date;
  const dateSuffix = proposedDate ? ` (${formatDate(proposedDate)})` : '';

  if (task?.urgent_date_pending && task?.status !== 'WAITING_STOCK') {
    return {
      className: 'task-card__date-check--warn',
      icon: '!',
      text: `Date urgente — approbation planner requise${task.due_date ? ` (${formatDate(task.due_date)})` : ''}`,
    };
  }

  if (task?.status !== 'WAITING_STOCK') return null;

  if (negotiationStatus === 'ACCEPTED') {
    return {
      className: 'task-card__date-check--ok',
      icon: '✓',
      text: proposedByRole === 'planner' ? `Date modifiée confirmée${dateSuffix}` : `Date confirmée${dateSuffix}`,
    };
  }

  if (negotiationStatus === 'PENDING_COMMERCIAL_REVIEW' && proposedByRole === 'planner') {
    const dateLabel = proposedDate ? formatDate(proposedDate) : '—';
    return { className: 'task-card__date-check--info', icon: '●', text: `Planner → ${dateLabel}` };
  }

  if (negotiationStatus === 'PENDING_PLANNER_REVIEW' && proposedByRole === 'commercial') {
    const dateLabel = proposedDate ? formatDate(proposedDate) : '—';
    return { className: 'task-card__date-check--ko', icon: '✕', text: `Commercial → ${dateLabel}` };
  }

  return { className: 'task-card__date-check--ko', icon: '✕', text: `Date non confirmée${dateSuffix}` };
}

const TaskCard = ({ task, onOpen, isDragging }) => {
  if (!task) return null;
  const priority = TASK_PRIORITY_CONFIG[task.priority] || TASK_PRIORITY_CONFIG.MEDIUM;
  const status = TASK_STATUS_CONFIG[task.status] || TASK_STATUS_CONFIG.TODO;
  const when = formatRelativeDate(task.updated_at || task.created_at);
  const titleIncludesClient = task.client_name && typeof task.title === 'string' && task.title.includes(task.client_name);
  const subtitleClientName = titleIncludesClient ? null : task.client_name;
  const subtitle = [subtitleClientName, task.order_code].filter(Boolean).join(' • ');

  const hideFooterQuantity = task.description && typeof task.description === 'string' && task.description.includes('commandés');
  const showReference = task.item_reference && task.item_reference !== task.title;
  const shortOpsMessage = buildShortOpsMessage(task);
  const dateCheck = getDateConfirmationBadge(task);

  const isPredictive = task.task_type === 'PREDICTIVE';
  const typeConfig = isPredictive ? TASK_TYPE_CONFIG.PREDICTIVE : null;

  const articleCategory = getArticleCategory(task.item_reference);
  const coveragePercent = getCoveragePercent(task);
  const isPartialCoverage = coveragePercent !== null && coveragePercent < 100 && task.status !== 'WAITING_STOCK';

  // Urgence J-2 / J-1 (toutes les tâches actives sauf DONE)
  const daysLeft = task.status !== 'DONE' ? getDaysUntilPlannedDate(task) : null;
  const isDeadlineAlert = daysLeft !== null && daysLeft <= WAITING_STOCK_ALERT_DAYS;
  const isOverdue = daysLeft !== null && daysLeft < 0;

  const urgencyClass = isOverdue
    ? 'task-card--overdue'
    : isDeadlineAlert
    ? daysLeft <= 1
      ? 'task-card--alert-j1'
      : 'task-card--alert-j2'
    : '';

  // Facts to display as pills
  const facts = [];
  if (showReference) facts.push({ key: 'ref', label: task.item_reference });
  if (task.production_line) facts.push({ key: 'line', label: task.production_line });
  if (task.workspace_name) facts.push({ key: 'workspace', label: task.workspace_name, icon: '🏢' });
  if (task.planned_date) facts.push({ key: 'delivery', label: `${formatDate(task.planned_date)}`, icon: '📦' });
  if (task.due_date && task.due_date !== task.planned_date) facts.push({ key: 'due', label: `${formatDate(task.due_date)}`, icon: '📅' });

  const hasStockBadge = task.status === 'WAITING_STOCK' || (task.priority_order != null && task.status !== 'DONE');

  return (
    <article
      className={`task-card ${isDragging ? 'task-card--dragging' : ''} ${onOpen ? 'task-card--interactive' : ''} ${urgencyClass}`}
      style={{ borderLeftColor: isOverdue ? '#dc2626' : isDeadlineAlert ? (daysLeft <= 1 ? '#ea580c' : '#d97706') : priority.color }}
      onClick={() => onOpen?.(task)}
    >
      {/* ── Header row ── */}
      <div className="task-card__top">
        <div className="task-card__meta">
          <span className="task-card__key">{getTaskKey(task)}</span>
          {articleCategory && (
            <span
              className="task-card__category"
              style={{ background: articleCategory.bg, color: articleCategory.color }}
              title={`Catégorie: ${articleCategory.label}`}
            >
              {articleCategory.label}
            </span>
          )}
          {typeConfig ? (
            <span className="task-card__type-badge" style={{ background: typeConfig.bg, color: typeConfig.color }}>
              {typeConfig.badge}
            </span>
          ) : (
            <span className={`task-card__priority task-card__priority--${(task.priority || 'MEDIUM').toLowerCase()}`}>
              <span aria-hidden>{priority.icon}</span> {priority.label}
            </span>
          )}
        </div>
        <div className="task-card__top-right">
          {isDeadlineAlert && (
            <span className={`task-card__urgency-chip ${isOverdue ? 'task-card__urgency-chip--overdue' : daysLeft <= 1 ? 'task-card__urgency-chip--j1' : 'task-card__urgency-chip--j2'}`}>
              {isOverdue ? `+${Math.abs(daysLeft)}j` : daysLeft === 0 ? 'Auj.' : `J-${daysLeft}`}
            </span>
          )}
          <span className="task-card__status" style={{ background: status.bg, color: status.color }}>
            {status.shortLabel}
          </span>
        </div>
      </div>

      {/* ── Title + subtitle ── */}
      <h4 className="task-card__title">{task.title}</h4>
      {subtitle && <div className="task-card__subtitle">{subtitle}</div>}

      {/* ── Ops message ── */}
      {shortOpsMessage
        ? <p className="task-card__desc">{shortOpsMessage}</p>
        : task.description && <p className="task-card__desc">{task.description}</p>}

      {/* ── Date negotiation badge ── */}
      {dateCheck && (
        <div className={`task-card__date-check ${dateCheck.className}`} title={dateCheck.text}>
          <span className="task-card__date-check-icon" aria-hidden>{dateCheck.icon}</span>
          <span>{dateCheck.text}</span>
        </div>
      )}

      {/* ── Info row: facts + stock badge side by side ── */}
      {(facts.length > 0 || hasStockBadge) && (
        <div className="task-card__info-row">
          {facts.length > 0 && (
            <div className="task-card__facts">
              {facts.map(f => (
                <span key={f.key} className={`task-card__fact task-card__fact--${f.key}`}>
                  {f.icon && <span className="task-card__fact-icon" aria-hidden>{f.icon}</span>}
                  {f.label}
                </span>
              ))}
            </div>
          )}
          <StockAllocationBadge task={task} />
        </div>
      )}

      {/* ── Blocked banner ── */}
      {task.blocked_reason && (
        <div className="task-card__blocked">
          <span aria-hidden>⚠</span>
          <div>
            <strong>Blocage</strong>
            <p>{task.blocked_reason}</p>
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div className="task-card__footer">
        <div className="task-card__footer-copy">
          <span className="task-card__time">{when}</span>
          {!hideFooterQuantity && task.quantity != null && (
            <span className={`task-card__quantity ${isPartialCoverage ? 'task-card__quantity--partial' : ''}`}>
              {task.quantity} {task.quantity_unit || 'pcs'}
              {coveragePercent !== null && task.status !== 'WAITING_STOCK' && (
                <span className={`task-card__coverage ${isPartialCoverage ? 'task-card__coverage--warn' : 'task-card__coverage--ok'}`}>
                  {coveragePercent}%
                </span>
              )}
            </span>
          )}
        </div>
        <div className="task-card__avatars">
          {task.planned_by_name && task.planned_by_name !== task.created_by_name && (
            <span className="task-card__avatar task-card__avatar--planner" title={`Planifié par ${task.planned_by_name}`}>
              {getInitials(task.planned_by_name)}
            </span>
          )}
          <span className="task-card__avatar" title={`Créé par ${task.created_by_name || 'inconnu'}`}>
            {getInitials(task.created_by_name)}
          </span>
        </div>
      </div>
    </article>
  );
};

export default TaskCard;
