import React, { useState, useCallback, useMemo } from 'react';
import TaskCard from './TaskCard';
import TaskModal from './TaskModal';
import BlockReasonModal from './BlockReasonModal';
import { taskAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import './KanbanBoard.css';

const COLUMNS = [
  { id: 'TODO', label: 'À faire', color: '#0747a6', bg: '#e9f2ff', headerBg: '#deebff' },
  { id: 'IN_PROGRESS', label: 'En cours', color: '#0052cc', bg: '#dfefff', headerBg: '#cce0ff' },
  { id: 'BLOCKED', label: 'Bloqué', color: '#bf2600', bg: '#fff7e6', headerBg: '#ffe7c2' },
  { id: 'DONE', label: 'Terminé', color: '#006644', bg: '#e3fcef', headerBg: '#c8f5e0' },
];

const DRAG_MIME = 'application/x-suivi-task';

function sortInColumn(a, b) {
  const rank = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const ra = rank[a.priority] ?? 9;
  const rb = rank[b.priority] ?? 9;
  if (ra !== rb) return ra - rb;
  const pa = a.board_position ?? 0;
  const pb = b.board_position ?? 0;
  if (pa !== pb) return pa - pb;
  return (a.id ?? 0) - (b.id ?? 0);
}

function buildColumnOrders(taskList) {
  const columnOrders = {
    TODO: [],
    IN_PROGRESS: [],
    DONE: [],
    BLOCKED: [],
  };
  COLUMNS.forEach((col) => {
    columnOrders[col.id] = taskList
      .filter((t) => t.status === col.id)
      .sort(sortInColumn)
      .map((t) => t.id);
  });
  return columnOrders;
}

/** Returns flat task list with updated status / board_position */
function applyMove(taskList, draggedId, targetStatus, insertBeforeId) {
  const dragged = taskList.find((t) => t.id === draggedId);
  if (!dragged) return taskList;

  const byCol = { TODO: [], IN_PROGRESS: [], DONE: [], BLOCKED: [] };
  for (const t of taskList) {
    if (t.id === draggedId) continue;
    if (byCol[t.status]) byCol[t.status].push(t);
  }
  Object.keys(byCol).forEach((k) => {
    byCol[k].sort(sortInColumn);
  });

  const col = byCol[targetStatus];
  let insertAt = insertBeforeId == null ? col.length : col.findIndex((t) => t.id === insertBeforeId);
  if (insertAt < 0) insertAt = col.length;

  const moved = { ...dragged, status: targetStatus };
  col.splice(insertAt, 0, moved);
  byCol[targetStatus] = col.map((t, i) => ({
    ...t,
    status: targetStatus,
    board_position: i,
  }));

  return [...byCol.TODO, ...byCol.IN_PROGRESS, ...byCol.BLOCKED, ...byCol.DONE];
}

function taskMatchesFilters(task, filterQuery, filterPriority) {
  if (filterPriority && task.priority !== filterPriority) return false;
  const q = (filterQuery || '').trim().toLowerCase();
  if (!q) return true;
  const title = (task.title || '').toLowerCase();
  const desc = (task.description || '').toLowerCase();
  const key = `sp-${task.id}`;
  return (
    title.includes(q) ||
    desc.includes(q) ||
    String(task.id).includes(q) ||
    key.includes(q)
  );
}

const KanbanBoard = ({
  tasks,
  setTasks,
  users,
  onTasksChange,
  workspaceId,
  filterQuery = '',
  filterPriority = '',
  onStatsRefresh,
}) => {
  const { isSuperAdmin, isPlanner } = useAuth();
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [blockModal, setBlockModal] = useState({
    open: false,
    task: null,
    targetStatus: null,
  });
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const [dragOverTaskId, setDragOverTaskId] = useState(null);
  const [error, setError] = useState('');
  const [createDefaultStatus, setCreateDefaultStatus] = useState(null);

  const visibleTaskIds = useMemo(() => {
    const ids = new Set();
    for (const t of tasks) {
      if (taskMatchesFilters(t, filterQuery, filterPriority)) ids.add(t.id);
    }
    return ids;
  }, [tasks, filterQuery, filterPriority]);

  const getTasksByStatus = useCallback(
    (status) =>
      tasks
        .filter((t) => t.status === status)
        .sort(sortInColumn)
        .filter((t) => visibleTaskIds.has(t.id)),
    [tasks, visibleTaskIds]
  );

  const getColumnCount = useCallback(
    (status) => tasks.filter((t) => t.status === status).length,
    [tasks]
  );

  const setErrorShort = (msg) => {
    setError(msg);
    setTimeout(() => setError(''), 4000);
  };

  const readDragPayload = (e) => {
    try {
      const raw = e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData('text/plain');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const id = parsed && (typeof parsed.id === 'number' ? parsed.id : parseInt(parsed.id, 10));
      if (!parsed || !Number.isFinite(id)) return null;
      return { id, status: parsed.status };
    } catch {
      return null;
    }
  };

  const handleDragStart = (e, task) => {
    if (!isPlanner) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ id: task.id, status: task.status }));
    e.dataTransfer.setData('text/plain', JSON.stringify({ id: task.id, status: task.status }));
  };

  const handleDragOver = (e, columnId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(columnId);
  };

  const handleDragOverTask = (e, taskId) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTaskId(taskId);
  };

  const clearDragHighlights = () => {
    setDragOverColumn(null);
    setDragOverTaskId(null);
  };

  const updateStatus = async (task, status, reasonBlocked = null) => {
    try {
      await taskAPI.updateStatus(task.id, status, reasonBlocked);
      await onTasksChange();
      if (onStatsRefresh) await onStatsRefresh();
    } catch (err) {
      setErrorShort(err.response?.data?.error || 'Impossible de mettre à jour le statut');
      await onTasksChange();
    }
  };

  const persistBoard = async (nextTasks) => {
    const columnOrders = buildColumnOrders(nextTasks);
    try {
      const res = await taskAPI.patchBoard({ workspaceId, columnOrders });
      setTasks(res.data);
      if (onStatsRefresh) await onStatsRefresh();
    } catch (err) {
      setErrorShort(err.response?.data?.error || 'Impossible de sauvegarder le tableau');
      await onTasksChange();
    }
  };

  const runDrop = async (draggedId, targetStatus, insertBeforeId) => {
    const task = tasks.find((t) => t.id === draggedId);
    if (!task) {
      clearDragHighlights();
      return;
    }

    if (targetStatus === 'BLOCKED' && task.status !== 'BLOCKED') {
      setBlockModal({
        open: true,
        task,
        targetStatus,
      });
      clearDragHighlights();
      return;
    }

    if (isPlanner) {
      const next = applyMove(tasks, draggedId, targetStatus, insertBeforeId);
      const before = JSON.stringify(buildColumnOrders(tasks));
      const after = JSON.stringify(buildColumnOrders(next));
      if (before === after) {
        clearDragHighlights();
        return;
      }
      setTasks(next);
      await persistBoard(next);
    } else {
      setErrorShort('Seul le planificateur peut changer le statut.');
      clearDragHighlights();
      return;
    }
    clearDragHighlights();
  };

  const handleDropOnColumn = async (e, targetStatus) => {
    e.preventDefault();
    const payload = readDragPayload(e);
    clearDragHighlights();
    if (!payload) return;
    await runDrop(payload.id, targetStatus, null);
  };

  const handleDropOnTask = async (e, beforeTask) => {
    e.preventDefault();
    e.stopPropagation();
    const payload = readDragPayload(e);
    clearDragHighlights();
    if (!payload) return;
    if (beforeTask.id === payload.id) return;
    await runDrop(payload.id, beforeTask.status, beforeTask.id);
  };

  const handleStatusChange = (task, newStatus) => {
    if (newStatus === 'BLOCKED') {
      setBlockModal({ open: true, task, targetStatus: newStatus });
    } else if (isPlanner) {
      const next = applyMove(tasks, task.id, newStatus, null);
      setTasks(next);
      persistBoard(next);
    } else {
      setErrorShort('Seul le planificateur peut changer le statut.');
    }
  };

  const handleBlockConfirm = async (reason) => {
    const t = blockModal.task;
    if (!t) return;
    await updateStatus(t, 'BLOCKED', reason);
    setBlockModal({ open: false, task: null, targetStatus: null });
  };

  const handleSaveTask = async (formData) => {
    try {
      if (editingTask) {
        await taskAPI.update(editingTask.id, formData);
      } else {
        const res = await taskAPI.create({ ...formData, workspaceId });
        const created = res.data;
        if (createDefaultStatus && createDefaultStatus !== 'TODO') {
          await taskAPI.updateStatus(created.id, createDefaultStatus);
        }
      }
      setShowTaskModal(false);
      setEditingTask(null);
      setCreateDefaultStatus(null);
      onTasksChange();
      if (onStatsRefresh) await onStatsRefresh();
    } catch (err) {
      setErrorShort(err.response?.data?.error || 'Enregistrement impossible');
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Supprimer cette tâche ?')) return;
    try {
      await taskAPI.delete(taskId);
      onTasksChange();
      if (onStatsRefresh) await onStatsRefresh();
    } catch (err) {
      setErrorShort('Suppression impossible');
    }
  };

  return (
    <div className="kanban-board-wrap">
      <div className="kanban-board__heading">
        <div>
          <nav className="kanban-breadcrumb" aria-label="Fil d'Ariane">
            <span>Projet</span>
            <span aria-hidden>/</span>
            <strong>Tableau Scrum</strong>
          </nav>
          <h2 className="kanban-board__title">Tableau</h2>
          <p className="kanban-board__hint">
            {isPlanner ? 'Le planificateur peut déplacer les cartes et changer leur état.' : 'Lecture seule. Le planificateur gère les changements d’état.'}
          </p>
        </div>
        {isSuperAdmin && (
          <button
            type="button"
            className="btn btn-primary kanban-board__cta"
            onClick={() => {
              setEditingTask(null);
              setCreateDefaultStatus(null);
              setShowTaskModal(true);
            }}
          >
            + Créer une tâche
          </button>
        )}
      </div>

      {error && <div className="kanban-board__error">{error}</div>}

      <div className="kanban-board__grid">
        {COLUMNS.map((col) => {
          const colTasks = getTasksByStatus(col.id);
          const totalInCol = getColumnCount(col.id);
          const isDragTarget = dragOverColumn === col.id;
          const filteredEmpty =
            totalInCol > 0 &&
            colTasks.length === 0 &&
            (filterQuery.trim() || filterPriority);
          return (
            <div
              key={col.id}
              className={`kanban-column ${isDragTarget ? 'kanban-column--drop' : ''}`}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDrop={(e) => handleDropOnColumn(e, col.id)}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) {
                  setDragOverColumn(null);
                }
              }}
              style={{
                background: isDragTarget ? '#e9f2ff' : col.bg,
                borderColor: isDragTarget ? col.color : '#dfe1e6',
              }}
            >
              <div
                className="kanban-column__head"
                style={{ background: col.headerBg, borderBottomColor: `${col.color}40` }}
              >
                <span className="kanban-column__title" style={{ color: col.color }}>
                  {col.label}
                </span>
                <span className="kanban-column__count" style={{ background: col.color }}>
                  {filterQuery.trim() || filterPriority ? `${colTasks.length}/${totalInCol}` : totalInCol}
                </span>
                <button type="button" className="kanban-column__menu" title="Options" aria-label="Options colonne">
                  ···
                </button>
              </div>

              <div className="kanban-column__body">
                {filteredEmpty ? (
                  <div className="kanban-column__empty kanban-column__empty--filter">
                    Aucune tâche ne correspond aux filtres
                  </div>
                ) : colTasks.length === 0 ? (
                  <div className="kanban-column__empty">Déposer des tâches ici</div>
                ) : (
                  colTasks.map((task) => (
                    <div
                      key={task.id}
                      className="kanban-card-slot"
                      draggable
                      onDragStart={(e) => handleDragStart(e, task)}
                      onDragEnd={clearDragHighlights}
                      onDragOver={(e) => handleDragOverTask(e, task.id)}
                      onDrop={(e) => handleDropOnTask(e, task)}
                      data-task-id={task.id}
                      style={{
                        outline: dragOverTaskId === task.id ? `2px solid ${col.color}` : 'none',
                      }}
                    >
                      <TaskCard
                        task={task}
                        onStatusChange={handleStatusChange}
                        onEdit={
                          isSuperAdmin
                            ? (t) => {
                                setEditingTask(t);
                                setShowTaskModal(true);
                              }
                            : null
                        }
                        onDelete={isSuperAdmin ? handleDeleteTask : null}
                        isAdmin={isSuperAdmin}
                        isDragging={false}
                      />
                    </div>
                  ))
                )}
              </div>

              {isSuperAdmin && col.id !== 'BLOCKED' && (
                <button
                  type="button"
                  className="kanban-column__create"
                  onClick={() => {
                    setEditingTask(null);
                    setCreateDefaultStatus(col.id);
                    setShowTaskModal(true);
                  }}
                >
                  + Créer
                </button>
              )}
            </div>
          );
        })}
      </div>

      {showTaskModal && (
        <TaskModal
          task={editingTask}
          onSave={handleSaveTask}
          onClose={() => {
            setShowTaskModal(false);
            setEditingTask(null);
            setCreateDefaultStatus(null);
          }}
        />
      )}

      {blockModal.open && (
        <BlockReasonModal
          task={blockModal.task}
          onConfirm={handleBlockConfirm}
          onCancel={() => {
            setBlockModal({ open: false, task: null, targetStatus: null });
          }}
        />
      )}
    </div>
  );
};

export default KanbanBoard;
