const pool = require('../config/db');
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
const { normalizeCommentBody, normalizeTaskBatch, normalizeTaskDraft, normalizeTaskUpdatePayload, validatePartialPreparationQuantity, validateDeliveryQuantity } = require('../utils/taskValidation');
const ExcelJS = require('exceljs'); // Add ExcelJS import for exports
const { normalizeArticleCode, isValidArticleCode } = require('../utils/articleCode');

let broadcast;
try {
  broadcast = require('../services/sseService').broadcast;
} catch (e) {
  broadcast = () => {};
}

function formatDateFR(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Commercial responsable (commercial_id) + planificateurs — pour alertes livraison. */
async function getDeliveryNotificationRecipientIds(task, actorId) {
  const planners = await UserModel.findByRoles(['planner', 'super_admin']);
  const plannerIds = planners.map((p) => p.id).filter((id) => id !== actorId);

  const commercialIds = [];
  if (task?.commercial_id) {
    const commercials = await UserModel.findByRoles(['commercial']);
    commercialIds.push(
      ...commercials
        .filter((c) => c.commercial_id === task.commercial_id)
        .map((c) => c.id)
        .filter((id) => id !== actorId)
    );
  }

  return [...new Set([...plannerIds, ...commercialIds])];
}

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

function buildWorkspaceName(dateOrTask) {
  let anchor;
  if (dateOrTask && (dateOrTask.plannedDate !== undefined || dateOrTask.dueDate !== undefined)) {
    anchor = dateOrTask.plannedDate || dateOrTask.dueDate || new Date().toISOString().slice(0, 10);
  } else {
    anchor = dateOrTask || new Date().toISOString().slice(0, 10);
  }
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
      const allTasks = await TaskModel.getAll(filters);

      // Borne de sécurité : plafonne le nombre de lignes du classeur pour éviter
      // une consommation mémoire excessive sur de très gros exports (free tier).
      const MAX_EXPORT_ROWS = Number.parseInt(process.env.MAX_EXPORT_ROWS, 10) || 50000;
      const tasks = allTasks.slice(0, MAX_EXPORT_ROWS);

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
        createdAt: formatDateFR(t.created_at)
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
        const workspace = await WorkspaceModel.findOrCreateByName(buildWorkspaceName(resolved));
        workspaceId = workspace.id;
      }

      const urgentDatePending = isUrgentDate(resolved.dueDate) || isUrgentDate(resolved.plannedDate);

      const task = await TaskModel.create({
        ...resolved,
        createdBy: req.user.id,
        workspaceId,
        status: resolved.status,
        assignedTo: req.user.role === 'commercial' ? req.user.id : resolved.assignedTo,
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
        const workspaceKey = explicitWorkspaceId ? `ID:${explicitWorkspaceId}` : buildWorkspaceName(resolved);
        if (!grouped.has(workspaceKey)) grouped.set(workspaceKey, []);
        grouped.get(workspaceKey).push({
          ...resolved,
          assignedTo: resolved.assignedTo || (req.user.role === 'commercial' ? req.user.id : undefined),
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
      if (!req.file.buffer || req.file.buffer.length === 0) {
        return res.status(400).json({ error: 'Le fichier fourni est vide.' });
      }

      const workbook = new ExcelJS.Workbook();
      try {
        await workbook.xlsx.load(req.file.buffer);
      } catch (parseErr) {
        return res.status(400).json({ error: 'Fichier Excel illisible ou corrompu. Vérifiez le format (.xlsx).' });
      }
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        return res.status(400).json({ error: 'Fichier Excel invalide (aucune feuille trouvée).' });
      }

      // Détecte la ligne d'en-tête dans les 10 premières lignes — tolère un
      // préambule (ex. « Filtres appliqués … ») présent dans certains exports.
      let headers = {};
      let headerRowNumber = 0;
      const maxHeaderScan = Math.min(10, worksheet.rowCount || 10);
      for (let r = 1; r <= maxHeaderScan; r += 1) {
        const candidate = {};
        worksheet.getRow(r).eachCell((cell, col) => {
          candidate[normalizeHeaderLabel(cell.value)] = col;
        });
        const keys = Object.keys(candidate);
        const hasRef = keys.some((h) => h === 'reference' || h.includes('reference'));
        const hasQty = keys.some((h) => h === 'quantite' || h.includes('quantite'));
        if (hasRef && hasQty) {
          headers = candidate;
          headerRowNumber = r;
          break;
        }
      }
      if (!headerRowNumber) {
        return res.status(400).json({
          error: 'Ligne d\'en-tête introuvable. Le fichier doit contenir au moins les colonnes « Référence » et « Quantité ».',
        });
      }

      const dateCol = pickHeaderColumn(headers, [(h) => h === 'date']);
      const orderCol = pickHeaderColumn(headers, [(h) => h.startsWith('piece n'), (h) => h === 'piece no', (h) => h === 'piece']);
      const refCol = pickHeaderColumn(headers, [(h) => h === 'reference', (h) => h.includes('reference')]);
      const qtyCol = pickHeaderColumn(headers, [(h) => h === 'quantite', (h) => h.includes('quantite')]);
      const requestedDateCol = pickHeaderColumn(headers, [
        (h) => h.startsWith('delai'),
        (h) => h.includes('delai demand'),
        (h) => h.includes('date liv'),
      ]);
      // Optional: Désignation / description column
      const designationCol = pickHeaderColumn(headers, [(h) => h === 'designation', (h) => h.startsWith('designat')]);
      // Optional: client/Nom column (nom du client)
      const clientCol = pickHeaderColumn(headers, [(h) => h === 'nom', (h) => h.startsWith('nom client')]);
      // Optional: code client column (« Tiers » / « Code client » → CL000XXX)
      const clientCodeCol = pickHeaderColumn(headers, [(h) => h === 'tiers', (h) => h === 'code client', (h) => h === 'client']);
      // Optional: commercial ID column → sets assigned_to and commercial_id on the task
      const commercialCol = pickHeaderColumn(headers, [
        (h) => h === 'commercial',
        (h) => h === 'commerciale',
        (h) => h === 'vendeur',
        (h) => h === 'vendeure',
        (h) => h === 'commercial 1',
        (h) => h === 'commercial1',
        (h) => h.startsWith('commercial'),
      ]);

      if (!dateCol || !refCol || !qtyCol) {
        return res.status(400).json({
          error: 'Colonnes requises introuvables. Attendu: Date, Référence, Quantité (+ optionnel Pièce n°, Délai demandé, Nom, Commercial 1).',
        });
      }

      const groupedByWorkspace = new Map();

      // Forward-fill context for "header" fields.
      // Excel layout: first line of each order group fills all columns; subsequent lines
      // for the same order (same Pièce no) leave those columns empty — only Référence
      // and Quantité change per line.
      const currentOrderContext = {
        orderDate: null,
        orderCode: null,
        clientName: null,
        clientCode: null,
        requestedDate: null,
        commercialId: null,
        designation: null,
      };

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber <= headerRowNumber) return;

        const parsedOrderDate     = parseExcelDate(row.getCell(dateCol).value);
        const parsedClientName    = clientCol ? `${row.getCell(clientCol).value || ''}`.trim() : '';
        const parsedClientCode    = clientCodeCol ? `${row.getCell(clientCodeCol).value || ''}`.trim() : '';
        const parsedOrderCode     = orderCol ? `${row.getCell(orderCol).value || ''}`.trim() : '';
        const parsedRequestedDate = requestedDateCol ? parseExcelDate(row.getCell(requestedDateCol).value) : null;
        const parsedCommercialId  = commercialCol ? `${row.getCell(commercialCol).value || ''}`.trim().toUpperCase() : '';
        const parsedDesignation   = designationCol ? `${row.getCell(designationCol).value || ''}`.trim() : '';

        // Reset per-order fields when a new order code starts.
        if (parsedOrderCode && parsedOrderCode !== currentOrderContext.orderCode) {
          currentOrderContext.requestedDate = null;
          currentOrderContext.commercialId = null;
          currentOrderContext.clientName = null;
          currentOrderContext.clientCode = null;
        }

        if (parsedOrderDate)       currentOrderContext.orderDate      = parsedOrderDate;
        if (parsedClientName)      currentOrderContext.clientName     = parsedClientName;
        if (parsedClientCode)      currentOrderContext.clientCode     = parsedClientCode;
        if (parsedOrderCode)       currentOrderContext.orderCode      = parsedOrderCode;
        if (parsedRequestedDate)   currentOrderContext.requestedDate  = parsedRequestedDate;
        if (parsedCommercialId)    currentOrderContext.commercialId   = parsedCommercialId;
        if (parsedDesignation)     currentOrderContext.designation    = parsedDesignation;

        const orderDate      = currentOrderContext.orderDate || new Date().toISOString().slice(0, 10);
        const clientName     = currentOrderContext.clientName;
        const clientCode     = currentOrderContext.clientCode || null;
        const orderCode      = currentOrderContext.orderCode || null;
        const requestedDate  = currentOrderContext.requestedDate;
        const commercialId   = currentOrderContext.commercialId;
        const designation    = currentOrderContext.designation;
        const itemReference  = normalizeArticleCode(row.getCell(refCol).value) || 'INCONNU';
        const quantity       = Number.isFinite(parseExcelQuantity(row.getCell(qtyCol).value)) ? parseExcelQuantity(row.getCell(qtyCol).value) : 0;

        const title = clientName
          ? `${clientName} • ${itemReference}`
          : orderCode
            ? `${orderCode} • ${itemReference}`
            : `${itemReference}`;

        const workspaceKey = buildWorkspaceName(orderDate);
        if (!groupedByWorkspace.has(workspaceKey)) {
          groupedByWorkspace.set(workspaceKey, []);
        }
        groupedByWorkspace.get(workspaceKey).push({
          title,
          description: designation || `Import commande • Quantité ${Number(quantity.toFixed(2))} pcs`,
          priority: 'MEDIUM',
          clientName,
          clientCode,
          orderCode: orderCode || null,
          itemReference,
          quantity: Number(quantity.toFixed(2)),
          quantityUnit: 'pcs',
          plannedDate: requestedDate || orderDate,
          expectedAction: 'EXISTING_PRODUCT_AUTO_STOCK_CHECK',
          _commercialId: commercialId || null,
        });
      });

      if (groupedByWorkspace.size === 0) {
        return res.status(400).json({ error: 'Aucune ligne trouvée dans le fichier' });
      }

      // Resolve unique commercial IDs → user IDs (one DB lookup per unique ID)
      const COMMERCIAL_ID_REGEX = /^VL\d{6}$/;
      const commercialIdCache = new Map(); // commercialId → { userId, commercialId } | null
      const unresolvedCommercials = new Set();
      const invalidCommercialFormats = new Set();

      for (const drafts of groupedByWorkspace.values()) {
        for (const draft of drafts) {
          if (draft._commercialId && !commercialIdCache.has(draft._commercialId)) {
            commercialIdCache.set(draft._commercialId, null); // placeholder
          }
        }
      }

      for (const cid of commercialIdCache.keys()) {
        // Validate format first
        if (!COMMERCIAL_ID_REGEX.test(cid)) {
          invalidCommercialFormats.add(cid);
          commercialIdCache.set(cid, null);
          continue;
        }

        const found = await UserModel.findByCommercialId(cid);
        if (found) {
          commercialIdCache.set(cid, { userId: found.id, commercialId: found.commercial_id });
        } else {
          unresolvedCommercials.add(cid);
        }
      }

      const createdTasks = [];
      const workspacesTouched = [];
      const warnings = [];
      let skippedTotal = 0;
      for (const [workspaceName, drafts] of groupedByWorkspace.entries()) {
        const workspace = await WorkspaceModel.findOrCreateByName(workspaceName);
        workspacesTouched.push({ id: workspace.id, name: workspace.name });

        // All imported tasks land in PENDING_APPROVAL — commercial must review and approve
        // before FIFO runs.  We keep commercial metadata but skip stock resolution.
        const pendingTasks = drafts.map((draft) => {
          const commercialInfo = draft._commercialId
            ? (commercialIdCache.get(draft._commercialId) || null)
            : null;
          return {
            title: draft.title,
            description: draft.description,
            priority: draft.priority || 'MEDIUM',
            clientName: draft.clientName || null,
            clientCode: draft.clientCode || null,
            orderCode: draft.orderCode || null,
            itemReference: draft.itemReference,
            quantity: draft.quantity,
            quantityUnit: draft.quantityUnit || 'pcs',
            plannedDate: draft.plannedDate || null,
            dueDate: draft.plannedDate || null,
            expectedAction: draft.expectedAction || 'EXISTING_PRODUCT_AUTO_STOCK_CHECK',
            taskType: 'PRODUCTION_ORDER',
            assignedTo: commercialInfo?.userId || null,
            commercialId: commercialInfo?.commercialId || draft._commercialId || null,
            // No stock fields — FIFO runs only after commercial approval
            isKnownProduct: null,
            stockAvailableAtCreation: null,
            stockDeficit: null,
            urgentDatePending: false,
            proposedDeliveryDate: draft.plannedDate || null,
            proposedByRole: 'commercial',
            dateNegotiationStatus: draft.plannedDate ? 'PENDING_PLANNER_REVIEW' : null,
            dateNegotiationComment: null,
            dateNegotiationUpdatedAt: draft.plannedDate ? new Date() : null,
          };
        });

        // Protection ré-import UNIQUEMENT : on ignore les lignes déjà présentes en
        // base (même fichier réimporté). On NE déduplique PAS à l'intérieur du
        // fichier : dans un export ligne-à-ligne, deux lignes identiques (même
        // commande, même article, même quantité) sont deux postes légitimes —
        // les fusionner ferait perdre de la quantité.
        const existingRows = await TaskModel.listExistingOrderLines({
          workspaceId: workspace.id,
          orderCodes: null,
        });
        const fmtQty = (v) => { const n = Number(v); return Number.isFinite(n) ? n.toFixed(2) : ''; };
        const buildKey = (r) =>
          `${r.orderCode || r.order_code || ''}|${r.clientName || r.client_name || ''}|${r.itemReference || r.item_reference || ''}|${fmtQty(r.quantity)}|${r.plannedDate || r.planned_date || ''}|${r.description || ''}|${r.commercialId || r.commercial_id || ''}`;
        const existingKeys = new Set(existingRows.map(buildKey));
        const uniqueTasks = pendingTasks.filter((t) => !existingKeys.has(buildKey(t)));
        const skippedCount = pendingTasks.length - uniqueTasks.length;
        skippedTotal += skippedCount;
        if (skippedCount > 0) {
          warnings.push(`${skippedCount} ligne(s) déjà importée(s) précédemment et ignorée(s) dans "${workspaceName}"`);
        }
        if (uniqueTasks.length === 0) continue;

        const createdPending = await TaskModel.createMany({
          tasks: uniqueTasks,
          createdBy: req.user.id,
          workspaceId: workspace.id,
          status: 'PENDING_APPROVAL',
        });

        if (createdPending.length > 0) {
          await TaskHistoryModel.logMany(
            createdPending.map((task) => ({
              taskId: task.id,
              actorId: req.user.id,
              actionType: 'created',
              message: 'Commande importée — en attente de validation commerciale',
            }))
          );
          createdTasks.push(...createdPending);
        }
      }

      // No FIFO here — it runs when commercial approves each task

      if (invalidCommercialFormats.size > 0) {
        warnings.push(`Codes commerciaux invalides (format VL000001 attendu) : ${[...invalidCommercialFormats].join(', ')}`);
      }
      if (unresolvedCommercials.size > 0) {
        warnings.push(`Codes commerciaux non trouvés dans la base (importez-les d'abord) : ${[...unresolvedCommercials].join(', ')}`);
      }

      // Notifier chaque commercial du nombre de commandes qui lui sont affectées
      try {
        const countByUser = new Map();
        for (const t of createdTasks) {
          const info = t.commercial_id ? commercialIdCache.get(t.commercial_id) : null;
          if (info?.userId) countByUser.set(info.userId, (countByUser.get(info.userId) || 0) + 1);
        }
        if (countByUser.size > 0) {
          await NotificationModel.createOrdersImportedNotifications(
            [...countByUser.entries()].map(([recipientUserId, count]) => ({ recipientUserId, count }))
          );
        }
      } catch (notifErr) {
        console.error('Order import notification failed:', notifErr.message);
      }

      return res.status(201).json({
        imported: createdTasks.length,
        skipped: skippedTotal,
        workspacesCreatedOrUsed: groupedByWorkspace.size,
        workspaces: workspacesTouched,
        warnings,
      });
    } catch (err) {
      console.error('Order import failed:', err);
      return res.status(500).json({ error: `Erreur import commandes: ${err.message}` });
    }
  },

  // ── Commercial approves a selection of PENDING_APPROVAL tasks ───────────────
  // Runs FIFO on each approved task → becomes TODO or WAITING_STOCK
  async approveOrders(req, res) {
    try {
      const { taskIds } = req.body;
      if (!Array.isArray(taskIds) || taskIds.length === 0) {
        return res.status(400).json({ error: 'Aucune tâche sélectionnée' });
      }

      const approved = [];
      const skipped = [];

      for (const id of taskIds) {
        const task = await TaskModel.getById(id);
        if (!task) { skipped.push({ id, reason: 'introuvable' }); continue; }
        if (task.status !== 'PENDING_APPROVAL') { skipped.push({ id, reason: 'statut incorrect' }); continue; }

        // Check access: commercial can only approve their own tasks
        const role = req.user?.role;
        if (role === 'commercial') {
          if (!req.user.commercial_id || task.commercial_id !== req.user.commercial_id) {
            skipped.push({ id, reason: 'accès refusé' }); continue;
          }
        }

        // Entrée du flux = toujours « Hors Stock PF » (WAITING_STOCK).
        // On calcule quand même les champs stock pour le badge ; le système
        // promouvra ensuite automatiquement en « Prêt à Livrer » si le stock couvre.
        const resolved = await resolveCreationTarget({
          itemReference: task.item_reference,
          quantity: task.quantity,
          plannedDate: task.planned_date,
          dueDate: task.due_date,
          title: task.title,
        });

        const targetStatus = 'WAITING_STOCK';

        const updated = await TaskModel.approveFromPending(id, targetStatus, {
          isKnownProduct: resolved.isKnownProduct,
          stockAvailableAtCreation: resolved.stockAvailableAtCreation,
          stockDeficit: resolved.stockDeficit,
        });

        if (!updated) { skipped.push({ id, reason: 'mise à jour impossible' }); continue; }

        await TaskHistoryModel.log({
          taskId: id,
          actorId: req.user.id,
          actionType: 'status_changed',
          fieldName: 'status',
          oldValue: 'PENDING_APPROVAL',
          newValue: targetStatus,
          message: 'Commande validée par le commercial — entrée en Hors Stock PF',
        });

        // Recalc : si le stock PF couvre déjà la quantité, le système la passera
        // directement en « Prêt à Livrer ». silent → un seul broadcast final (l.918).
        if (task.item_reference) {
          await recalculateStockAllocation(task.item_reference, { silent: true });
        }
        approved.push(id);
      }

      // Notify planners of newly approved tasks
      if (approved.length > 0) {
        const approvedTasks = await Promise.all(approved.map((id) => TaskModel.getById(id)));
        await notifyTaskCreation(approvedTasks.filter(Boolean), req.user);
        // Broadcast so Kanban board refreshes in real-time for all connected users
        broadcast('tasks-updated', { source: 'approve_orders', count: approved.length });
      }

      return res.status(200).json({
        approved: approved.length,
        skipped: skipped.length,
        skippedDetails: skipped,
        message: `${approved.length} commande${approved.length !== 1 ? 's' : ''} validée${approved.length !== 1 ? 's' : ''} et envoyées en production`,
      });
    } catch (err) {
      console.error('Approve orders failed:', err);
      return res.status(500).json({ error: `Erreur validation commandes: ${err.message}` });
    }
  },

  // ── Commercial rejects / removes PENDING_APPROVAL tasks ────────────────────
  async rejectOrders(req, res) {
    try {
      const { taskIds } = req.body;
      if (!Array.isArray(taskIds) || taskIds.length === 0) {
        return res.status(400).json({ error: 'Aucune tâche sélectionnée' });
      }

      let rejected = 0;
      for (const id of taskIds) {
        const task = await TaskModel.getById(id);
        if (!task || task.status !== 'PENDING_APPROVAL') continue;

        const role = req.user?.role;
        if (role === 'commercial') {
          if (!req.user.commercial_id || task.commercial_id !== req.user.commercial_id) continue;
        }

        await TaskModel.delete(id);
        rejected++;
      }

      if (rejected > 0) {
        broadcast('tasks-updated', { source: 'reject_orders', count: rejected });
      }

      return res.status(200).json({
        rejected,
        message: `${rejected} commande${rejected !== 1 ? 's' : ''} supprimée${rejected !== 1 ? 's' : ''}`,
      });
    } catch (err) {
      console.error('Reject orders failed:', err);
      return res.status(500).json({ error: `Erreur suppression commandes: ${err.message}` });
    }
  },

  // ── List PENDING_APPROVAL tasks for commercial review table ─────────────────
  async getPendingApproval(req, res) {
    try {
      const role = req.user?.role;
      const filters = {};

      if (role === 'commercial') {
        if (!req.user.commercial_id) {
          return res.json([]);
        }
        filters.commercialId = req.user.commercial_id;
      } else if (!['super_admin', 'planner'].includes(role)) {
        return res.status(403).json({ error: 'Accès refusé' });
      }

      const tasks = await TaskModel.getAll({ ...filters, status: 'PENDING_APPROVAL' });

      // Enrich with stock info — one DB query for all unique references
      const refs = [...new Set(tasks.map(t => t.item_reference).filter(Boolean))];
      const stockByRef = {};
      if (refs.length > 0) {
        const pool = require('../config/db');
        const today = new Date().toISOString().slice(0, 10);
        const stockRows = await pool.query(
          `SELECT
            si.article,
            si.quantity,
            si.ready_date,
            si.designation,
            COALESCE(alloc.total_reserved, 0) AS total_reserved
           FROM stock_import si
           LEFT JOIN LATERAL (
             SELECT SUM(t.quantity) AS total_reserved
             FROM tasks t
             WHERE UPPER(t.item_reference) = UPPER(si.article)
               AND t.status IN ('WAITING_STOCK','TODO','IN_PROGRESS','BLOCKED')
           ) alloc ON TRUE
           WHERE UPPER(si.article) = ANY($1::text[])`,
          [refs.map(r => r.toUpperCase())]
        );
        for (const s of stockRows.rows) {
          const stockQty = Number(s.quantity || 0);
          const reserved = Number(s.total_reserved || 0);
          const available = Math.max(0, stockQty - reserved);
          const rdStr = s.ready_date ? String(s.ready_date).slice(0, 10) : null;
          stockByRef[s.article.toUpperCase()] = {
            stockQty,
            reserved,
            available,
            isReady: rdStr ? rdStr <= today : false,
            readyDate: rdStr,
            designation: s.designation || null,
          };
        }
      }

      const enriched = tasks.map(t => ({
        ...t,
        stock: t.item_reference ? (stockByRef[t.item_reference.toUpperCase()] || null) : null,
      }));

      return res.json(enriched);
    } catch (err) {
      console.error('getPendingApproval failed:', err);
      return res.status(500).json({ error: err.message });
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

      // Ajustement du stock si la quantité change sur une tâche déjà LIVRÉE
      if (previousTask.status === 'DELIVERED' && task.status === 'DELIVERED') {
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
        if (previousTask.status !== 'DELIVERED' && task.status === 'DELIVERED') {
          await deductStockForTask(task);
        } else if (previousTask.status === 'DELIVERED' && task.status !== 'DELIVERED') {
          await addStockForTask(task);
        }
      }

      const historyEntries = buildUpdateHistoryEntries(previousTask, payload, req.user.id);
      if (historyEntries.length > 0) {
        await TaskHistoryModel.logMany(historyEntries);
      }

      // Recalculate stock allocation if article, quantity or date changed
      const oldArticle = previousTask.item_reference;
      const newArticle = task.item_reference;
      const articleChanged = newArticle !== oldArticle;
      const quantityChanged = payload.quantity && payload.quantity !== previousTask.quantity;
      const dateChanged = (payload.plannedDate && payload.plannedDate !== previousTask.planned_date) ||
                         (payload.dueDate && payload.dueDate !== previousTask.due_date);

      if (articleChanged) {
        // Recalculate OLD article (task no longer needs it)
        if (oldArticle) {
          await recalculateStockAllocation(oldArticle);
        }
        // Recalculate NEW article (task now needs it)
        if (newArticle) {
          await recalculateStockAllocation(newArticle);
        }
      } else if (newArticle && (quantityChanged || dateChanged)) {
        await recalculateStockAllocation(newArticle);
      }

      // Commercial escalation: priority → URGENT on WAITING_STOCK → notify planners
      const priorityChanged = payload.priority && payload.priority !== previousTask.priority;
      const isEscalation =
        priorityChanged &&
        payload.priority === 'URGENT' &&
        task.status === 'WAITING_STOCK' &&
        req.user.role === 'commercial';

      if (isEscalation) {
        const planners = await UserModel.findByRoles(['planner', 'super_admin']);
        for (const planner of planners) {
          await NotificationModel.createEscalationNotification({
            taskId: task.id,
            recipientUserId: planner.id,
            commercialName: req.user.name,
            taskTitle: task.title,
          });
        }
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

      // Le stock PF est déduit à la LIVRAISON (statut Livré), pas avant.
      if (previousTask.status !== 'DELIVERED' && task.status === 'DELIVERED') {
        await deductStockForTask(task);
        if (task.item_reference) await recalculateStockAllocation(task.item_reference);
      } else if (previousTask.status === 'DELIVERED' && task.status !== 'DELIVERED') {
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

      // Notify affected users on any status transition (batch inserts — no N+1)
      if (previousTask.status !== task.status) {
        const oldLabel = TASK_STATUS_LABELS[previousTask.status] || previousTask.status;
        const newLabel = TASK_STATUS_LABELS[task.status] || task.status;

        // All commercials except the actor
        const commercials = await UserModel.findByRoles(['commercial']);
        const commercialIds = commercials.map((c) => c.id).filter((id) => id !== req.user.id);
        if (commercialIds.length > 0) {
          await NotificationModel.createStatusChangedNotificationBatch({
            taskId: task.id,
            recipientUserIds: commercialIds,
            changedByName: req.user.name,
            oldStatusLabel: oldLabel,
            newStatusLabel: newLabel,
          });
        }

        // Notify all livreurs when a task becomes DONE ("Prêt à Livrer")
        if (task.status === 'DONE') {
          const livreurs = await UserModel.findByRoles(['livreur']);
          const livreurIds = livreurs.map((l) => l.id);
          if (livreurIds.length > 0) {
            await NotificationModel.createReadyToDeliverNotifications({
              taskId: task.id,
              recipientUserIds: livreurIds,
              plannerName: req.user.name,
              taskTitle: task.title,
            });
          }
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

      // Notify the other party — batch insert (no N+1)
      if (role === 'planner' || role === 'super_admin') {
        // Planner acting → notify all commercials
        const commercials = await UserModel.findByRoles(['commercial']);
        const ids = commercials.map((c) => c.id).filter((id) => id !== req.user.id);
        if (ids.length > 0) {
          await NotificationModel.createDateNegotiationNotificationBatch({
            taskId: task.id, recipientUserIds: ids,
            actorName: req.user.name, action, proposedDate: historyNewValue,
          });
        }
      } else if (role === 'commercial') {
        // Commercial acting → notify all planners / super_admins
        const planners = await UserModel.findByRoles(['planner', 'super_admin']);
        const ids = planners.map((p) => p.id);
        if (ids.length > 0) {
          await NotificationModel.createDateNegotiationNotificationBatch({
            taskId: task.id, recipientUserIds: ids,
            actorName: req.user.name, action, proposedDate: historyNewValue,
          });
        }
      }

      // Temps réel : cloche du destinataire + rafraîchissement des cartes (badge date)
      broadcast('notifications-updated', { source: 'date_negotiation', taskId: task.id });
      broadcast('tasks-updated', { source: 'date_negotiation', taskId: task.id });

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

      // Le stock n'est déduit qu'à la livraison → on ne réintègre que pour une tâche Livrée.
      if (taskToDelete && taskToDelete.status === 'DELIVERED') {
        const restoredQty = Number(taskToDelete.quantity_delivered ?? taskToDelete.quantity ?? 0);
        await addStockForTask(taskToDelete, restoredQty);
      }
      if (taskToDelete?.item_reference) {
        await recalculateStockAllocation(taskToDelete.item_reference);
      }

      res.json({ message: 'Task deleted' });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  },

  // ── Préparation partielle (À Préparer → En Préparation) ────────────────────
  // Calqué sur applyDateNegotiation : actions REQUEST (planificateur) / APPROVE /
  // REJECT (commercial responsable). Voir migration 019.
  async applyPartialPreparation(req, res) {
    try {
      const task = await TaskModel.getById(req.params.id);
      if (!task) return res.status(404).json({ error: 'Task not found' });

      const role = req.user?.role;
      const action = `${req.body.action || ''}`.trim().toUpperCase();
      const now = new Date();
      const total = Math.round(Number(task.quantity || 0));
      const parentOrderCode = task.order_code || `SP-${task.id}`;

      if (action === 'REQUEST') {
        if (!['planner', 'super_admin'].includes(role)) {
          return res.status(403).json({ error: 'Acces refuse' });
        }
        if (!['TODO', 'IN_PROGRESS'].includes(task.status)) {
          return res.status(400).json({ error: 'La préparation partielle se déclare au passage en préparation.' });
        }
        if (task.partial_preparation_status === 'PENDING_CUSTOMER') {
          return res.status(400).json({ error: 'Une validation client est déjà en attente pour cette commande.' });
        }
        const prepCheck = validatePartialPreparationQuantity(req.body.preparedQuantity, total);
        if (!prepCheck.ok) return res.status(400).json({ error: prepCheck.error });
        const prepared = prepCheck.value;

        if (task.status !== 'IN_PROGRESS') {
          await TaskModel.updateStatus(task.id, 'IN_PROGRESS', null, req.user.id, role);
        }
        const updated = await TaskModel.update(task.id, {
          partialPreparationStatus: 'PENDING_CUSTOMER',
          partialPreparedQuantity: prepared,
          partialSplitPart: null,
          partialParentOrderCode: parentOrderCode,
          partialRequestedAt: now,
          partialRequestedBy: req.user.id,
          partialDecidedAt: null,
          partialDecidedBy: null,
        });
        await TaskHistoryModel.log({
          taskId: task.id, actorId: req.user.id, actionType: 'partial_preparation',
          fieldName: 'partial_preparation_status', oldValue: task.partial_preparation_status || null, newValue: 'PENDING_CUSTOMER',
          message: `Préparation partielle déclarée : ${prepared}/${total} — en attente validation client`,
        });
        // Notifier le(s) commercial(aux) responsable(s) de cette commande
        const commercials = await UserModel.findByRoles(['commercial']);
        const ids = commercials.filter((c) => c.commercial_id && c.commercial_id === task.commercial_id).map((c) => c.id);
        if (ids.length > 0) {
          await NotificationModel.createPartialPrepRequestNotifications({
            taskId: task.id, recipientUserIds: ids, plannerName: req.user.name,
            preparedQuantity: prepared, totalQuantity: total,
          });
        }
        broadcast('tasks-updated', { source: 'partial_prep', taskId: task.id });
        broadcast('notifications-updated', { source: 'partial_prep', taskId: task.id });
        return res.json(updated);
      }

      if (action === 'APPROVE' || action === 'REJECT') {
        if (task.partial_preparation_status !== 'PENDING_CUSTOMER') {
          return res.status(400).json({ error: 'Aucune préparation partielle en attente pour cette commande.' });
        }
        const isResponsible = role === 'commercial' && req.user.commercial_id && req.user.commercial_id === task.commercial_id;
        if (!isResponsible && role !== 'super_admin') {
          return res.status(403).json({ error: 'Seul le commercial responsable peut valider la préparation partielle.' });
        }
        const prepared = Math.round(Number(task.partial_prepared_quantity || 0));

        const planners = await UserModel.findByRoles(['planner', 'super_admin']);
        const plannerIds = planners.map((p) => p.id);

        if (action === 'REJECT') {
          // Annulation : retour en « À Préparer » avec la quantité totale, flags nettoyés.
          await TaskModel.updateStatus(task.id, 'TODO', null, req.user.id, 'super_admin');
          await TaskModel.update(task.id, {
            partialPreparationStatus: null,
            partialPreparedQuantity: null,
            partialSplitPart: null,
            partialRequestedAt: null,
            partialRequestedBy: null,
            partialDecidedAt: null,
            partialDecidedBy: null,
          });
          await TaskHistoryModel.log({
            taskId: task.id, actorId: req.user.id, actionType: 'partial_preparation',
            fieldName: 'partial_preparation_status', oldValue: 'PENDING_CUSTOMER', newValue: 'REJECTED',
            message: `Préparation partielle refusée par le client — retour en « À Préparer » (quantité totale ${total})`,
          });
          if (plannerIds.length > 0) {
            await NotificationModel.createPartialPrepDecisionNotifications({
              taskId: task.id, recipientUserIds: plannerIds, commercialName: req.user.name, decision: 'REJECTED',
            });
          }
          if (task.item_reference) await recalculateStockAllocation(task.item_reference);
          broadcast('tasks-updated', { source: 'partial_prep', taskId: task.id });
          broadcast('notifications-updated', { source: 'partial_prep', taskId: task.id });
          return res.json(await TaskModel.getById(task.id));
        }

        // APPROVE → split : origine = part préparée, + nouvelle tâche reliquat.
        const remainderQty = total - prepared;
        await TaskModel.update(task.id, {
          quantity: prepared,
          partialPreparationStatus: 'APPROVED',
          partialSplitPart: 'PREPARED',
          partialParentOrderCode: parentOrderCode,
          partialDecidedAt: now,
          partialDecidedBy: req.user.id,
        });
        const createdRemainder = await TaskModel.createMany({
          tasks: [{
            title: task.title,
            description: task.description,
            priority: task.priority,
            clientName: task.client_name,
            clientCode: task.client_code,
            orderCode: task.order_code,
            itemReference: task.item_reference,
            quantity: remainderQty,
            quantityUnit: task.quantity_unit,
            dueDate: task.due_date,
            plannedDate: task.planned_date,
            commercialId: task.commercial_id,
            assignedTo: task.assigned_to,
            partialOriginTaskId: task.id,
            partialParentOrderCode: parentOrderCode,
            partialSplitPart: 'REMAINDER',
          }],
          createdBy: task.created_by || req.user.id,
          workspaceId: task.workspace_id,
          status: 'WAITING_STOCK',
        });
        const remainder = createdRemainder[0];
        await TaskHistoryModel.log({
          taskId: task.id, actorId: req.user.id, actionType: 'partial_preparation',
          fieldName: 'partial_preparation_status', oldValue: 'PENDING_CUSTOMER', newValue: 'APPROVED',
          message: `Préparation partielle approuvée par le client : ${prepared}/${total} préparés — reliquat ${remainderQty} créé (SP-${remainder?.id})`,
        });
        if (remainder?.id) {
          await TaskHistoryModel.log({
            taskId: remainder.id, actorId: req.user.id, actionType: 'created',
            message: `Reliquat de SP-${task.id} (${parentOrderCode}) : ${remainderQty} restant — en attente stock`,
          });
        }
        if (task.item_reference) await recalculateStockAllocation(task.item_reference);
        if (plannerIds.length > 0) {
          await NotificationModel.createPartialPrepDecisionNotifications({
            taskId: task.id, recipientUserIds: plannerIds, commercialName: req.user.name, decision: 'APPROVED',
          });
        }
        broadcast('tasks-updated', { source: 'partial_prep', taskId: task.id });
        broadcast('notifications-updated', { source: 'partial_prep', taskId: task.id });
        return res.json({ task: await TaskModel.getById(task.id), remainder });
      }

      return res.status(400).json({ error: 'Action invalide. Utilisez REQUEST, APPROVE ou REJECT.' });
    } catch (err) {
      if (isHttpError(err)) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error('Partial preparation failed:', err);
      return res.status(500).json({ error: 'Server error' });
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
  },

  // POST /tasks/:id/mark-delivered — livreur : livraison cumulative sur une seule fiche
  async markDelivered(req, res) {
    const taskIdParam = req.params.id;
    let lockClient = null;
    try {
      // Verrou consultatif par tâche : sérialise les livraisons concurrentes du
      // MÊME ordre → empêche la sur-livraison / double déduction (deux livreurs).
      // Best-effort + pooler-safe (xact lock + lock_timeout) ; dégrade sans verrou.
      try {
        lockClient = await pool.connect();
        await lockClient.query('BEGIN');
        await lockClient.query("SET LOCAL lock_timeout = '5s'");
        await lockClient.query('SELECT pg_advisory_xact_lock($1)', [Number(taskIdParam)]);
      } catch (e) {
        if (lockClient) {
          try { await lockClient.query('ROLLBACK'); } catch (_) { /* ignore */ }
          try { lockClient.release(); } catch (_) { /* ignore */ }
          lockClient = null;
        }
      }

      // Lecture FRAÎCHE après acquisition du verrou (quantity_delivered à jour).
      const task = await TaskModel.getById(taskIdParam);
      if (!task) return res.status(404).json({ error: 'Tâche introuvable' });

      if (task.status !== 'DONE') {
        return res.status(400).json({ error: 'Seules les fiches « Prêt à Livrer » peuvent être livrées.' });
      }

      const total = Math.round(Number(task.quantity || 0));
      const alreadyDelivered = Math.round(Number(task.quantity_delivered || 0));
      const remaining = total - alreadyDelivered;

      if (remaining <= 0) {
        return res.status(400).json({ error: 'Cette commande est déjà entièrement livrée.' });
      }

      const body = req.body || {};
      const hasThisShip = body.deliveredQuantity != null && body.deliveredQuantity !== '';
      const requestedShip = hasThisShip ? body.deliveredQuantity : remaining;
      const shipCheck = validateDeliveryQuantity(requestedShip, remaining);
      if (!shipCheck.ok) return res.status(400).json({ error: shipCheck.error });
      const thisShip = shipCheck.value;

      await deductStockForTask(task, thisShip);

      const newDelivered = alreadyDelivered + thisShip;
      const isComplete = newDelivered >= total;
      const pct = total > 0 ? Math.round((newDelivered / total) * 100) : 100;

      const recipientIds = await getDeliveryNotificationRecipientIds(task, req.user.id);
      const livreurName = req.user.name || 'Livreur';

      if (isComplete) {
        await TaskModel.update(task.id, { quantityDelivered: total });
        const updatedTask = await TaskModel.updateStatus(req.params.id, 'DELIVERED', null, req.user.id, req.user.role);
        if (!updatedTask) return res.status(404).json({ error: 'Tâche introuvable' });

        if (updatedTask.item_reference) {
          await recalculateStockAllocation(updatedTask.item_reference);
        }

        const msg = alreadyDelivered > 0
          ? `Livraison terminée : +${thisShip} pcs (${total}/${total} — 100 %)`
          : `Statut changé de ${TASK_STATUS_LABELS['DONE']} vers ${TASK_STATUS_LABELS['DELIVERED']}`;

        await TaskHistoryModel.log({
          taskId: task.id,
          actorId: req.user.id,
          actionType: alreadyDelivered > 0 ? 'partial_delivery' : 'status_updated',
          fieldName: 'status',
          oldValue: 'DONE',
          newValue: 'DELIVERED',
          message: msg,
        });

        if (recipientIds.length > 0) {
          await NotificationModel.createDeliveryCompletedNotificationBatch({
            taskId: task.id,
            recipientUserIds: recipientIds,
            livreurName,
            total,
            completedAfterPartial: alreadyDelivered > 0,
            lastShip: thisShip,
            taskTitle: task.title,
          });
        }

        broadcast('tasks-updated', { source: 'mark_delivered', taskId: updatedTask.id });
        return res.json(await TaskModel.getById(task.id));
      }

      // Livraison partielle : reste en « Prêt à Livrer », progression cumulée
      await TaskModel.update(task.id, { quantityDelivered: newDelivered });

      if (task.item_reference) {
        await recalculateStockAllocation(task.item_reference);
      }

      await TaskHistoryModel.log({
        taskId: task.id,
        actorId: req.user.id,
        actionType: 'partial_delivery',
        fieldName: 'quantity_delivered',
        oldValue: String(alreadyDelivered),
        newValue: String(newDelivered),
        message: `Livraison partielle : +${thisShip} pcs — ${newDelivered}/${total} livrés (${pct} %)`,
      });

      if (recipientIds.length > 0) {
        await NotificationModel.createPartialDeliveryNotificationBatch({
          taskId: task.id,
          recipientUserIds: recipientIds,
          livreurName,
          thisShip,
          newDelivered,
          total,
          pct,
          remaining: total - newDelivered,
          taskTitle: task.title,
        });
      }

      broadcast('tasks-updated', { source: 'partial_delivery', taskId: task.id });
      return res.json(await TaskModel.getById(task.id));
    } catch (err) {
      console.error('markDelivered error:', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    } finally {
      if (lockClient) {
        try { await lockClient.query('COMMIT'); } catch (_) {
          try { await lockClient.query('ROLLBACK'); } catch (__) { /* ignore */ }
        }
        try { lockClient.release(); } catch (_) { /* ignore */ }
      }
    }
  }
};

module.exports = taskController;
