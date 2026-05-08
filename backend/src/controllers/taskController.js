const TaskModel = require('../models/taskModel');
const TaskCommentModel = require('../models/taskCommentModel');
const TaskHistoryModel = require('../models/taskHistoryModel');
const StockImportModel = require('../models/stockImportModel');
const WorkspaceModel = require('../models/workspaceModel');
const UserModel = require('../models/userModel');
const NotificationModel = require('../models/notificationModel');
const { recalculateStockAllocation } = require('../services/stockAllocationService');
const { TASK_STATUSES, TASK_STATUS_LABELS, TRACKED_TASK_FIELDS, URGENT_DATE_THRESHOLD_DAYS } = require('../constants/task');
const { createHttpError, isHttpError } = require('../utils/httpErrors');
const { applyTaskVisibility, buildTaskFilters, canAccessTask, parseWorkspaceId } = require('../utils/taskScope');
const { normalizeCommentBody, normalizeTaskBatch, normalizeTaskDraft, normalizeTaskUpdatePayload } = require('../utils/taskValidation');
const ExcelJS = require('exceljs'); // Add ExcelJS import for exports
const { normalizeArticleCode, isValidArticleCode } = require('../utils/articleCode');

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

function parseExcelDate(rawValue) {
  if (rawValue == null || rawValue === '') return null;
  if (rawValue instanceof Date && !Number.isNaN(rawValue.getTime())) {
    return rawValue.toISOString().slice(0, 10);
  }
  const normalized = `${rawValue}`.trim();
  if (!normalized) return null;
  const parts = normalized.split(/[\/\-]/);
  if (parts.length === 3) {
    let [d, m, y] = parts.map((p) => Number.parseInt(p, 10));
    if (Number.isInteger(d) && Number.isInteger(m) && Number.isInteger(y)) {
      if (y < 100) y += 2000;
      const dt = new Date(y, m - 1, d);
      if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    }
  }
  const fallback = new Date(normalized);
  if (!Number.isNaN(fallback.getTime())) return fallback.toISOString().slice(0, 10);
  return null;
}

function parseExcelQuantity(rawValue) {
  if (rawValue == null || rawValue === '') return NaN;
  if (typeof rawValue === 'number') return rawValue;
  const normalized = `${rawValue}`.replace(/\s/g, '').replace(',', '.');
  return Number.parseFloat(normalized);
}

function resolveWorkspaceNameFromTask(taskLike) {
  const anchor = taskLike?.plannedDate || taskLike?.dueDate || new Date().toISOString().slice(0, 10);
  const [year, month, day] = `${anchor}`.slice(0, 10).split('-');
  return `CMD ${day}-${month}-${year}`;
}

function normalizeHeaderLabel(value) {
  return `${value || ''}`
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '');
}

function pickHeaderColumn(headers, predicates) {
  for (const [label, col] of Object.entries(headers)) {
    if (predicates.some((predicate) => predicate(label))) {
      return col;
    }
  }
  return null;
}

function buildWorkspaceNameFromOrderDate(orderDate) {
  const [year, month, day] = `${orderDate}`.slice(0, 10).split('-');
  return `CMD ${day}-${month}-${year}`;
}

function isUrgentDate(dateString) {
  if (!dateString) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateString);
  if (Number.isNaN(target.getTime())) return false;
  const diffDays = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= URGENT_DATE_THRESHOLD_DAYS;
}


async function resolveCreationTarget(taskInput) {
  const quantity = Number(taskInput.quantity || 1);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw createHttpError(400, 'Quantite invalide pour la commande');
  }

  // Les tâches prédictives court-circuitent la vérification de stock
  if (taskInput.taskType === 'PREDICTIVE') {
    return {
      ...taskInput,
      status: 'TODO',
      autoReason: 'predictive',
      isKnownProduct: true,
      stockAvailableAtCreation: null,
      stockDeficit: null,
    };
  }

  const stockProbe = await StockImportModel.findAvailableForTask({
    stockImportId: taskInput.stockImportId,
    itemReference: taskInput.itemReference,
    requiredQuantity: quantity,
  });

  const stockQty = stockProbe ? Number(stockProbe.quantity || 0) : 0;

  if (!stockProbe) {
    // Unknown product — no stock record at all
    return {
      ...taskInput,
      status: 'WAITING_STOCK',
      stockImportId: null,
      autoReason: 'stock_missing',
      isKnownProduct: false,
      stockAvailableAtCreation: 0,
      stockDeficit: quantity,
    };
  }

  // Account for stock already reserved by other active tasks (sum of their quantities)
  let alreadyReserved = 0;
  if (taskInput.itemReference) {
    const existingTasks = await TaskModel.getAll({
      itemReference: taskInput.itemReference,
      statusIn: ['WAITING_STOCK', 'TODO', 'IN_PROGRESS', 'BLOCKED'],
    });
    // Use quantity (demand) not stock_allocated — allocated may be stale/null
    alreadyReserved = existingTasks.reduce((sum, t) => sum + Number(t.quantity || 0), 0);
  }

  const effectiveAvailable = Math.max(0, stockQty - alreadyReserved);
  const deficit = Math.max(0, quantity - effectiveAvailable);

  if (deficit === 0) {
    return {
      ...taskInput,
      status: 'TODO',
      stockImportId: taskInput.stockImportId || stockProbe.stockImportId,
      autoReason: 'stock_available',
      isKnownProduct: true,
      stockAvailableAtCreation: stockQty,
      stockDeficit: 0,
    };
  }

  return {
    ...taskInput,
    status: 'WAITING_STOCK',
    stockImportId: taskInput.stockImportId || stockProbe.stockImportId,
    autoReason: 'stock_insufficient',
    isKnownProduct: true,
    stockAvailableAtCreation: stockQty,
    stockDeficit: deficit,
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

        // Notify all commercials of status changes caused by drag & drop
        const commercialsForReorder = await UserModel.findByRoles(['commercial']);
        for (const beforeTask of currentTasks) {
          const afterStatus = nextTasksMap.get(beforeTask.id);
          if (!afterStatus || beforeTask.status === afterStatus) continue;
          for (const commercial of commercialsForReorder) {
            if (commercial.id === req.user.id) continue;
            await NotificationModel.createStatusChangedNotification({
              taskId: beforeTask.id,
              recipientUserId: commercial.id,
              changedByName: req.user.name,
              oldStatusLabel: TASK_STATUS_LABELS[beforeTask.status] || beforeTask.status,
              newStatusLabel: TASK_STATUS_LABELS[afterStatus] || afterStatus,
            });
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
      let workspaceId = parseWorkspaceId(req.body.workspaceId, { required: false });
      const resolved = await resolveCreationTarget(taskInput);
      ensurePlannedDateForWaitingStock(resolved);
      if (!workspaceId) {
        const workspace = await WorkspaceModel.findOrCreateByName(resolveWorkspaceNameFromTask(resolved));
        workspaceId = workspace.id;
      }

      const urgentDatePending = isUrgentDate(resolved.dueDate) || isUrgentDate(resolved.plannedDate);

      const task = await TaskModel.create({
        ...resolved,
        createdBy: req.user.id,
        workspaceId,
        status: resolved.status,
        isKnownProduct: resolved.isKnownProduct,
        stockAvailableAtCreation: resolved.stockAvailableAtCreation,
        stockDeficit: resolved.stockDeficit,
        urgentDatePending,
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
      if (task.item_reference) {
        await recalculateStockAllocation(task.item_reference);
      }
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
      const explicitWorkspaceId = parseWorkspaceId(req.body.workspaceId, { required: false });
      const resolvedTasks = [];
      for (let index = 0; index < tasks.length; index += 1) {
        const resolved = await resolveCreationTarget(tasks[index]);
        ensurePlannedDateForWaitingStock(resolved, index);
        resolvedTasks.push(resolved);
      }

      const grouped = new Map();
      for (const resolved of resolvedTasks) {
        const workspaceKey = explicitWorkspaceId ? `ID:${explicitWorkspaceId}` : resolveWorkspaceNameFromTask(resolved);
        if (!grouped.has(workspaceKey)) grouped.set(workspaceKey, []);
        grouped.get(workspaceKey).push({
          ...resolved,
          isKnownProduct: resolved.isKnownProduct,
          stockAvailableAtCreation: resolved.stockAvailableAtCreation,
          stockDeficit: resolved.stockDeficit,
          urgentDatePending: isUrgentDate(resolved.dueDate) || isUrgentDate(resolved.plannedDate),
          proposedDeliveryDate: resolved.plannedDate || null,
          proposedByRole: 'commercial',
          dateNegotiationStatus: resolved.plannedDate ? 'PENDING_PLANNER_REVIEW' : null,
          dateNegotiationComment: null,
          dateNegotiationUpdatedAt: resolved.plannedDate ? new Date() : null,
        });
      }

      const createdTasks = [];
      for (const [workspaceKey, drafts] of grouped.entries()) {
        let workspaceId = explicitWorkspaceId;
        if (!workspaceId) {
          const workspace = await WorkspaceModel.findOrCreateByName(workspaceKey);
          workspaceId = workspace.id;
        }

        const todoDrafts = drafts.filter((task) => task.status === 'TODO');
        const waitingDrafts = drafts.filter((task) => task.status === 'WAITING_STOCK');
        const [createdTodo, createdWaiting] = await Promise.all([
          todoDrafts.length
            ? TaskModel.createMany({
                tasks: todoDrafts,
                createdBy: req.user.id,
                workspaceId,
                status: 'TODO',
              })
            : Promise.resolve([]),
          waitingDrafts.length
            ? TaskModel.createMany({
                tasks: waitingDrafts,
                createdBy: req.user.id,
                workspaceId,
                status: 'WAITING_STOCK',
              })
            : Promise.resolve([]),
        ]);
        createdTasks.push(...createdTodo, ...createdWaiting);
      }

      await TaskHistoryModel.logMany(
        createdTasks.map((task) => ({
          taskId: task.id,
          actorId: req.user.id,
          actionType: 'created',
          message: 'Tâche créée par le commercial',
        }))
      );
      await notifyTaskCreation(createdTasks, req.user);
      const uniqueRefs = [...new Set(createdTasks.map((t) => t.item_reference).filter(Boolean))];

      const createdTodoCount = createdTasks.filter((task) => task.status === 'TODO').length;
      const createdWaitingCount = createdTasks.filter((task) => task.status === 'WAITING_STOCK').length;

      res.status(201).json({
        tasks: createdTasks,
        createdTodo: createdTodoCount,
        createdWaitingStock: createdWaitingCount,
      });
    } catch (err) {
      if (isHttpError(err)) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  async importOrders(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Aucun fichier fourni' });
      }

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        return res.status(400).json({ error: 'Fichier Excel invalide' });
      }

      const headers = {};
      const headerRow = worksheet.getRow(1);
      headerRow.eachCell((cell, col) => {
        const key = normalizeHeaderLabel(cell.value);
        headers[key] = col;
      });

      const dateCol = pickHeaderColumn(headers, [(h) => h === 'date']);
      const orderCol = pickHeaderColumn(headers, [(h) => h.startsWith('piece n'), (h) => h === 'piece no', (h) => h === 'piece']);
      const clientCol = pickHeaderColumn(headers, [(h) => h === 'nom', (h) => h.startsWith('client')]);
      const refCol = pickHeaderColumn(headers, [(h) => h === 'reference', (h) => h.includes('reference')]);
      const qtyCol = pickHeaderColumn(headers, [(h) => h === 'quantite', (h) => h.includes('quantite')]);
      const requestedDateCol = pickHeaderColumn(headers, [
        (h) => h.startsWith('delai'),
        (h) => h.includes('delai demand'),
        (h) => h.includes('date liv'),
      ]);

      if (!dateCol || !clientCol || !refCol || !qtyCol) {
        return res.status(400).json({
          error: 'Colonnes requises introuvables. Attendu: Date, Nom, Référence, Quantité (+ optionnel Pièce n°, délai demandé).',
        });
      }

      const groupedByWorkspace = new Map();
      let skipped = 0;

      // Forward-fill context for "header" fields (Date / Piece no / Nom / Délai demandé).
      // Excel layout: first line of each order group fills all columns; subsequent lines
      // for the same order (same Pièce no) leave those columns empty — only Référence
      // and Quantité change per line.  requestedDate resets when a new Pièce no appears.
      const currentOrderContext = {
        orderDate: null,
        orderCode: null,
        clientName: null,
        requestedDate: null,
      };

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;

        const parsedOrderDate   = parseExcelDate(row.getCell(dateCol).value);
        const parsedClientName  = `${row.getCell(clientCol).value || ''}`.trim();
        const parsedOrderCode   = orderCol ? `${row.getCell(orderCol).value || ''}`.trim() : '';
        const parsedRequestedDate = requestedDateCol ? parseExcelDate(row.getCell(requestedDateCol).value) : null;

        // A non-empty Pièce no signals the start of a new order group → reset delivery date.
        if (parsedOrderCode && parsedOrderCode !== currentOrderContext.orderCode) {
          currentOrderContext.requestedDate = null;
        }

        if (parsedOrderDate)     currentOrderContext.orderDate     = parsedOrderDate;
        if (parsedClientName)    currentOrderContext.clientName    = parsedClientName;
        if (parsedOrderCode)     currentOrderContext.orderCode     = parsedOrderCode;
        if (parsedRequestedDate) currentOrderContext.requestedDate = parsedRequestedDate;

        const orderDate     = currentOrderContext.orderDate;
        const clientName    = currentOrderContext.clientName;
        const orderCode     = currentOrderContext.orderCode || null;
        const requestedDate = currentOrderContext.requestedDate;
        const itemReference = normalizeArticleCode(row.getCell(refCol).value);
        const quantity      = parseExcelQuantity(row.getCell(qtyCol).value);

        if (!orderDate || !clientName || !itemReference || !isValidArticleCode(itemReference) || !Number.isFinite(quantity) || quantity <= 0) {
          skipped += 1;
          return;
        }

        const workspaceKey = buildWorkspaceNameFromOrderDate(orderDate);
        if (!groupedByWorkspace.has(workspaceKey)) {
          groupedByWorkspace.set(workspaceKey, []);
        }
        groupedByWorkspace.get(workspaceKey).push({
          title: `${clientName} • ${itemReference}`,
          description: `Import commande client • Quantité ${Number(quantity.toFixed(2))} pcs`,
          priority: 'MEDIUM',
          clientName,
          orderCode: orderCode || null,
          itemReference,
          quantity: Number(quantity.toFixed(2)),
          quantityUnit: 'pcs',
          plannedDate: requestedDate || orderDate,
          expectedAction: 'EXISTING_PRODUCT_AUTO_STOCK_CHECK',
        });
      });

      if (groupedByWorkspace.size === 0) {
        return res.status(400).json({ error: 'Aucune ligne valide trouvée dans le fichier' });
      }

      const createdTasks = [];
      const workspacesTouched = [];
      let skippedExisting = 0;
      for (const [workspaceName, drafts] of groupedByWorkspace.entries()) {
        const workspace = await WorkspaceModel.findOrCreateByName(workspaceName);
        workspacesTouched.push({ id: workspace.id, name: workspace.name });

        const orderCodes = Array.from(new Set(drafts.map((d) => d.orderCode).filter(Boolean)));
        const existingLines = await TaskModel.listExistingOrderLines({
          workspaceId: workspace.id,
          orderCodes,
        });
        const existingKeySet = new Set(
          existingLines
            .map((row) => `${row.order_code || ''}`.trim() + '||' + `${row.item_reference || ''}`.trim().toUpperCase())
            .filter((k) => k !== '||')
        );

        const uniqueDrafts = drafts.filter((draft) => {
          if (!draft.orderCode || !draft.itemReference) return true;
          const key = `${draft.orderCode}`.trim() + '||' + `${draft.itemReference}`.trim().toUpperCase();
          if (existingKeySet.has(key)) {
            skippedExisting += 1;
            return false;
          }
          return true;
        });

        if (uniqueDrafts.length === 0) {
          continue;
        }
        const resolvedTasks = [];
        for (const draft of uniqueDrafts) {
          const resolved = await resolveCreationTarget(draft);
          ensurePlannedDateForWaitingStock(resolved);
          resolvedTasks.push({
            ...resolved,
            isKnownProduct: resolved.isKnownProduct,
            stockAvailableAtCreation: resolved.stockAvailableAtCreation,
            stockDeficit: resolved.stockDeficit,
            urgentDatePending: isUrgentDate(resolved.dueDate) || isUrgentDate(resolved.plannedDate),
            proposedDeliveryDate: resolved.plannedDate || null,
            proposedByRole: 'commercial',
            dateNegotiationStatus: resolved.plannedDate ? 'PENDING_PLANNER_REVIEW' : null,
            dateNegotiationComment: null,
            dateNegotiationUpdatedAt: resolved.plannedDate ? new Date() : null,
          });
        }

        const todoDrafts = resolvedTasks.filter((task) => task.status === 'TODO');
        const waitingDrafts = resolvedTasks.filter((task) => task.status === 'WAITING_STOCK');

        const [createdTodo, createdWaiting] = await Promise.all([
          todoDrafts.length
            ? TaskModel.createMany({
                tasks: todoDrafts,
                createdBy: req.user.id,
                workspaceId: workspace.id,
                status: 'TODO',
              })
            : Promise.resolve([]),
          waitingDrafts.length
            ? TaskModel.createMany({
                tasks: waitingDrafts,
                createdBy: req.user.id,
                workspaceId: workspace.id,
                status: 'WAITING_STOCK',
              })
            : Promise.resolve([]),
        ]);

        const createdForWorkspace = [...createdTodo, ...createdWaiting];
        if (createdForWorkspace.length > 0) {
          await TaskHistoryModel.logMany(
            createdForWorkspace.map((task) => ({
              taskId: task.id,
              actorId: req.user.id,
              actionType: 'created',
              message: 'Tâche créée via import commandes client',
            }))
          );
          createdTasks.push(...createdForWorkspace);
        }
      }

      await notifyTaskCreation(createdTasks, req.user);
      const seenRefWs = new Set();
      const allocationPairs = createdTasks
        .filter((t) => t.item_reference && t.workspace_id)
        .reduce((acc, t) => {
          const key = `${t.item_reference}||${t.workspace_id}`;
          if (!seenRefWs.has(key)) {
            seenRefWs.add(key);
            acc.push({ ref: t.item_reference, wsId: t.workspace_id });
          }
          return acc;
        }, []);
      await Promise.all(allocationPairs.map(({ ref }) => recalculateStockAllocation(ref)));
      return res.status(201).json({
        imported: createdTasks.length,
        skipped,
        skippedExisting,
        workspacesCreatedOrUsed: groupedByWorkspace.size,
        workspaces: workspacesTouched,
      });
    } catch (err) {
      console.error('Order import failed:', err);
      return res.status(500).json({ error: `Erreur import commandes: ${err.message}` });
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

      // Recalculate stock allocation if article, quantity or date changed
      const articleChanged = payload.itemReference && payload.itemReference !== previousTask.item_reference;
      const quantityChanged = payload.quantity && payload.quantity !== previousTask.quantity;
      const dateChanged = (payload.plannedDate && payload.plannedDate !== previousTask.planned_date) ||
                         (payload.dueDate && payload.dueDate !== previousTask.due_date);

      if (task.item_reference && (articleChanged || quantityChanged || dateChanged)) {
        await recalculateStockAllocation(task.item_reference);
      }

      // Notify all commercials when a privileged user changes dates
      if (dateChanged) {
        const plannedChanged = payload.plannedDate && `${payload.plannedDate}`.slice(0, 10) !== `${previousTask.planned_date || ''}`.slice(0, 10);
        const dueChanged     = payload.dueDate    && `${payload.dueDate}`.slice(0, 10)     !== `${previousTask.due_date    || ''}`.slice(0, 10);
        if (plannedChanged || dueChanged) {
          const commercials = await UserModel.findByRoles(['commercial']);
          for (const commercial of commercials) {
            if (commercial.id === req.user.id) continue;
            if (plannedChanged) {
              await NotificationModel.createDateChangedNotification({
                taskId: task.id,
                recipientUserId: commercial.id,
                changedByName: req.user.name,
                fieldLabel: 'date de livraison prévue',
                oldDate: previousTask.planned_date,
                newDate: payload.plannedDate,
              });
            }
            if (dueChanged) {
              await NotificationModel.createDateChangedNotification({
                taskId: task.id,
                recipientUserId: commercial.id,
                changedByName: req.user.name,
                fieldLabel: "date d'échéance",
                oldDate: previousTask.due_date,
                newDate: payload.dueDate,
              });
            }
          }
        }
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
        if (task.item_reference) await recalculateStockAllocation(task.item_reference);
      } else if (previousTask.status === 'DONE' && task.status !== 'DONE') {
        await addStockForTask(task);
        if (task.item_reference) await recalculateStockAllocation(task.item_reference);
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

      // Notify all commercials on any status transition
      if (previousTask.status !== task.status) {
        const commercials = await UserModel.findByRoles(['commercial']);
        for (const commercial of commercials) {
          if (commercial.id === req.user.id) continue;
          await NotificationModel.createStatusChangedNotification({
            taskId: task.id,
            recipientUserId: commercial.id,
            changedByName: req.user.name,
            oldStatusLabel: TASK_STATUS_LABELS[previousTask.status] || previousTask.status,
            newStatusLabel: TASK_STATUS_LABELS[task.status] || task.status,
          });
        }
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

      // Notify the other party of the negotiation
      if (role === 'planner' || role === 'super_admin') {
        // Planner acting → notify all commercials
        const commercials = await UserModel.findByRoles(['commercial']);
        for (const commercial of commercials) {
          if (commercial.id === req.user.id) continue;
          await NotificationModel.createDateNegotiationNotification({
            taskId: task.id,
            recipientUserId: commercial.id,
            actorName: req.user.name,
            action,
            proposedDate: historyNewValue,
          });
        }
      } else if (role === 'commercial') {
        // Commercial acting → notify all planners
        const planners = await UserModel.findByRoles(['planner', 'super_admin']);
        for (const planner of planners) {
          await NotificationModel.createDateNegotiationNotification({
            taskId: task.id,
            recipientUserId: planner.id,
            actorName: req.user.name,
            action,
            proposedDate: historyNewValue,
          });
        }
      }

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

      if (taskToDelete && taskToDelete.status === 'DONE') {
        await addStockForTask(taskToDelete);
      }
      if (taskToDelete?.item_reference) {
        await recalculateStockAllocation(taskToDelete.item_reference);
      }

      res.json({ message: 'Task deleted' });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  },

  async confirmPredictive(req, res) {
    try {
      const task = await TaskModel.getById(req.params.id);
      if (!task) return res.status(404).json({ error: 'Tache introuvable' });
      if (task.task_type !== 'PREDICTIVE') {
        return res.status(400).json({ error: 'Cette tache n est pas de type previsionnel' });
      }

      const resolved = await resolveCreationTarget({
        taskType: 'PRODUCTION_ORDER',
        itemReference: task.item_reference,
        quantity: task.quantity,
        stockImportId: task.stock_import_id,
        plannedDate: task.planned_date,
        dueDate: task.due_date,
      });

      const urgentDatePending = isUrgentDate(task.due_date) || isUrgentDate(task.planned_date);

      await TaskModel.update(task.id, {
        taskType: 'PRODUCTION_ORDER',
        isKnownProduct: resolved.isKnownProduct,
        stockAvailableAtCreation: resolved.stockAvailableAtCreation,
        stockDeficit: resolved.stockDeficit,
        urgentDatePending,
      });

      // Si le stock est insuffisant, basculer en WAITING_STOCK via la promotion système
      if (resolved.status === 'WAITING_STOCK') {
        await TaskModel.updateStatus(
          task.id,
          'WAITING_STOCK',
          null,
          req.user.id,
          req.user.role,
          { systemAutoPromotion: true }
        );
      }

      await TaskHistoryModel.log({
        taskId: task.id,
        actorId: req.user.id,
        actionType: 'predictive_confirmed',
        message: 'Tache previsionnelle confirmee en commande de production',
      });

      if (task.item_reference) {
        await recalculateStockAllocation(task.item_reference);
      }

      const updated = await TaskModel.getById(task.id);
      return res.json(updated);
    } catch (err) {
      if (isHttpError(err)) return res.status(err.status).json({ error: err.message });
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
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
  },

  async convertTaskType(req, res) {
    try {
      const taskId = parseInt(req.params.id, 10);
      if (!Number.isInteger(taskId) || taskId < 1) {
        return res.status(400).json({ error: 'ID tâche invalide' });
      }

      const { newType } = req.body;
      if (!newType || !['PREDICTIVE', 'STANDARD'].includes(newType)) {
        return res.status(400).json({ error: 'Type invalide (PREDICTIVE|STANDARD)' });
      }

      const task = await TaskModel.getById(taskId);
      if (!task) {
        return res.status(404).json({ error: 'Tâche non trouvée' });
      }

      if (task.task_type === newType) {
        return res.status(400).json({ error: `Tâche est déjà du type ${newType}` });
      }

      const workspaceId = task.workspace_id;
      if (!canAccessTask(req.user, { workspace_id: workspaceId })) {
        return res.status(403).json({ error: 'Accès refusé' });
      }

      const oldType = task.task_type;
      let newStatus = task.status;
      let conversionMessage = '';

      if (newType === 'STANDARD' && oldType === 'PREDICTIVE') {
        conversionMessage = `Tâche convertie de PREDICTIVE à STANDARD`;

        if (task.item_reference) {
          const hasStock = await StockImportModel.hasAvailableQuantity({
            itemReference: task.item_reference,
            requiredQuantity: task.quantity || 1,
          });

          if (!hasStock && task.status === 'TODO') {
            newStatus = 'WAITING_STOCK';
            conversionMessage += ` - Statut changé à WAITING_STOCK (stock insuffisant)`;
          }
        }
      } else if (newType === 'PREDICTIVE' && oldType === 'STANDARD') {
        conversionMessage = `Tâche convertie de STANDARD à PREDICTIVE`;
      }

      await TaskModel.update(taskId, { task_type: newType, status: newStatus });

      await TaskHistoryModel.log({
        taskId,
        actorId: req.user.id,
        actionType: 'type_converted',
        fieldName: 'task_type',
        oldValue: oldType,
        newValue: newType,
        message: conversionMessage,
      });

      if (newStatus !== task.status && task.item_reference) {
        await recalculateStockAllocation(task.item_reference);
      }

      const updatedTask = await TaskModel.getById(taskId);
      res.json({
        task: updatedTask,
        message: conversionMessage,
      });
    } catch (err) {
      if (isHttpError(err)) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error('Type conversion error:', err);
      res.status(500).json({ error: 'Erreur lors de la conversion de type' });
    }
  }
};

module.exports = taskController;
