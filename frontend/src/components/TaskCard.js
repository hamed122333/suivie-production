import React, { useState } from 'react';
import './TaskCard.css';

const priorityConfig = {
  LOW: { color: '#6b7280', bg: '#f3f4f6', label: 'Basse', icon: '▾' },
  MEDIUM: { color: '#d97706', bg: '#fef3c7', label: 'Moyenne', icon: '◆' },
  HIGH: { color: '#dc2626', bg: '#fee2e2', label: 'Haute', icon: '▲' },
  URGENT: { color: '#7c3aed', bg: '#ede9fe', label: 'Urgente', icon: '!' },
};

const statusLabels = {
  TODO: 'À faire',
  IN_PROGRESS: 'En cours',
  DONE: 'Terminé',
  BLOCKED: 'Bloqué',
};

function formatRelative(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const diffMs = now - d;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "À l'instant";
  const min = Math.floor(sec / 60);
  if (min < 60) return `Il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Il y a ${h} h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `Il y a ${days} jour${days > 1 ? 's' : ''}`;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function initialsFromName(name) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

const TaskCard = ({ task, onStatusChange, onEdit, onDelete, isAdmin, isDragging }) => {
  const priority = priorityConfig[task.priority] || priorityConfig.MEDIUM;
  const [actionsOpen, setActionsOpen] = useState(false);
  const taskKey = `SP-${task.id}`;
  const when = formatRelative(task.updated_at || task.created_at);

  return (
    <div
      className={`task-card ${isDragging ? 'task-card--dragging' : ''}`}
      style={{
        borderLeftColor: priority.color,
      }}
    >
      <div className="task-card__top">
        <div className="task-card__meta">
          <span className="task-card__type-icon" aria-hidden title="Tâche">
            ■
          </span>
          <span className="task-card__key">{taskKey}</span>
          <span className={`task-card__priority task-card__priority--${(task.priority || 'MEDIUM').toLowerCase()}`}>
            <span aria-hidden>{priority.icon}</span> {priority.label}
          </span>
        </div>
        {isAdmin && (
          <div className="task-card__toolbar">
            <button
              type="button"
              className="task-card__icon-btn"
              title="Actions rapides"
              onClick={(e) => {
                e.stopPropagation();
                setActionsOpen((o) => !o);
              }}
            >
              ···
            </button>
            {actionsOpen && (
              <div className="task-card__menu" role="menu">
                {onEdit && (
                  <button type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); onEdit(task); setActionsOpen(false); }}>
                    Modifier
                  </button>
                )}
                {onDelete && (
                  <button type="button" role="menuitem" className="task-card__menu-danger" onClick={(e) => { e.stopPropagation(); onDelete(task.id); setActionsOpen(false); }}>
                    Supprimer
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <h4 className="task-card__title">{task.title}</h4>

      {task.description && (
        <p className="task-card__desc">
          {task.description.length > 90 ? `${task.description.substring(0, 90)}…` : task.description}
        </p>
      )}

      {task.status === 'BLOCKED' && task.blocked_reason && (
        <div className="task-card__blocked">
          <span aria-hidden>⚠</span> {task.blocked_reason}
        </div>
      )}

      <div className="task-card__footer">
        <span className="task-card__time">{when}</span>
        <span
          className="task-card__avatar"
          title={task.assigned_to_name || 'Non assigné'}
        >
          {initialsFromName(task.assigned_to_name)}
        </span>
      </div>

      {onStatusChange && (
        <div className="task-card__transitions">
          {['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED']
            .filter((s) => s !== task.status)
            .map((s) => (
              <button
                key={s}
                type="button"
                className="task-card__chip"
                onClick={(e) => {
                  e.stopPropagation();
                  onStatusChange(task, s);
                }}
              >
                → {statusLabels[s] || s}
              </button>
            ))}
        </div>
      )}
    </div>
  );
};

export default TaskCard;
