import React from 'react';

const priorityConfig = {
  LOW: { color: '#6b7280', bg: '#f3f4f6', label: 'Low' },
  MEDIUM: { color: '#d97706', bg: '#fef3c7', label: 'Medium' },
  HIGH: { color: '#dc2626', bg: '#fee2e2', label: 'High' },
  URGENT: { color: '#7c3aed', bg: '#ede9fe', label: 'Urgent' },
};

const statusConfig = {
  TODO: { color: '#6b7280', bg: '#f3f4f6' },
  IN_PROGRESS: { color: '#2563eb', bg: '#dbeafe' },
  DONE: { color: '#16a34a', bg: '#dcfce7' },
  BLOCKED: { color: '#dc2626', bg: '#fee2e2' },
};

const TaskCard = ({ task, onStatusChange, onEdit, onDelete, isAdmin, isDragging }) => {
  const priority = priorityConfig[task.priority] || priorityConfig.MEDIUM;
  const status = statusConfig[task.status] || statusConfig.TODO;

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  return (
    <div
      style={{
        background: 'white',
        borderRadius: '8px',
        padding: '0.75rem',
        marginBottom: '0.5rem',
        boxShadow: isDragging ? '0 4px 12px rgba(0,0,0,0.15)' : '0 1px 3px rgba(0,0,0,0.1)',
        border: `1px solid ${isDragging ? '#93c5fd' : '#e5e7eb'}`,
        cursor: 'grab',
        transition: 'box-shadow 0.2s',
        transform: isDragging ? 'rotate(2deg)' : 'none',
      }}
    >
      {/* Priority badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
        <span style={{
          fontSize: '0.65rem',
          fontWeight: '700',
          padding: '0.15rem 0.4rem',
          borderRadius: '4px',
          background: priority.bg,
          color: priority.color,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          {priority.label}
        </span>
        {isAdmin && (
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            {onEdit && (
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(task); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#6b7280', padding: '0.1rem' }}
                title="Edit"
              >✏️</button>
            )}
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#dc2626', padding: '0.1rem' }}
                title="Delete"
              >🗑️</button>
            )}
          </div>
        )}
      </div>

      {/* Title */}
      <h4 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#111827', marginBottom: '0.25rem', lineHeight: '1.3' }}>
        {task.title}
      </h4>

      {/* Description */}
      {task.description && (
        <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem', lineHeight: '1.4' }}>
          {task.description.length > 60 ? task.description.substring(0, 60) + '...' : task.description}
        </p>
      )}

      {/* Blocked reason */}
      {task.status === 'BLOCKED' && task.reason_blocked && (
        <div style={{
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '4px',
          padding: '0.35rem 0.5rem',
          marginBottom: '0.5rem',
          fontSize: '0.7rem',
          color: '#b91c1c',
        }}>
          🚫 {task.reason_blocked}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
        {task.assigned_to_name ? (
          <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>
            👤 {task.assigned_to_name}
          </span>
        ) : (
          <span style={{ fontSize: '0.7rem', color: '#d1d5db' }}>Unassigned</span>
        )}
        <span style={{ fontSize: '0.65rem', color: '#9ca3af' }}>
          {formatDate(task.created_at)}
        </span>
      </div>

      {/* Status change buttons */}
      {onStatusChange && (
        <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #f3f4f6' }}>
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
            {['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'].filter(s => s !== task.status).map(s => (
              <button
                key={s}
                onClick={(e) => { e.stopPropagation(); onStatusChange(task, s); }}
                style={{
                  fontSize: '0.6rem',
                  padding: '0.15rem 0.4rem',
                  border: `1px solid ${statusConfig[s].color}`,
                  borderRadius: '4px',
                  background: statusConfig[s].bg,
                  color: statusConfig[s].color,
                  cursor: 'pointer',
                  fontWeight: '500',
                }}
              >
                → {s.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskCard;
