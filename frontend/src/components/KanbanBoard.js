import React, { useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';
import BlockReasonModal from './BlockReasonModal';
import TaskCard from './TaskCard';
import TaskDetailsPanel from './TaskDetailsPanel';
import TaskModal from './TaskModal';
import { TASK_STATUS_CONFIG, TASK_STATUS_ORDER } from '../constants/task';
import { useAuth } from '../context/AuthContext';
import { taskAPI } from '../services/api';
import './KanbanBoard.css';

const COLUMNS = TASK_STATUS_ORDER.map((status) => ({
  id: status,
  ...TASK_STATUS_CONFIG[status],
}));

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
  const columnOrders = {};
  COLUMNS.forEach((column) => {
    columnOrders[column.id] = taskList
      .filter((task) => task.status === column.id)
      .sort(sortInColumn)
      .map((task) => task.id);
  });
  return columnOrders;
}

function applyMove(taskList, draggedId, targetStatus, insertBeforeId) {
  const dragged = taskList.find((task) => task.id === draggedId);
  if (!dragged) return taskList;

  const byColumn = Object.fromEntries(TASK_STATUS_ORDER.map((status) => [status, []]));
  for (const task of taskList) {
    if (task.id === draggedId) continue;
    if (byColumn[task.status]) {
      byColumn[task.status].push(task);
    }
  }

  Object.keys(byColumn).forEach((status) => {
    byColumn[status].sort(sortInColumn);
  });

  const targetColumn = byColumn[targetStatus] || [];
  let insertAt = insertBeforeId == null ? targetColumn.length : targetColumn.findIndex((task) => task.id === insertBeforeId);
  if (insertAt < 0) insertAt = targetColumn.length;

  targetColumn.splice(insertAt, 0, { ...dragged, status: targetStatus });
  byColumn[targetStatus] = targetColumn.map((task, index) => ({ ...task, status: targetStatus, board_position: index }));

  return TASK_STATUS_ORDER.flatMap((status) => byColumn[status] || []);
}

function taskMatchesFilters(task, filterQuery, filterPriority) {
  if (filterPriority && task.priority !== filterPriority) return false;

  const query = (filterQuery || '').trim().toLowerCase();
  if (!query) return true;

  return [
    task.title,
    task.description,
    task.client_name,
    task.order_code,
    task.item_reference,
    task.production_line,
    task.workshop,
    String(task.id),
    `sp-${task.id}`,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
}

const KanbanBoard = ({
  tasks,
  setTasks,
  users = [],
  onTasksChange,
  workspaceId,
  filterQuery = '',
  filterPriority = '',
  onStatsRefresh,
}) => {
  const { canChangeStatus, canCreateTask, isCommercial, isSuperAdmin } = useAuth();
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [blockModal, setBlockModal] = useState({ open: false, task: null });
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const [dragOverTaskId, setDragOverTaskId] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [error, setError] = useState('');
  const [detailRefreshSignal, setDetailRefreshSignal] = useState(0);
  const errorTimeoutRef = useRef(null);

  const isAllWorkspaces = workspaceId === 'all';
  const deferredQuery = useDeferredValue(filterQuery);

  const visibleTaskIds = useMemo(() => {
    const ids = new Set();
    for (const task of tasks) {
      if (taskMatchesFilters(task, deferredQuery, filterPriority)) {
        ids.add(task.id);
      }
    }
    return ids;
  }, [tasks, deferredQuery, filterPriority]);

  const getTasksByStatus = useCallback(
    (status) => tasks.filter((task) => task.status === status).sort(sortInColumn).filter((task) => visibleTaskIds.has(task.id)),
    [tasks, visibleTaskIds]
  );

  const getColumnCount = useCallback((status) => tasks.filter((task) => task.status === status).length, [tasks]);

  const setErrorShort = (message) => {
    setError(message);
    window.clearTimeout(errorTimeoutRef.current);
    errorTimeoutRef.current = window.setTimeout(() => setError(''), 4200);
  };

  const refreshBoardAndPanels = async () => {
    await onTasksChange();
    await onStatsRefresh?.();
    setDetailRefreshSignal((current) => current + 1);
  };

  const readDragPayload = (event) => {
    try {
      const raw = event.dataTransfer.getData(DRAG_MIME) || event.dataTransfer.getData('text/plain');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const id = parsed && (typeof parsed.id === 'number' ? parsed.id : Number.parseInt(parsed.id, 10));
      if (!parsed || !Number.isFinite(id)) return null;
      return { id, status: parsed.status };
    } catch {
      return null;
    }
  };

  const handleDragStart = (event, task) => {
    if (!canChangeStatus) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(DRAG_MIME, JSON.stringify({ id: task.id, status: task.status }));
    event.dataTransfer.setData('text/plain', JSON.stringify({ id: task.id, status: task.status }));
  };

  const clearDragHighlights = () => {
    setDragOverColumn(null);
    setDragOverTaskId(null);
  };

  const persistBoard = async (nextTasks) => {
    if (isAllWorkspaces) return;

    const columnOrders = buildColumnOrders(nextTasks);
    try {
      const response = await taskAPI.patchBoard({ workspaceId, columnOrders });
      setTasks(response.data);
      await onStatsRefresh?.();
      setDetailRefreshSignal((current) => current + 1);
    } catch (err) {
      setErrorShort(err.response?.data?.error || 'Impossible de sauvegarder le tableau.');
      await onTasksChange();
    }
  };

  const runDrop = async (draggedId, targetStatus, insertBeforeId) => {
    const task = tasks.find((entry) => entry.id === draggedId);
    if (!task) {
      clearDragHighlights();
      return;
    }

    if (targetStatus === 'BLOCKED' && task.status !== 'BLOCKED') {
      setBlockModal({ open: true, task });
      clearDragHighlights();
      return;
    }

    const nextTasks = applyMove(tasks, draggedId, targetStatus, insertBeforeId);
    const before = JSON.stringify(buildColumnOrders(tasks));
    const after = JSON.stringify(buildColumnOrders(nextTasks));

    if (before === after) {
      clearDragHighlights();
      return;
    }

    setTasks(nextTasks);
    await persistBoard(nextTasks);
    clearDragHighlights();
  };

  const handleDropOnColumn = async (event, targetStatus) => {
    event.preventDefault();
    const payload = readDragPayload(event);
    clearDragHighlights();
    if (!payload) return;
    await runDrop(payload.id, targetStatus, null);
  };

  const handleDropOnTask = async (event, beforeTask) => {
    event.preventDefault();
    event.stopPropagation();
    const payload = readDragPayload(event);
    clearDragHighlights();
    if (!payload || beforeTask.id === payload.id) return;
    await runDrop(payload.id, beforeTask.status, beforeTask.id);
  };

  const handleBlockConfirm = async (reason) => {
    const task = blockModal.task;
    if (!task) return;

    try {
      await taskAPI.updateStatus(task.id, 'BLOCKED', reason);
      await refreshBoardAndPanels();
      setBlockModal({ open: false, task: null });
    } catch (err) {
      setErrorShort(err.response?.data?.error || 'Impossible de bloquer cette fiche.');
    }
  };

  const handleSaveTask = async (formData) => {
    try {
      if (editingTask) {
        await taskAPI.update(editingTask.id, formData);
      } else {
        await taskAPI.createBatch({
          tasks: formData.tasks || [formData],
          workspaceId,
          status: 'TODO',
        });
      }

      await refreshBoardAndPanels();
      setShowTaskModal(false);
      setEditingTask(null);
    } catch (err) {
      const message = err.response?.data?.error || 'Enregistrement impossible.';
      setErrorShort(message);
      throw err;
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Voulez-vous vraiment supprimer cette commande ?')) return;
    try {
      await taskAPI.delete(taskId);
      await refreshBoardAndPanels();
      setSelectedTaskId(null);
    } catch (err) {
      setErrorShort(err.response?.data?.error || 'Impossible de supprimer cette fiche.');
    }
  };

  const roleHint = isAllWorkspaces
    ? 'Vue transverse sur tous les espaces de production.'
    : canChangeStatus
    ? 'Le planificateur peut faire avancer les fiches entre A faire, En cours, Bloque et Termine.'
    : canCreateTask
    ? 'Le commercial saisit les demandes clients uniquement dans la colonne A faire.'
    : isSuperAdmin
    ? 'Le role suivi observe les commandes, les retards et les blocages sans modifier le flux.'
    : 'Mode consultation.';

  return (
    <div className="kanban-board-wrap">
      <div className="kanban-board__heading">
        <div>
          <nav className="kanban-breadcrumb" aria-label="Fil d Ariane">
            <span>Production</span>
            <span aria-hidden>/</span>
            <strong>Suivi de production</strong>
          </nav>
          <h2 className="kanban-board__title">Tableau de suivi</h2>
          <p className="kanban-board__hint">{roleHint}</p>
        </div>
        {canCreateTask && !isAllWorkspaces && (
          <button
            type="button"
            className="btn btn-primary kanban-board__cta"
            onClick={() => {
              setEditingTask(null);
              setShowTaskModal(true);
            }}
          >
            {isCommercial ? '+ Nouvelle commande client' : '+ Nouvelle fiche'}
          </button>
        )}
      </div>

      {error && <div className="kanban-board__error">{error}</div>}

      <div className="kanban-board__grid">
        {COLUMNS.map((column) => {
          const columnTasks = getTasksByStatus(column.id);
          const totalInColumn = getColumnCount(column.id);
          const isDragTarget = dragOverColumn === column.id;
          const filteredEmpty = totalInColumn > 0 && columnTasks.length === 0 && (deferredQuery.trim() || filterPriority);

          return (
            <section
              key={column.id}
              className={`kanban-column ${isDragTarget ? 'kanban-column--drop' : ''}`}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setDragOverColumn(column.id);
              }}
              onDrop={(event) => handleDropOnColumn(event, column.id)}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setDragOverColumn(null);
                }
              }}
              style={{ background: isDragTarget ? column.headerBg : column.bg, borderColor: `${column.color}22` }}
            >
              <div className="kanban-column__head" style={{ background: column.headerBg, borderBottomColor: `${column.color}33` }}>
                <div>
                  <span className="kanban-column__title" style={{ color: column.color }}>
                    {column.label}
                  </span>
                  <div className="kanban-column__subtitle">{column.id === 'BLOCKED' ? 'Interventions requises' : column.id === 'DONE' ? 'Archive visuelle' : 'File active'}</div>
                </div>
                <span className="kanban-column__count" style={{ background: column.color }}>
                  {deferredQuery.trim() || filterPriority ? `${columnTasks.length}/${totalInColumn}` : totalInColumn}
                </span>
              </div>

              <div className="kanban-column__body">
                {filteredEmpty ? (
                  <div className="kanban-column__empty kanban-column__empty--filter">Aucune fiche ne correspond aux filtres.</div>
                ) : columnTasks.length === 0 ? (
                  <div className="kanban-column__empty">{canChangeStatus ? 'Deposez une fiche ici.' : 'Aucune fiche.'}</div>
                ) : (
                  columnTasks.map((task) => (
                    <div
                      key={task.id}
                      className="kanban-card-slot"
                      draggable={canChangeStatus}
                      onDragStart={(event) => handleDragStart(event, task)}
                      onDragEnd={clearDragHighlights}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        event.dataTransfer.dropEffect = 'move';
                        setDragOverTaskId(task.id);
                      }}
                      onDrop={(event) => handleDropOnTask(event, task)}
                      style={{ outline: dragOverTaskId === task.id ? `2px solid ${column.color}` : 'none' }}
                    >
                      <TaskCard task={task} onOpen={(currentTask) => setSelectedTaskId(currentTask.id)} isDragging={false} />
                    </div>
                  ))
                )}
              </div>

              {canCreateTask && !isAllWorkspaces && column.id === 'TODO' && (
                <button
                  type="button"
                  className="kanban-column__create"
                  onClick={() => {
                    setEditingTask(null);
                    setShowTaskModal(true);
                  }}
                >
                  + Ajouter une demande
                </button>
              )}
            </section>
          );
        })}
      </div>

      {showTaskModal && (
        <TaskModal
          task={editingTask}
          defaultStatus="TODO"
          users={users}
          canAssign={canChangeStatus}
          onSave={handleSaveTask}
          onClose={() => {
            setShowTaskModal(false);
            setEditingTask(null);
          }}
        />
      )}

      {blockModal.open && (
        <BlockReasonModal
          task={blockModal.task}
          onConfirm={handleBlockConfirm}
          onCancel={() => setBlockModal({ open: false, task: null })}
        />
      )}

      <TaskDetailsPanel
        open={Boolean(selectedTaskId)}
        taskId={selectedTaskId}
        refreshSignal={detailRefreshSignal}
        canManage={canChangeStatus}
        canEdit={canChangeStatus || canCreateTask || isSuperAdmin}
        onClose={() => setSelectedTaskId(null)}
        onEditTask={(task) => {
          setEditingTask(task);
          setShowTaskModal(true);
        }}
        onDeleteTask={handleDeleteTask}
        onTaskUpdated={refreshBoardAndPanels}
      />
    </div>
  );
};

export default KanbanBoard;
