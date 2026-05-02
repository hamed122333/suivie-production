import React, { useState } from 'react';
import { taskAPI } from '../services/api';
import './TaskTypeToggle.css';

const TaskTypeToggle = ({ task, onTypeChanged, isPlanner }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleToggle = async () => {
    const newType = task.task_type === 'PREDICTIVE' ? 'STANDARD' : 'PREDICTIVE';

    setLoading(true);
    setError(null);

    try {
      const response = await taskAPI.convertType(task.id, newType);
      if (onTypeChanged) {
        onTypeChanged(response.data.task);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la conversion');
      console.error('Type conversion error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isPlanner) {
    return (
      <div className="task-type-badge">
        <span className={`task-type-badge__label task-type-badge--${task.task_type?.toLowerCase()}`}>
          {task.task_type === 'PREDICTIVE' ? '📊 Prédictive' : '📋 Standard'}
        </span>
      </div>
    );
  }

  return (
    <div className="task-type-toggle">
      <div className="task-type-toggle__label">Type de tâche</div>
      <button
        type="button"
        className={`task-type-toggle__button task-type-toggle--${task.task_type?.toLowerCase()}`}
        onClick={handleToggle}
        disabled={loading}
      >
        <span className="task-type-toggle__icon">
          {task.task_type === 'PREDICTIVE' ? '📊' : '📋'}
        </span>
        <span className="task-type-toggle__text">
          {task.task_type === 'PREDICTIVE' ? 'Prédictive' : 'Standard'}
        </span>
        {loading && <span className="task-type-toggle__spinner">⟳</span>}
      </button>
      {error && <div className="task-type-toggle__error">{error}</div>}
    </div>
  );
};

export default TaskTypeToggle;
