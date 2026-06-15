import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import BlockReasonModal from './BlockReasonModal';
import DateValidationModal from './DateValidationModal';
import PreparationModal from './PreparationModal';
import DeliveryModal from './DeliveryModal';
import TaskCard from './TaskCard';
import TaskDetailsPanel from './TaskDetailsPanel';
import TaskModal from './TaskModal';
import { TASK_STATUS_CONFIG, TASK_STATUS_ORDER, TASK_WIP_LIMITS } from '../constants/task';
import { useAuth } from '../context/AuthContext';
import { taskAPI } from '../services/api';
import './KanbanBoard.css';

const ALL_COLUMNS = TASK_STATUS_ORDER.map((status) => ({
  id: status,
  ...TASK_STATUS_CONFIG[status],
}));

// Which columns each role sees on the Kanban board
const COLUMNS_FOR_ROLE = {
  planner:     TASK_STATUS_ORDER,
  super_admin: TASK_STATUS_ORDER,
  commercial:  ['WAITING_STOCK', 'TODO', 'IN_PROGRESS', 'DONE', 'DELIVERED'],
  livreur:     ['DONE', 'DELIVERED'],
  user:        TASK_STATUS_ORDER,
};

function getColumnSubtitle(columnId, isLivreur) {
  if (isLivreur) {
    if (columnId === 'DONE')      return 'Glissez vers « Livré » — une commande, livraisons progressives';
    if (columnId === 'DELIVERED') return 'Livraisons confirmées ✓';
  }
  if (columnId === 'WAITING_STOCK') return 'Entrée — glissez vers À Préparer (planificateur)';
  if (columnId === 'TODO')          return 'Pris en charge par le planificateur';
  if (columnId === 'IN_PROGRESS')   return 'En préparation — passage auto en Prêt dès stock PF';
  if (columnId === 'DONE')          return 'Stock PF confirmé (auto) — en attente du livreur';
  if (columnId === 'BLOCKED')       return 'Exception — intervention requise';
  if (columnId === 'DELIVERED')     return 'Livré au client ✓';
  return '';
}

const DRAG_MIME = 'application/x-suivi-task';

function getDaysUntilDate(dateString) {
  if (!dateString) return 9999;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateString) - today) / 86400000);
}

function sortInColumn(a, b) {
  // Dans la colonne WAITING_STOCK, les tâches à J-2 ou J-1 remontent en tête
  if (a.status === 'WAITING_STOCK' && b.status === 'WAITING_STOCK') {
    const da = getDaysUntilDate(a.planned_date);
    const db = getDaysUntilDate(b.planned_date);
    const aAlert = da <= 2;
    const bAlert = db <= 2;
    if (aAlert !== bAlert) return aAlert ? -1 : 1;
    if (da !== db) return da - db;
  }

  const rank = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const ra = rank[a.priority] ?? 9;
  const rb = rank[b.priority] ?? 9;
  if (ra !== rb) return ra - rb;
  const pa = a.board_position ?? 0;
  const pb = b.board_position ?? 0;
  if (pa !== pb) return pa - pb;
  return (a.id ?? 0) - (b.id ?? 0);
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

function localISODate(dateStr) {
  if (!dateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function taskMatchesFilters(task, filterQuery, filterPriority, filterCategory, filterCriticalDeficit, filterPredictiveOnly, filterCommercial, filterDate) {
  if (filterPriority && task.priority !== filterPriority) return false;
  if (filterCategory && task.item_reference) {
    const prefix = task.item_reference.substring(0, 2).toUpperCase();
    if (prefix !== filterCategory) return false;
  }
  if (filterCriticalDeficit && (!task.stock_deficit || task.stock_deficit <= 0)) return false;
  if (filterPredictiveOnly && task.task_type !== 'PREDICTIVE') return false;
  // Filter by commercial code (VL000XXX)
  if (filterCommercial && task.commercial_id !== filterCommercial) return false;
  // Filter by specific day (from day bar click)
  if (filterDate && localISODate(task.planned_date) !== filterDate) return false;

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
  filterQuery = '',
  filterPriority = '',
  filterCategory = '',
  filterCriticalDeficit = false,
  filterPredictiveOnly = false,
  filterCommercial = '',
  filterDate = null,
}) => {
  const { canChangeStatus, canCreateTask, isCommercial, isLivreur, canMarkDelivered, user } = useAuth();

  // Build the column list based on the current user's role
  const COLUMNS = useMemo(() => {
    const allowedStatuses = COLUMNS_FOR_ROLE[user?.role] || TASK_STATUS_ORDER;
    return ALL_COLUMNS.filter((col) => allowedStatuses.includes(col.id));
  }, [user?.role]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [blockModal, setBlockModal] = useState({ open: false, task: null });
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const [dragOverTaskId, setDragOverTaskId] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(() => {
    const taskIdString = searchParams.get('taskId');
    return taskIdString ? parseInt(taskIdString, 10) : null;
  });
  const [error, setError] = useState('');
  const [detailRefreshSignal, setDetailRefreshSignal] = useState(0);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [dateModal, setDateModal] = useState({ open: false, task: null });
  const [dateModalWorking, setDateModalWorking] = useState(false);
  const [prepModal, setPrepModal] = useState({ open: false, task: null });
  const [prepModalWorking, setPrepModalWorking] = useState(false);
  const [deliveryModal, setDeliveryModal] = useState({ open: false, task: null });
  const [deliveryModalWorking, setDeliveryModalWorking] = useState(false);
  const errorTimeoutRef = useRef(null);

  useEffect(() => {
    const taskIdString = searchParams.get('taskId');
    if (taskIdString) {
      setSelectedTaskId(parseInt(taskIdString, 10));
    }
  }, [searchParams]);

  const handleSelectTask = (taskId) => {
    setSelectedTaskId(taskId);
    if (!taskId) {
      setSearchParams((prev) => {
        const newParams = new URLSearchParams(prev);
        newParams.delete('taskId');
        return newParams;
      });
    } else {
      setSearchParams((prev) => {
        const newParams = new URLSearchParams(prev);
        newParams.set('taskId', taskId.toString());
        return newParams;
      });
    }
  };

  const deferredQuery = useDeferredValue(filterQuery);
  const hasActiveFilters = Boolean(deferredQuery.trim() || filterPriority || filterCategory || filterCriticalDeficit || filterPredictiveOnly || filterCommercial || filterDate);

  const visibleTasks = useMemo(() => {
    return tasks.filter((task) =>
      taskMatchesFilters(task, deferredQuery, filterPriority, filterCategory, filterCriticalDeficit, filterPredictiveOnly, filterCommercial, filterDate)
    );
  }, [tasks, deferredQuery, filterPriority, filterCategory, filterCriticalDeficit, filterPredictiveOnly, filterCommercial, filterDate]);

      const visibleTaskIds = useMemo(() => new Set(visibleTasks.map((t) => t.id)), [visibleTasks]);

  const getTasksByStatus = useCallback(
    (status) => tasks.filter((task) => task.status === status).sort(sortInColumn).filter((task) => visibleTaskIds.has(task.id)),
    [tasks, visibleTaskIds]
  );

  const getColumnCount = useCallback((status) => tasks.filter((task) => task.status === status).length, [tasks]);
  const visibleCount = visibleTaskIds.size;
  const totalCount = tasks.length;

  const setErrorShort = (message) => {
    setError(message);
    window.clearTimeout(errorTimeoutRef.current);
    errorTimeoutRef.current = window.setTimeout(() => setError(''), 4200);
  };

  const refreshBoardAndPanels = async () => {
    await onTasksChange();
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
    // Planner/super_admin can drag most cards; livreur can drag DONE → DELIVERED only
    if (!canChangeStatus && !isLivreur) return;
    // Livreur can only drag DONE cards
    if (isLivreur && task.status !== 'DONE') {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(DRAG_MIME, JSON.stringify({ id: task.id, status: task.status }));
    event.dataTransfer.setData('text/plain', JSON.stringify({ id: task.id, status: task.status }));
  };

  const clearDragHighlights = () => {
    setDragOverColumn(null);
    setDragOverTaskId(null);
  };

  const runDrop = async (draggedId, targetStatus, insertBeforeId) => {
    const task = tasks.find((entry) => entry.id === draggedId);
    if (!task) {
      clearDragHighlights();
      return;
    }

    // « Prêt à Livrer » est automatique (confirmation du stock PF) — pas de drop manuel.
    if (targetStatus === 'DONE') {
      setErrorShort('Le passage en « Prêt à Livrer » est automatique (confirmation du stock PF).');
      clearDragHighlights();
      return;
    }

    // Livreur : DONE → DELIVERED (livraison complète ou partielle via modale)
    if (targetStatus === 'DELIVERED') {
      if (!canMarkDelivered) {
        setErrorShort('Seul le livreur peut confirmer une livraison.');
        clearDragHighlights();
        return;
      }
      if (task.status !== 'DONE') {
        setErrorShort('Glissez uniquement les fiches « Prêt à Livrer » vers la colonne Livré.');
        clearDragHighlights();
        return;
      }
      setDeliveryModal({ open: true, task });
      clearDragHighlights();
      return;
    }

    // Livreur cannot perform any other drag
    if (isLivreur) {
      clearDragHighlights();
      return;
    }

    if (targetStatus === 'BLOCKED' && task.status !== 'BLOCKED') {
      setBlockModal({ open: true, task });
      clearDragHighlights();
      return;
    }

    // Prise en charge planificateur : Hors Stock PF → À Préparer → valider/négocier la date
    if (task.status === 'WAITING_STOCK' && targetStatus === 'TODO' && canChangeStatus) {
      setDateModal({ open: true, task });
      clearDragHighlights();
      return;
    }

    // Passage en préparation : À Préparer → En Préparation → complète ou partielle
    if (task.status === 'TODO' && targetStatus === 'IN_PROGRESS' && canChangeStatus) {
      setPrepModal({ open: true, task });
      clearDragHighlights();
      return;
    }

    // Same column → local reorder only (ordering is not persisted in the global view)
    if (task.status === targetStatus) {
      setTasks(applyMove(tasks, draggedId, targetStatus, insertBeforeId));
      clearDragHighlights();
      return;
    }

    // Different column → persist the new status (optimistic update + rollback on error)
    const previousTasks = tasks;
    setTasks(applyMove(tasks, draggedId, targetStatus, insertBeforeId));
    try {
      await taskAPI.updateStatus(draggedId, targetStatus);
      await refreshBoardAndPanels();
    } catch (err) {
      setTasks(previousTasks);
      setErrorShort(err.response?.data?.error || 'Impossible de changer le statut de cette fiche.');
    }
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

  // ── Prise en charge (Hors Stock PF → À Préparer) : valider ou négocier la date ──
  const closeDateModal = () => setDateModal({ open: false, task: null });

  const moveToTodo = async (task) => {
    await taskAPI.updateStatus(task.id, 'TODO');
    await refreshBoardAndPanels();
    closeDateModal();
  };

  const handleDateValidate = async () => {
    const task = dateModal.task;
    if (!task) return;
    setDateModalWorking(true);
    try {
      // Si le commercial avait proposé une date (en attente du planner) → l'accepter.
      if (task.date_negotiation_status === 'PENDING_PLANNER_REVIEW') {
        await taskAPI.dateNegotiation(task.id, { action: 'ACCEPT', proposedDate: null, comment: null });
      }
      await moveToTodo(task);
    } catch (err) {
      setErrorShort(err.response?.data?.error || 'Impossible de valider la date.');
    } finally { setDateModalWorking(false); }
  };

  const handleDatePropose = async (date) => {
    const task = dateModal.task;
    if (!task || !date) return;
    setDateModalWorking(true);
    try {
      await taskAPI.dateNegotiation(task.id, { action: 'PROPOSE', proposedDate: date, comment: null });
      await moveToTodo(task); // la fiche avance ; la négociation continue en parallèle
    } catch (err) {
      setErrorShort(err.response?.data?.error || 'Impossible de proposer cette date.');
    } finally { setDateModalWorking(false); }
  };

  // ── Livraison (Prêt à Livrer → Livré) : complète/partielle ──
  const closeDeliveryModal = () => setDeliveryModal({ open: false, task: null });

  const handleDeliveryConfirm = async ({ mode, quantity }) => {
    const task = deliveryModal.task;
    if (!task) return;
    setDeliveryModalWorking(true);
    try {
      if (mode === 'PARTIAL') {
        await taskAPI.markDelivered(task.id, { deliveredQuantity: quantity });
      } else {
        await taskAPI.markDelivered(task.id);
      }
      await refreshBoardAndPanels();
      closeDeliveryModal();
    } catch (err) {
      setErrorShort(err.response?.data?.error || 'Impossible de confirmer la livraison.');
    } finally { setDeliveryModalWorking(false); }
  };

  // ── Passage en préparation (À Préparer → En Préparation) : complète/partielle ──
  const closePrepModal = () => setPrepModal({ open: false, task: null });

  const handlePrepConfirm = async ({ mode, quantity }) => {
    const task = prepModal.task;
    if (!task) return;
    setPrepModalWorking(true);
    try {
      if (mode === 'PARTIAL') {
        // Reste UNE seule carte ; le commercial responsable est notifié pour validation.
        await taskAPI.partialPreparation(task.id, { action: 'REQUEST', preparedQuantity: quantity });
      } else {
        await taskAPI.updateStatus(task.id, 'IN_PROGRESS');
      }
      await refreshBoardAndPanels();
      closePrepModal();
    } catch (err) {
      setErrorShort(err.response?.data?.error || 'Impossible de passer en préparation.');
    } finally { setPrepModalWorking(false); }
  };

  const handleSaveTask = async (formData) => {
    try {
      if (editingTask) {
        await taskAPI.update(editingTask.id, formData);
      } else {
        await taskAPI.createBatch({
          tasks: formData.tasks || [formData],
          status: formData.status || null,
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

  const handleConfirmPredictive = async (taskId) => {
    try {
      await taskAPI.confirmPredictive(taskId);
      await refreshBoardAndPanels();
    } catch (err) {
      setErrorShort(err.response?.data?.error || 'Impossible de confirmer la commande prévisionnelle.');
    }
  };

  const handleDeleteTask = (taskId) => {
    setPendingDeleteId(taskId);
  };

  // Édition directe depuis la carte (ouvre le modal sans passer par le panneau
  // de détails → pas de superposition de deux overlays).
  const handleEditTask = (task) => {
    setEditingTask(task);
    setShowTaskModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!pendingDeleteId) return;
    try {
      await taskAPI.delete(pendingDeleteId);
      setPendingDeleteId(null);
      setSelectedTaskId(null);
      await refreshBoardAndPanels();
    } catch (err) {
      setPendingDeleteId(null);
      setErrorShort(err.response?.data?.error || 'Impossible de supprimer cette fiche.');
    }
  };

  const roleHint = isLivreur
    ? 'Livreur — glissez les fiches "Prêt à Livrer" vers la colonne Livré pour confirmer.'
    : 'Vue transverse sur toutes les commandes de production.';

  const readyToDeliverCount = tasks.filter((t) => t.status === 'DONE').length;

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
        <div className="kanban-board__summary" aria-label="Synthèse du tableau">
          <span>
            <strong>{totalCount}</strong>
            fiches
          </span>
          {hasActiveFilters && (
            <span>
              <strong>{visibleCount}</strong>
              visibles
            </span>
          )}
        </div>
      </div>

      {error && <div className="kanban-board__error">{error}</div>}

      {isLivreur && readyToDeliverCount > 0 && (
        <div className="kanban-board__alert kanban-board__alert--deliver" role="status">
          🚚 <strong>{readyToDeliverCount}</strong> commande{readyToDeliverCount > 1 ? 's' : ''} prête{readyToDeliverCount > 1 ? 's' : ''} à livrer
          — glissez-les vers la colonne <strong>Livré</strong>
        </div>
      )}

      <div className="kanban-board__grid">
        {COLUMNS.map((column) => {
          const columnTasks = getTasksByStatus(column.id);
          const totalInColumn = getColumnCount(column.id);
          const isDragTarget = dragOverColumn === column.id;
          const filteredEmpty = totalInColumn > 0 && columnTasks.length === 0 && hasActiveFilters;
          const priorityCount = columnTasks.filter((task) => task.priority === 'URGENT' || task.priority === 'HIGH').length;
          // Limite de WIP (soft) : alerte visuelle si la colonne dépasse sa capacité conseillée.
          const wipLimit = TASK_WIP_LIMITS[column.id] ?? null;
          const wipOver = wipLimit != null && totalInColumn > wipLimit;
          const wipNear = wipLimit != null && !wipOver && totalInColumn >= Math.ceil(wipLimit * 0.8);

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
              style={{
                '--column-color': column.color,
                '--column-bg': column.bg,
                '--column-header-bg': column.headerBg,
                background: isDragTarget ? column.headerBg : column.bg,
                borderColor: `${column.color}22`,
              }}
            >
              <div className="kanban-column__head">
                <div>
                  <span className="kanban-column__title">
                    {column.label}
                  </span>
                  <div className="kanban-column__subtitle">
                    {getColumnSubtitle(column.id, isLivreur)}
                  </div>
                </div>
                <div className="kanban-column__metrics">
                  {priorityCount > 0 && <span className="kanban-column__priority-count">{priorityCount} prio.</span>}
                  {wipLimit != null && (
                    <span
                      className={`kanban-column__wip${wipOver ? ' kanban-column__wip--over' : wipNear ? ' kanban-column__wip--near' : ''}`}
                      title={wipOver
                        ? `Limite de WIP dépassée : ${totalInColumn}/${wipLimit} — réduisez l'en-cours pour fluidifier le flux`
                        : `En-cours : ${totalInColumn}/${wipLimit} (limite conseillée)`}
                    >
                      WIP {totalInColumn}/{wipLimit}
                    </span>
                  )}
                  <span className="kanban-column__count">
                    {hasActiveFilters ? `${columnTasks.length}/${totalInColumn}` : totalInColumn}
                  </span>
                </div>
              </div>

              <div className="kanban-column__body">
                {filteredEmpty ? (
                  <div className="kanban-column__empty kanban-column__empty--filter">
                    <strong>Aucun résultat</strong>
                    <span>Cette colonne contient {totalInColumn} fiche{totalInColumn > 1 ? 's' : ''}, mais aucune ne correspond aux filtres.</span>
                  </div>
                ) : columnTasks.length === 0 ? (
                  <div className="kanban-column__empty">
                    <strong>Colonne vide</strong>
                    <span>{canChangeStatus && column.id !== 'WAITING_STOCK' ? 'Déposez une fiche ici pour changer son statut.' : 'Aucune fiche pour le moment.'}</span>
                  </div>
                ) : (
                  columnTasks.map((task) => (
                    <div
                      key={task.id}
                      className={`kanban-card-slot ${selectedTaskId === task.id ? 'kanban-card-slot--selected' : ''}`}
                      draggable={(canChangeStatus && task.status !== 'DONE') || (isLivreur && task.status === 'DONE')}
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
                      <TaskCard
                        task={task}
                        onOpen={(currentTask) => handleSelectTask(currentTask.id)}
                        isDragging={false}
                        canEdit={canChangeStatus || canCreateTask}
                        onEdit={handleEditTask}
                        onDelete={handleDeleteTask}
                      />
                    </div>
                  ))
                )}
              </div>

            </section>
          );
        })}
      </div>

      {showTaskModal && (
        <TaskModal
          task={editingTask}
          defaultStatus="WAITING_STOCK"
          users={users}
          canAssign={canChangeStatus}
          isCommercial={isCommercial}
          onSave={handleSaveTask}
          onClose={() => {
            setShowTaskModal(false);
            setEditingTask(null);
          }}
        />
      )}


      {blockModal.open && (
        <BlockReasonModal
          key={blockModal.task?.id}
          task={blockModal.task}
          onConfirm={handleBlockConfirm}
          onCancel={() => setBlockModal({ open: false, task: null })}
        />
      )}

      {pendingDeleteId && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Confirmer la suppression">
          <div className="modal-content" style={{ maxWidth: 380, textAlign: 'center' }}>
            <p style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Supprimer cette commande ?</p>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>Cette action est irréversible.</p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setPendingDeleteId(null)}>Annuler</button>
              <button type="button" className="btn btn-danger" onClick={handleDeleteConfirm}>Supprimer</button>
            </div>
          </div>
        </div>
      )}

      <TaskDetailsPanel
        open={Boolean(selectedTaskId)}
        taskId={selectedTaskId}
        refreshSignal={detailRefreshSignal}
        canManage={canChangeStatus}
        canConfirmPredictive={canCreateTask || canChangeStatus}
        onClose={() => handleSelectTask(null)}
        onConfirmPredictive={handleConfirmPredictive}
        onTaskUpdated={refreshBoardAndPanels}
      />

      {dateModal.open && (
        <DateValidationModal
          key={dateModal.task?.id}
          task={dateModal.task}
          working={dateModalWorking}
          onClose={closeDateModal}
          onValidate={handleDateValidate}
          onPropose={handleDatePropose}
        />
      )}

      {prepModal.open && (
        <PreparationModal
          key={prepModal.task?.id}
          task={prepModal.task}
          working={prepModalWorking}
          onClose={closePrepModal}
          onConfirm={handlePrepConfirm}
        />
      )}

      {deliveryModal.open && (
        <DeliveryModal
          key={deliveryModal.task?.id}
          task={deliveryModal.task}
          working={deliveryModalWorking}
          onClose={closeDeliveryModal}
          onConfirm={handleDeliveryConfirm}
        />
      )}
    </div>
  );
};

export default KanbanBoard;
