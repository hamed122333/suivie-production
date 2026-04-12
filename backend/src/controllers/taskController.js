const TaskModel = require('../models/taskModel');
const TaskCommentModel = require('../models/taskCommentModel');
const TaskHistoryModel = require('../models/taskHistoryModel');
const StockImportModel = require('../models/stockImportModel');
const WorkspaceModel = require('../models/workspaceModel');
const { TASK_STATUSES, TASK_STATUS_LABELS, TRACKED_TASK_FIELDS } = require('../constants/task');
const { WORKSPACE_TYPES } = require('../constants/workspace');
const { createHttpError, isHttpError } = require('../utils/httpErrors');
const { applyTaskVisibility, buildTaskFilters, canAccessTask, parseWorkspaceId } = require('../utils/taskScope');
const { normalizeCommentBody, normalizeTaskBatch, normalizeTaskDraft, normalizeTaskUpdatePayload } = require('../utils/taskValidation');

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

async function loadWorkspaceOrFail(workspaceId) {
  const workspace = await WorkspaceModel.findById(workspaceId);
  if (!workspace) {
    throw createHttpError(404, 'Espace introuvable');
  }
  return workspace;
}

function applyWorkspaceTypeRules(tasks, workspace) {
  return tasks.map((task) => {
    const normalized = { ...task, taskType: workspace.type };

    if (workspace.type === WORKSPACE_TYPES.STOCK) {
      if (task.stockImportId == null) {
        throw createHttpError(400, 'Cet espace est limite aux produits finis importes.');
      }
    } else {
      normalized.stockImportId = null;
    }

    if (workspace.type === WORKSPACE_TYPES.PREPARATION) {
      if (!task.plannedDate) {
        throw createHttpError(400, 'La date planifiee est obligatoire pour cet espace.');
      }
    }

    if (workspace.type === WORKSPACE_TYPES.RUPTURE) {
      normalized.priority = 'URGENT';
    }

    return normalized;
  });
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
            if (beforeTask.stock_import_id) {
              const qty = beforeTask.quantity || 1;
              if (afterStatus === 'DONE' && beforeTask.status !== 'DONE') {
                await StockImportModel.deductQuantity(beforeTask.stock_import_id, qty);
              } else if (beforeTask.status === 'DONE' && afterStatus !== 'DONE') {
                await StockImportModel.addQuantity(beforeTask.stock_import_id, qty);
              }
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
      if (req.body.status && req.body.status !== 'TODO') {
        throw createHttpError(400, 'Le commercial ne peut creer des taches que dans TODO');
      }

      const workspace = await loadWorkspaceOrFail(workspaceId);
      const [preparedTask] = applyWorkspaceTypeRules([taskInput], workspace);

      const task = await TaskModel.create({
        ...preparedTask,
        createdBy: req.user.id,
        workspaceId,
        status: 'TODO',
      });
      await TaskHistoryModel.log({
        taskId: task.id,
        actorId: req.user.id,
        actionType: 'created',
        message: 'Tache creee par le commercial',
      });
      res.status(201).json(task);
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
      if (req.body.status && req.body.status !== 'TODO') {
        throw createHttpError(400, 'Le commercial ne peut creer des taches que dans TODO');
      }

      const workspace = await loadWorkspaceOrFail(workspaceId);
      const preparedTasks = applyWorkspaceTypeRules(tasks, workspace);

      const createdTasks = await TaskModel.createMany({
        tasks: preparedTasks,
        createdBy: req.user.id,
        workspaceId,
        status: 'TODO',
      });

      await TaskHistoryModel.logMany(
        createdTasks.map((task) => ({
          taskId: task.id,
          actorId: req.user.id,
          actionType: 'created',
          message: 'Tache creee par le commercial',
        }))
      );

      // Do not mark as used immediately, let the deduction handle it when DONE
      // const stockImportIds = createdTasks
      //   .map((task) => task.stock_import_id)
      //   .filter(Boolean);
      // if (stockImportIds.length > 0) {
      //   await StockImportModel.markManyAsUsed(stockImportIds);
      // }

      res.status(201).json(createdTasks);
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
      const task = await TaskModel.update(req.params.id, payload);
      if (!task) return res.status(404).json({ error: 'Task not found' });

      // Handle stock quantities if the task is already DONE and quantity changed
      if (previousTask.status === 'DONE' && task.status === 'DONE' && task.stock_import_id) {
        const oldQty = previousTask.quantity || 1;
        const newQty = task.quantity || 1;
        
        if (newQty !== oldQty) {
          const diff = newQty - oldQty;
          if (diff > 0) {
            await StockImportModel.deductQuantity(task.stock_import_id, diff);
          } else if (diff < 0) {
            await StockImportModel.addQuantity(task.stock_import_id, Math.abs(diff));
          }
        }
      }

      // Handle stock quantities if the API payload also somehow changed the status
      if (task.stock_import_id && payload.status && previousTask.status !== payload.status) {
        const qty = task.quantity || 1;
        if (previousTask.status !== 'DONE' && task.status === 'DONE') {
          await StockImportModel.deductQuantity(task.stock_import_id, qty);
        } else if (previousTask.status === 'DONE' && task.status !== 'DONE') {
          await StockImportModel.addQuantity(task.stock_import_id, qty);
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
      if (task.stock_import_id) {
        const qty = task.quantity || 1;
        if (previousTask.status !== 'DONE' && task.status === 'DONE') {
          await StockImportModel.deductQuantity(task.stock_import_id, qty);
        } else if (previousTask.status === 'DONE' && task.status !== 'DONE') {
          await StockImportModel.addQuantity(task.stock_import_id, qty);
        }
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
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async delete(req, res) {
    try {
      const taskToDelete = await TaskModel.getById(req.params.id);
      
      const task = await TaskModel.delete(req.params.id);
      if (!task) return res.status(404).json({ error: 'Task not found' });

      // If we delete a task that was DONE, restore the stock
      if (taskToDelete && taskToDelete.status === 'DONE' && taskToDelete.stock_import_id) {
        await StockImportModel.addQuantity(taskToDelete.stock_import_id, taskToDelete.quantity || 1);
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
