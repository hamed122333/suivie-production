const TaskModel = require('../models/taskModel');
const TaskCommentModel = require('../models/taskCommentModel');
const TaskHistoryModel = require('../models/taskHistoryModel');
const StockImportModel = require('../models/stockImportModel');
const UserModel = require('../models/userModel');
const NotificationModel = require('../models/notificationModel');
const { TASK_STATUSES, TASK_STATUS_LABELS, TRACKED_TASK_FIELDS } = require('../constants/task');
const { createHttpError, isHttpError } = require('../utils/httpErrors');
const { applyTaskVisibility, buildTaskFilters, canAccessTask, parseWorkspaceId } = require('../utils/taskScope');
const { normalizeCommentBody, normalizeTaskBatch, normalizeTaskDraft, normalizeTaskUpdatePayload } = require('../utils/taskValidation');
const ExcelJS = require('exceljs'); // Add ExcelJS import for exports

const fieldLabels = {
  title: 'Titre',
  description: 'Description',
  priority: 'Priorite',
  assignedTo: 'Affectation',
  clientName: 'Client',
  orderCode: 'Code commande',
  itemReference: 'Reference article',
  quantity: 'Quantite',
  quantityUnit: 'Unite',
  dueDate: 'Date d echeance',
  plannedDate: 'Date planifiee',
  productionLine: 'Ligne de production',
  machine: 'Machine',
  workshop: 'Atelier',
  notes: 'Notes',
  expectedAction: 'Action attendue',
};

function toHistoryValue(task, field) {
  const map = {
    assignedTo: task.assigned_to,
    clientName: task.client_name,
    orderCode: task.order_code,
    itemReference: task.item_reference,
    quantity: task.quantity,
    quantityUnit: task.quantity_unit,
    dueDate: task.due_date,
    plannedDate: task.planned_date,
    productionLine: task.production_line,
    machine: task.machine,
    workshop: task.workshop,
    notes: task.notes,
    expectedAction: task.expected_action,
  };

  return Object.prototype.hasOwnProperty.call(map, field) ? map[field] : task[field];
}

function buildUpdateHistoryEntries(beforeTask, payload, actorId) {
  return TRACKED_TASK_FIELDS
    .filter((field) => Object.prototype.hasOwnProperty.call(payload, field))
    .map((field) => {
      const oldValue = toHistoryValue(beforeTask, field);
      const newValue = payload[field];
      if (`${oldValue ?? ''}` === `${newValue ?? ''}`) {
        return null;
      }
      return {
        taskId: beforeTask.id,
        actorId,
        actionType: 'field_updated',
        fieldName: field,
        oldValue,
        newValue,
        message: `${fieldLabels[field] || field} modifie`,
      };
    })
    .filter(Boolean);
}

async function notifyTaskCreation(createdTasks, actor) {
  if (!Array.isArray(createdTasks) || createdTasks.length === 0) return;
  const recipients = await UserModel.findByRoles(['planner', 'super_admin']);
  if (!Array.isArray(recipients) || recipients.length === 0) return;

  await NotificationModel.createTaskCreatedNotifications({
    taskIds: createdTasks.map((task) => task.id),
    recipientUserIds: recipients.map((user) => user.id),
    createdByName: actor?.name,
  });
}

async function deductStockForTask(taskLike, quantityOverride = null) {
  const qty = Number(quantityOverride ?? taskLike?.quantity ?? 1);
  if (!Number.isFinite(qty) || qty <= 0) return;
  if (taskLike?.stock_import_id) {
    await StockImportModel.deductQuantity(taskLike.stock_import_id, qty);
    return;
  }
  if (taskLike?.item_reference) {
    await StockImportModel.deductQuantityByArticle(taskLike.item_reference, qty);
  }
}

async function addStockForTask(taskLike, quantityOverride = null) {
  const qty = Number(quantityOverride ?? taskLike?.quantity ?? 1);
  if (!Number.isFinite(qty) || qty <= 0) return;
  if (taskLike?.stock_import_id) {
    await StockImportModel.addQuantity(taskLike.stock_import_id, qty);
    return;
  }
  if (taskLike?.item_reference) {
    await StockImportModel.addQuantityByArticle(taskLike.item_reference, qty);
  }
}

function ensurePlannedDateForWaitingStock(taskInput, index = null) {
  if (taskInput.status !== 'WAITING_STOCK') return;
  if (taskInput.plannedDate) return;
  const suffix = Number.isInteger(index) ? ` (ligne ${index + 1})` : '';
  throw createHttpError(400, `La date prevue de livraison est obligatoire pour le statut Hors stock PF${suffix}`);
}

function normalizeDateNegotiationDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw createHttpError(400, 'Date de livraison invalide');
  }
  return date.toISOString().slice(0, 10);
}

async function resolveCreationTarget(taskInput) {
  const quantity = Number(taskInput.quantity || 1);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw createHttpError(400, 'Quantite invalide pour la commande');
  }

  const stockProbe = await StockImportModel.findAvailableForTask({
    stockImportId: taskInput.stockImportId,
    itemReference: taskInput.itemReference,
    requiredQuantity: quantity,
  });

  if (stockProbe?.available) {
    return {
      ...taskInput,
      status: 'TODO',
      stockImportId: taskInput.stockImportId || stockProbe.stockImportId,
      autoReason: 'stock_available',
    };
  }

  return {
    ...taskInput,
    status: 'WAITING_STOCK',
    stockImportId: taskInput.stockImportId || stockProbe?.stockImportId || null,
    autoReason: stockProbe ? 'stock_insufficient' : 'stock_missing',
  };
}

const taskController = {
  async reorderBoard(req, res) {
    try {
      const { columnOrders, workspaceId } = req.body;
      if (!columnOrders || typeof columnOrders !== 'object') {
        return res.status(400).json({ error: 'columnOrders object is required' });
      }
      const wid = parseWorkspaceId(workspaceId, { required: true });

      const currentTasks = await TaskModel.getAll({ workspaceId: wid });
      const nextTasks = await TaskModel.reorderBoard(columnOrders, wid);

      const statusChanges = [];
      const nextTasksMap = new Map(nextTasks.map((t) => [t.id, t.status]));

      for (const beforeTask of currentTasks) {
        const afterStatus = nextTasksMap.get(beforeTask.id);
        if (afterStatus && beforeTask.status !== afterStatus) {
            statusChanges.push({
                taskId: beforeTask.id,
                actorId: req.user.id,
                actionType: 'status_updated',
                fieldName: 'status',
                oldValue: beforeTask.status,
                newValue: afterStatus,
                message: `Statut changé de ${TASK_STATUS_LABELS[beforeTask.status] || beforeTask.status} vers ${TASK_STATUS_LABELS[afterStatus] || afterStatus}`,
            });

            // Handle stock quantities based on status changes
            if (afterStatus === 'DONE' && beforeTask.status !== 'DONE') {
              await deductStockForTask(beforeTask);
            } else if (beforeTask.status === 'DONE' && afterStatus !== 'DONE') {
              await addStockForTask(beforeTask);
            }
        }
      }

      if (statusChanges.length > 0) {
        if (TaskHistoryModel.logMany) {
            await TaskHistoryModel.logMany(statusChanges);
        } else {
            for (const change of statusChanges) {
                await TaskHistoryModel.log(change);
            }
        }
      }

      res.json(nextTasks);
    } catch (err) {
      if (isHttpError(err)) {
        return res.status(err.status).json({ error: err.message });
      }
      if (
        err.message &&
        (err.message.includes('Board order') ||
          err.message.includes('Duplicate') ||
          err.message.includes('Invalid task') ||
          err.message.includes('workspaceId'))
      ) {
        return res.status(400).json({ error: err.message });
      }
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async getAll(req, res) {
    try {
      const filters = applyTaskVisibility(buildTaskFilters(req.query), req.user);
      const tasks = await TaskModel.getAll(filters);
      res.json(tasks);
    } catch (err) {
      if (isHttpError(err)) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async exportExcel(req, res) {
    try {
      const filters = applyTaskVisibility(buildTaskFilters(req.query), req.user);
      const tasks = await TaskModel.getAll(filters);

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Taches');

      worksheet.columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Titre', key: 'title', width: 30 },
        { header: 'Statut', key: 'status', width: 15 },
        { header: 'Priorite', key: 'priority', width: 15 },
        { header: 'Commercial', key: 'commercialName', width: 20 },
        { header: 'Assignee a', key: 'assigneeName', width: 20 },
        { header: 'Client', key: 'clientName', width: 20 },
        { header: 'Article', key: 'itemReference', width: 20 },
        { header: 'Quantite', key: 'quantity', width: 15 },
        { header: 'Description', key: 'description', width: 40 },
        { header: 'Espace (Workspace)', key: 'workspaceName', width: 25 },
        { header: 'Date de Creation', key: 'createdAt', width: 20 }
      ];

      worksheet.addRows(tasks.map(t => ({
        id: `T-${t.id}`,
        title: t.title,
        status: t.status,
        priority: t.priority,
        commercialName: t.created_by_name || 'Systeme',
        assigneeName: t.assigned_to_name || 'Non assigne',
        clientName: t.client_name || '',
        itemReference: t.item_reference || '',
        quantity: t.quantity ? `${t.quantity} ${t.quantity_unit || 'pcs'}` : '',
        description: t.description || '',
        workspaceName: t.workspace_name || '',
        createdAt: new Date(t.created_at).toLocaleDateString()
      })));

      // Styling headers
      worksheet.getRow(1).font = { bold: true };

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="export_taches_${new Date().toISOString().slice(0, 10)}.xlsx"`
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error during Excel export' });
    }
  },

  async getById(req, res) {
    try {
      const task = await TaskModel.getById(req.params.id);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      if (!canAccessTask(req.user, task)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      res.json(task);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  },

  async getDetail(req, res) {
    try {
      const task = await TaskModel.getById(req.params.id);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      if (!canAccessTask(req.user, task)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const [comments, history] = await Promise.all([
        TaskCommentModel.listByTask(task.id),
        TaskHistoryModel.listByTask(task.id),
      ]);

      res.json({ task, comments, history });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async create(req, res) {
    try {
      const taskInput = normalizeTaskDraft(req.body);
      const workspaceId = parseWorkspaceId(req.body.workspaceId, { required: true });
      const resolved = await resolveCreationTarget(taskInput);
      ensurePlannedDateForWaitingStock(resolved);

      const task = await TaskModel.create({
        ...resolved,
        createdBy: req.user.id,
        workspaceId,
        status: resolved.status,
        proposedDeliveryDate: resolved.plannedDate || null,
        proposedByRole: 'commercial',
        dateNegotiationStatus: resolved.plannedDate ? 'PENDING_PLANNER_REVIEW' : null,
        dateNegotiationComment: null,
        dateNegotiationUpdatedAt: resolved.plannedDate ? new Date() : null,
      });
      await TaskHistoryModel.log({
        taskId: task.id,
        actorId: req.user.id,
        actionType: 'created',
        message: 'Tâche créée par le commercial',
      });
      await notifyTaskCreation([task], req.user);
      res.status(201).json({
        task,
        autoStatus: resolved.status,
        reason: resolved.autoReason,
      });
    } catch (err) {
      if (isHttpError(err)) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async createBulk(req, res) {
    try {
      const tasks = normalizeTaskBatch(req.body.tasks);
      const workspaceId = parseWorkspaceId(req.body.workspaceId, { required: true });
      const resolvedTasks = [];
      for (let index = 0; index < tasks.length; index += 1) {
        const resolved = await resolveCreationTarget(tasks[index]);
        ensurePlannedDateForWaitingStock(resolved, index);
        resolvedTasks.push(resolved);
      }

      const todoDrafts = resolvedTasks.filter((task) => task.status === 'TODO');
      const waitingDrafts = resolvedTasks.filter((task) => task.status === 'WAITING_STOCK');

      const [createdTodo, createdWaiting] = await Promise.all([
        todoDrafts.length > 0
          ? TaskModel.createMany({
              tasks: todoDrafts.map((draft) => ({
                ...draft,
                proposedDeliveryDate: draft.plannedDate || null,
                proposedByRole: 'commercial',
                dateNegotiationStatus: draft.plannedDate ? 'PENDING_PLANNER_REVIEW' : null,
                dateNegotiationComment: null,
                dateNegotiationUpdatedAt: draft.plannedDate ? new Date() : null,
              })),
              createdBy: req.user.id,
              workspaceId,
              status: 'TODO',
            })
          : Promise.resolve([]),
        waitingDrafts.length > 0
          ? TaskModel.createMany({
              tasks: waitingDrafts.map((draft) => ({
                ...draft,
                proposedDeliveryDate: draft.plannedDate || null,
                proposedByRole: 'commercial',
                dateNegotiationStatus: draft.plannedDate ? 'PENDING_PLANNER_REVIEW' : null,
                dateNegotiationComment: null,
                dateNegotiationUpdatedAt: draft.plannedDate ? new Date() : null,
              })),
              createdBy: req.user.id,
              workspaceId,
              status: 'WAITING_STOCK',
            })
          : Promise.resolve([]),
      ]);
      const createdTasks = [...createdTodo, ...createdWaiting];

      await TaskHistoryModel.logMany(
        createdTasks.map((task) => ({
          taskId: task.id,
          actorId: req.user.id,
          actionType: 'created',
          message: 'Tâche créée par le commercial',
        }))
      );
      await notifyTaskCreation(createdTasks, req.user);

      // Do not mark as used immediately, let the deduction handle it when DONE
      // const stockImportIds = createdTasks
      //   .map((task) => task.stock_import_id)
      //   .filter(Boolean);
      // if (stockImportIds.length > 0) {
      //   await StockImportModel.markManyAsUsed(stockImportIds);
      // }

      res.status(201).json({
        tasks: createdTasks,
        createdTodo: createdTodo.length,
        createdWaitingStock: createdWaiting.length,
      });
    } catch (err) {
      if (isHttpError(err)) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async update(req, res) {
    try {
      const previousTask = await TaskModel.getById(req.params.id);
      if (!previousTask) return res.status(404).json({ error: 'Task not found' });

      const payload = normalizeTaskUpdatePayload(req.body);
      if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
        return res.status(400).json({ error: 'Le statut doit etre change via endpoint de statut dedie.' });
      }
      const task = await TaskModel.update(req.params.id, payload);
      if (!task) return res.status(404).json({ error: 'Task not found' });

      // Handle stock quantities if the task is already DONE and quantity changed
      if (previousTask.status === 'DONE' && task.status === 'DONE') {
        const oldQty = previousTask.quantity || 1;
        const newQty = task.quantity || 1;
        
        if (newQty !== oldQty) {
          const diff = newQty - oldQty;
          if (diff > 0) {
            await deductStockForTask(task, diff);
          } else if (diff < 0) {
            await addStockForTask(task, Math.abs(diff));
          }
        }
      }

      // Handle stock quantities if the API payload also somehow changed the status
      if (payload.status && previousTask.status !== payload.status) {
        if (previousTask.status !== 'DONE' && task.status === 'DONE') {
          await deductStockForTask(task);
        } else if (previousTask.status === 'DONE' && task.status !== 'DONE') {
          await addStockForTask(task);
        }
      }

      const historyEntries = buildUpdateHistoryEntries(previousTask, payload, req.user.id);
      if (historyEntries.length > 0) {
        await TaskHistoryModel.logMany(historyEntries);
      }


      res.json(task);
    } catch (err) {
      if (isHttpError(err)) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async updateStatus(req, res) {
    try {
      const { status, reasonBlocked } = req.body;
      if (!TASK_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      if (status === 'BLOCKED' && !reasonBlocked) {
        return res.status(400).json({ error: 'Reason required when blocking a task' });
      }

      const previousTask = await TaskModel.getById(req.params.id);
      if (!previousTask) return res.status(404).json({ error: 'Task not found' });

      const task = await TaskModel.updateStatus(
        req.params.id,
        status,
        reasonBlocked || null,
        req.user.id,
        req.user.role
      );
      if (!task) return res.status(404).json({ error: 'Task not found' });

      // Handle stock quantities based on status changes
      if (previousTask.status !== 'DONE' && task.status === 'DONE') {
        await deductStockForTask(task);
      } else if (previousTask.status === 'DONE' && task.status !== 'DONE') {
        await addStockForTask(task);
      }

      await TaskHistoryModel.log({
        taskId: task.id,
        actorId: req.user.id,
        actionType: 'status_updated',
        fieldName: 'status',
        oldValue: previousTask.status,
        newValue: task.status,
        message: `Statut change de ${TASK_STATUS_LABELS[previousTask.status] || previousTask.status} vers ${TASK_STATUS_LABELS[task.status] || task.status}`,
      });

      if (previousTask.status === 'WAITING_STOCK' && task.status === 'TODO') {
        await TaskHistoryModel.log({
          taskId: task.id,
          actorId: req.user.id,
          actionType: 'stock_confirmed',
          fieldName: 'stock',
          message: 'Stock confirme par le planner, fiche deplacee vers A faire',
        });
      }

      if (status === 'BLOCKED' && reasonBlocked) {
        await TaskHistoryModel.log({
          taskId: task.id,
          actorId: req.user.id,
          actionType: 'blocked',
          message: `Blocage declare: ${reasonBlocked}`,
        });
      }

      res.json(task);
    } catch (err) {
      if (err.message === 'Not authorized to update this task') {
        return res.status(403).json({ error: err.message });
      }
      if (err.message === 'WAITING_STOCK status can only be changed by system auto promotion') {
        return res.status(400).json({ error: 'Le statut Hors stock est gere uniquement par le systeme.' });
      }
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async applyDateNegotiation(req, res) {
    try {
      const task = await TaskModel.getById(req.params.id);
      if (!task) return res.status(404).json({ error: 'Task not found' });

      const role = req.user?.role;
      if (!['planner', 'commercial'].includes(role)) {
        return res.status(403).json({ error: 'Acces refuse' });
      }

      const action = `${req.body.action || ''}`.trim().toUpperCase();
      const comment = `${req.body.comment || ''}`.trim() || null;
      const proposedDate = normalizeDateNegotiationDate(req.body.proposedDate);
      const now = new Date();

      let patch = null;
      let historyMessage = null;
      let historyOldValue = null;
      let historyNewValue = null;

      if (action === 'PROPOSE') {
        if (!proposedDate) {
          return res.status(400).json({ error: 'Date proposee obligatoire.' });
        }
        patch = {
          proposedDeliveryDate: proposedDate,
          proposedByRole: role,
          dateNegotiationStatus: role === 'commercial' ? 'PENDING_PLANNER_REVIEW' : 'PENDING_COMMERCIAL_REVIEW',
          dateNegotiationComment: comment,
          dateNegotiationUpdatedAt: now,
        };
        historyMessage =
          role === 'commercial'
            ? 'Le commercial a propose une date de livraison au planner'
            : 'Le planner a propose une date de livraison au commercial';
        historyOldValue = task.proposed_delivery_date || task.planned_date || null;
        historyNewValue = proposedDate;
      } else if (action === 'ACCEPT') {
        const pendingForPlanner = task.date_negotiation_status === 'PENDING_PLANNER_REVIEW' && role === 'planner';
        const pendingForCommercial = task.date_negotiation_status === 'PENDING_COMMERCIAL_REVIEW' && role === 'commercial';
        if (!pendingForPlanner && !pendingForCommercial) {
          return res.status(400).json({ error: 'Aucune proposition en attente pour ce role.' });
        }
        const acceptedDate = task.proposed_delivery_date || task.planned_date;
        if (!acceptedDate) {
          return res.status(400).json({ error: 'Aucune date proposee a accepter.' });
        }
        patch = {
          plannedDate: acceptedDate,
          dateNegotiationStatus: 'ACCEPTED',
          dateNegotiationComment: comment,
          dateNegotiationUpdatedAt: now,
        };
        historyMessage =
          role === 'planner'
            ? 'Le planner a accepte la date proposee par le commercial'
            : 'Le commercial a accepte la contre-proposition du planner';
        historyOldValue = task.planned_date || null;
        historyNewValue = acceptedDate;
      } else if (action === 'REJECT') {
        if (!proposedDate) {
          return res.status(400).json({ error: 'Nouvelle date obligatoire en cas de refus.' });
        }
        if (!comment) {
          return res.status(400).json({ error: 'Commentaire obligatoire en cas de refus.' });
        }
        patch = {
          proposedDeliveryDate: proposedDate,
          proposedByRole: role,
          dateNegotiationStatus: role === 'planner' ? 'PENDING_COMMERCIAL_REVIEW' : 'PENDING_PLANNER_REVIEW',
          dateNegotiationComment: comment,
          dateNegotiationUpdatedAt: now,
        };
        historyMessage =
          role === 'planner'
            ? 'Le planner a refuse la date et propose une nouvelle date'
            : 'Le commercial a refuse la date et propose une nouvelle date';
        historyOldValue = task.proposed_delivery_date || task.planned_date || null;
        historyNewValue = proposedDate;
      } else {
        return res.status(400).json({ error: 'Action invalide. Utilisez PROPOSE, ACCEPT ou REJECT.' });
      }

      const updated = await TaskModel.updateDateNegotiation(task.id, patch);
      await TaskHistoryModel.log({
        taskId: task.id,
        actorId: req.user.id,
        actionType: 'date_negotiation',
        fieldName: 'planned_date',
        oldValue: historyOldValue,
        newValue: historyNewValue,
        message: historyMessage,
      });
      return res.json(updated);
    } catch (err) {
      if (isHttpError(err)) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  },

  async delete(req, res) {
    try {
      const taskToDelete = await TaskModel.getById(req.params.id);
      
      const task = await TaskModel.delete(req.params.id);
      if (!task) return res.status(404).json({ error: 'Task not found' });

      // If we delete a task that was DONE, restore the stock
      if (taskToDelete && taskToDelete.status === 'DONE') {
        await addStockForTask(taskToDelete);
      }

      res.json({ message: 'Task deleted' });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  },

  async addComment(req, res) {
    try {
      const task = await TaskModel.getById(req.params.id);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      if (!canAccessTask(req.user, task)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const comment = await TaskCommentModel.create({
        taskId: task.id,
        authorId: req.user.id,
        body: normalizeCommentBody(req.body.body),
      });

      await TaskHistoryModel.log({
        taskId: task.id,
        actorId: req.user.id,
        actionType: 'comment_added',
        message: 'Commentaire ajoute',
      });

      const enrichedComments = await TaskCommentModel.listByTask(task.id);
      res.status(201).json(enrichedComments.find((entry) => entry.id === comment.id) || comment);
    } catch (err) {
      if (isHttpError(err)) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
};

module.exports = taskController;
