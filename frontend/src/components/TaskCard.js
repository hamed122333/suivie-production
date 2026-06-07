import React from 'react';
import {
  TASK_PRIORITY_CONFIG,
  TASK_STATUS_CONFIG,
  TASK_TYPE_CONFIG,
  WAITING_STOCK_ALERT_DAYS,
  PARTIAL_PREP_STATUS,
  PARTIAL_REMAINDER_BADGE,
  getTaskKey,
  getArticleCategory,
  getCoveragePercent,
} from '../constants/task';
import { formatDate, formatRelativeDate, getInitials, formatQuantity } from '../utils/formatters';
import StockAllocationBadge from './StockAllocationBadge';
import { IconEdit, IconTrash } from './ui/icons';
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
  const deficit = task?.stock_deficit != null ? Number(task.stock_deficit) : null;
  const stockCovers = deficit !== null && deficit <= 0; // stock PF couvre la quantité

  // Statuts amont (Hors Stock PF / À Préparer / En Préparation) : indiquer si le
  // stock PF couvre déjà la quantité → la fiche passera auto en « Prêt à Livrer ».
  if (status === 'WAITING_STOCK') {
    if (deficit !== null && deficit > 0) {
      return `En attente de stock PF — ${deficit} manquants sur ${qty}`;
    }
    if (stockCovers) return 'Stock PF disponible ✓ — passage auto en Prêt à Livrer';
    return 'Hors Stock PF — à prendre en charge par le planificateur';
  }

  if (status === 'TODO') {
    if (task?.task_type === 'PREDICTIVE') return 'Commande prévisionnelle';
    if (stockCovers) return 'Stock PF disponible ✓ — passage auto en Prêt à Livrer';
    return qty > 0 ? `Pris en charge — ${qty} pcs à préparer` : 'Pris en charge — à préparer';
  }

  if (status === 'IN_PROGRESS') {
    if (stockCovers) return 'Stock PF disponible ✓ — passage auto en Prêt à Livrer';
    return 'En préparation — Prêt à Livrer auto dès stock PF';
  }
  if (status === 'DONE')        return 'Stock PF confirmé — prêt à livrer ✓';
  if (status === 'DELIVERED')   return 'Livraison confirmée ✓';
  if (status === 'BLOCKED')     return 'Bloquée — action requise (exception)';
  return null;
}

// Badge de négociation/confirmation de date — visible sur les statuts amont
// (Hors Stock PF / À Préparer / En Préparation) pour garder la traçabilité de la
// modification de date même après la prise en charge par le planificateur.
function getDateConfirmationBadge(task) {
  const negotiationStatus = task?.date_negotiation_status;
  const proposedByRole = `${task?.proposed_by_role || ''}`.toLowerCase();
  const proposedDate = task?.proposed_delivery_date;
  const dateSuffix = proposedDate ? ` (${formatDate(proposedDate)})` : '';
  const byName = task?.planned_by_name || null; // nom de la personne ayant proposé/touché la date
  const ACTIVE = ['WAITING_STOCK', 'TODO', 'IN_PROGRESS'];

  if (!ACTIVE.includes(task?.status)) return null;

  if (negotiationStatus === 'ACCEPTED') {
    const label = proposedByRole === 'planner' ? 'Date modifiée confirmée' : 'Date confirmée';
    return {
      className: 'task-card__date-check--ok',
      icon: '✓',
      text: byName ? `${label} par ${byName}${dateSuffix}` : `${label}${dateSuffix}`,
    };
  }

  if (negotiationStatus === 'PENDING_COMMERCIAL_REVIEW') {
    const dateLabel = proposedDate ? formatDate(proposedDate) : '—';
    return {
      className: 'task-card__date-check--info',
      icon: '●',
      text: `${byName || 'Planificateur'} → commercial : ${dateLabel}`,
    };
  }

  if (negotiationStatus === 'PENDING_PLANNER_REVIEW') {
    const dateLabel = proposedDate ? formatDate(proposedDate) : '—';
    return {
      className: 'task-card__date-check--ko',
      icon: '✕',
      text: `${byName || 'Commercial'} → planner : ${dateLabel}`,
    };
  }

  if (task?.urgent_date_pending) {
    return {
      className: 'task-card__date-check--warn',
      icon: '!',
      text: `Date urgente${task.due_date ? ` (${formatDate(task.due_date)})` : ''}`,
    };
  }

  // Aucune négociation : on signale « non confirmée » uniquement à l'entrée (Hors Stock PF)
  if (task?.status === 'WAITING_STOCK') {
    return { className: 'task-card__date-check--ko', icon: '✕', text: `Date non confirmée${dateSuffix}` };
  }

  return null;
}

const TaskCard = ({ task, onOpen, isDragging, onEdit, onDelete, canEdit }) => {
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

  // Préparation partielle — indicateur COMPACT (badge + mini barre), détail dans le panneau.
  const partialPending = task.partial_preparation_status === 'PENDING_CUSTOMER';
  const partialBadge = partialPending
    ? PARTIAL_PREP_STATUS.PENDING_CUSTOMER
    : (task.partial_split_part === 'REMAINDER' ? PARTIAL_REMAINDER_BADGE : null);
  const partialTotal = Math.round(Number(task.quantity || 0));
  const partialPrepared = Math.round(Number(task.partial_prepared_quantity || 0));
  const partialPercent = partialPending && partialTotal > 0
    ? Math.max(0, Math.min(100, Math.round((partialPrepared / partialTotal) * 100)))
    : 0;

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
          {partialBadge && (
            <span
              className="task-card__partial-badge"
              style={{ background: partialBadge.bg, color: partialBadge.color }}
              title={partialPending ? `Préparation partielle : ${partialPrepared}/${partialTotal} — en attente de validation client` : `Reliquat${task.partial_parent_order_code ? ` de ${task.partial_parent_order_code}` : ''}`}
            >
              {partialPending ? `${partialBadge.label} · ${partialPercent}%` : partialBadge.label}
            </span>
          )}
        </div>
        <div className="task-card__top-right">
          {canEdit && (onEdit || onDelete) && (
            <div className="task-card__actions">
              {onEdit && (
                <button type="button" className="task-card__action-btn" title="Modifier" aria-label="Modifier"
                  onClick={(e) => { e.stopPropagation(); onEdit(task); }}>
                  <IconEdit width={14} height={14} />
                </button>
              )}
              {onDelete && (
                <button type="button" className="task-card__action-btn task-card__action-btn--danger" title="Supprimer" aria-label="Supprimer"
                  onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}>
                  <IconTrash width={14} height={14} />
                </button>
              )}
            </div>
          )}
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

      {/* ── Préparation partielle : mini-barre compacte (détail dans le panneau) ── */}
      {partialPending && (
        <div className="task-card__partial-bar" title={`${partialPrepared}/${partialTotal} préparés — en attente validation client`}>
          <div className="task-card__partial-bar-fill" style={{ width: `${partialPercent}%` }} />
        </div>
      )}

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
              {formatQuantity(task.quantity)}
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
          {/* Show commercial avatar when task was imported (created by planner/admin on behalf of commercial) */}
          {task.commercial_name ? (
            <span
              className="task-card__avatar task-card__avatar--commercial"
              title={`Commercial: ${task.commercial_name}${task.commercial_id ? ` (${task.commercial_id})` : ''}`}
            >
              {getInitials(task.commercial_name)}
            </span>
          ) : (
            <span className="task-card__avatar" title={`Créé par ${task.created_by_name || 'inconnu'}`}>
              {getInitials(task.created_by_name)}
            </span>
          )}
        </div>
      </div>
    </article>
  );
};

export default TaskCard;
