import React, { useState, useCallback } from 'react';
import TaskCard from './TaskCard';
import TaskModal from './TaskModal';
import BlockReasonModal from './BlockReasonModal';
import { taskAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const COLUMNS = [
  { id: 'TODO', label: '📋 TODO', color: '#6b7280', bg: '#f9fafb', headerBg: '#f3f4f6' },
  { id: 'IN_PROGRESS', label: '⚙️ IN PROGRESS', color: '#2563eb', bg: '#eff6ff', headerBg: '#dbeafe' },
  { id: 'DONE', label: '✅ DONE', color: '#16a34a', bg: '#f0fdf4', headerBg: '#dcfce7' },
  { id: 'BLOCKED', label: '🚫 BLOCKED', color: '#dc2626', bg: '#fff5f5', headerBg: '#fee2e2' },
];

const KanbanBoard = ({ tasks, users, onTasksChange }) => {
  const { isAdmin } = useAuth();
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [blockModal, setBlockModal] = useState({ open: false, task: null, targetStatus: null });
  const [draggedTask, setDraggedTask] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const [error, setError] = useState('');

  const getTasksByStatus = (status) => tasks.filter(t => t.status === status);

  const handleDragStart = (e, task) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, columnId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(columnId);
  };

  const handleDrop = async (e, targetStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    if (!draggedTask || draggedTask.status === targetStatus) {
      setDraggedTask(null);
      return;
    }
    if (targetStatus === 'BLOCKED') {
      setBlockModal({ open: true, task: draggedTask, targetStatus });
      return;
    }
    await updateStatus(draggedTask, targetStatus);
    setDraggedTask(null);
  };

  const handleDragEnd = () => {
    setDraggedTask(null);
    setDragOverColumn(null);
  };

  const updateStatus = async (task, status, reasonBlocked = null) => {
    try {
      await taskAPI.updateStatus(task.id, status, reasonBlocked);
      onTasksChange();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update status');
      setTimeout(() => setError(''), 3000);
    }
  };

  const handleStatusChange = (task, newStatus) => {
    if (newStatus === 'BLOCKED') {
      setBlockModal({ open: true, task, targetStatus: newStatus });
    } else {
      updateStatus(task, newStatus);
    }
  };

  const handleBlockConfirm = async (reason) => {
    await updateStatus(blockModal.task, 'BLOCKED', reason);
    setBlockModal({ open: false, task: null, targetStatus: null });
    setDraggedTask(null);
  };

  const handleSaveTask = async (formData) => {
    try {
      if (editingTask) {
        await taskAPI.update(editingTask.id, formData);
      } else {
        await taskAPI.create(formData);
      }
      setShowTaskModal(false);
      setEditingTask(null);
      onTasksChange();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save task');
      setTimeout(() => setError(''), 3000);
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Delete this task?')) return;
    try {
      await taskAPI.delete(taskId);
      onTasksChange();
    } catch (err) {
      setError('Failed to delete task');
      setTimeout(() => setError(''), 3000);
    }
  };

  return (
    <div style={{ padding: '1rem', height: 'calc(100vh - 60px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#111827' }}>Kanban Board</h2>
        {isAdmin && (
          <button
            className="btn btn-primary"
            onClick={() => { setEditingTask(null); setShowTaskModal(true); }}
          >
            ➕ New Task
          </button>
        )}
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', padding: '0.5rem 1rem', marginBottom: '0.5rem', color: '#dc2626', fontSize: '0.875rem' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Kanban columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', flex: 1, overflow: 'hidden' }}>
        {COLUMNS.map(col => {
          const colTasks = getTasksByStatus(col.id);
          const isDragTarget = dragOverColumn === col.id;
          return (
            <div
              key={col.id}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDrop={(e) => handleDrop(e, col.id)}
              onDragLeave={() => setDragOverColumn(null)}
              style={{
                background: isDragTarget ? '#eff6ff' : col.bg,
                borderRadius: '10px',
                display: 'flex',
                flexDirection: 'column',
                border: isDragTarget ? `2px dashed ${col.color}` : `2px solid transparent`,
                transition: 'border 0.2s, background 0.2s',
                overflow: 'hidden',
              }}
            >
              {/* Column header */}
              <div style={{
                padding: '0.75rem 1rem',
                background: col.headerBg,
                borderBottom: `2px solid ${col.color}20`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span style={{ fontWeight: '700', fontSize: '0.875rem', color: col.color }}>
                  {col.label}
                </span>
                <span style={{
                  background: col.color,
                  color: 'white',
                  borderRadius: '9999px',
                  width: '22px',
                  height: '22px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  fontWeight: '700',
                }}>
                  {colTasks.length}
                </span>
              </div>

              {/* Tasks */}
              <div style={{ padding: '0.75rem', overflowY: 'auto', flex: 1, minHeight: '100px' }}>
                {colTasks.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#d1d5db', fontSize: '0.8rem', padding: '2rem 0' }}>
                    Drop tasks here
                  </div>
                ) : (
                  colTasks.map(task => (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task)}
                      onDragEnd={handleDragEnd}
                    >
                      <TaskCard
                        task={task}
                        onStatusChange={handleStatusChange}
                        onEdit={isAdmin ? (t) => { setEditingTask(t); setShowTaskModal(true); } : null}
                        onDelete={isAdmin ? handleDeleteTask : null}
                        isAdmin={isAdmin}
                        isDragging={draggedTask?.id === task.id}
                      />
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modals */}
      {showTaskModal && (
        <TaskModal
          task={editingTask}
          users={users}
          onSave={handleSaveTask}
          onClose={() => { setShowTaskModal(false); setEditingTask(null); }}
          isAdmin={isAdmin}
        />
      )}

      {blockModal.open && (
        <BlockReasonModal
          task={blockModal.task}
          onConfirm={handleBlockConfirm}
          onCancel={() => { setBlockModal({ open: false, task: null, targetStatus: null }); setDraggedTask(null); }}
        />
      )}
    </div>
  );
};

export default KanbanBoard;
