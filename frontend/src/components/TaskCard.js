import React from 'react';
import { TASK_PRIORITY_CONFIG, TASK_STATUS_CONFIG, getTaskKey } from '../constants/task';
import { formatDate, formatRelativeDate, getInitials } from '../utils/formatters';
import './TaskCard.css';

const TaskCard = ({ task, onOpen, isDragging }) => {
  if (!task) return null;
  const priority = TASK_PRIORITY_CONFIG[task.priority] || TASK_PRIORITY_CONFIG.MEDIUM;
  const status = TASK_STATUS_CONFIG[task.status] || TASK_STATUS_CONFIG.TODO;
  const when = formatRelativeDate(task.updated_at || task.created_at);
  const subtitle = [task.client_name, task.order_code].filter(Boolean).join(' • ');

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

      {task.description && <p className="task-card__desc">{task.description}</p>}

      <div className="task-card__facts">
        {task.item_reference && <span>Ref {task.item_reference}</span>}
        {task.production_line && <span>{task.production_line}</span>}
        {task.due_date && <span>Echeance {formatDate(task.due_date)}</span>}
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
          {task.quantity != null && (
            <span className="task-card__quantity">
              {task.quantity} {task.quantity_unit || 'pcs'}
            </span>
          )}
        </div>
        <span className="task-card__avatar" title={task.assigned_to_name || 'Non assigne'}>
          {getInitials(task.assigned_to_name)}
        </span>
      </div>
    </article>
  );
};

export default TaskCard;
