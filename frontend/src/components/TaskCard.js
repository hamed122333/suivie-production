import React from 'react';
import { Draggable } from '@hello-pangea/dnd';

const TaskCard = ({ task, index, onClick }) => {
  const getPriorityColor = (p) => {
    if (p === 'HIGH') return '#ef5350';
    if (p === 'MEDIUM') return '#ff9800';
    return '#4caf50';
  };

  return (
    <Draggable draggableId={String(task.id)} index={index}>
      {(provided) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onClick(task)}
          style={{
            userSelect: 'none',
            padding: 16,
            margin: '0 0 8px 0',
            backgroundColor: task.status === 'BLOCKED' ? '#ffebee' : 'white',
            borderLeft: `5px solid ${getPriorityColor(task.priority)}`,
            boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
            borderRadius: '4px',
            cursor: 'grab',
            ...provided.draggableProps.style
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: 5 }}>{task.title}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8em', color: '#666' }}>
             <span>{task.assignee || 'Unassigned'}</span>
             <span>{new Date(task.created_at).toLocaleDateString()}</span>
          </div>
          {task.status === 'BLOCKED' && (
            <div style={{ color: '#d32f2f', fontSize: '0.8em', marginTop: 8, paddingTop: 4, borderTop: '1px solid #ffcdd2' }}>
              ⚠️ {task.blocked_reason}
            </div>
          )}
        </div>
      )}
    </Draggable>
  );
};

export default TaskCard;

