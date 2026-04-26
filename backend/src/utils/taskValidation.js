const { TASK_CREATION_STATUSES, TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES } = require('../constants/task');
const { createHttpError } = require('./httpErrors');

function normalizeTitle(title) {
  const value = `${title || ''}`.trim();
  if (!value) {
    throw createHttpError(400, 'Le titre est obligatoire');
  }
  return value;
}

function normalizeDescription(description) {
  if (description == null) return null;
  const value = `${description}`.trim();
  return value || null;
}

function normalizeOptionalString(value, { label, maxLength } = {}) {
  if (value == null) return null;

  const normalized = `${value}`.trim();
  if (!normalized) return null;

  if (maxLength && normalized.length > maxLength) {
    throw createHttpError(400, `${label || 'Champ'} trop long`);
  }

  return normalized;
}

function normalizeOptionalDate(value, label = 'Date') {
  if (value == null || value === '') return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw createHttpError(400, `${label} invalide`);
  }

  return date.toISOString().slice(0, 10);
}

function normalizeOptionalQuantity(value) {
  if (value == null || value === '') return null;

  const numericValue = Number.parseFloat(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    throw createHttpError(400, 'Quantite invalide');
  }

  return Number(numericValue.toFixed(2));
}

function normalizeTaskMetadata(data = {}) {
  return {
    clientName: normalizeOptionalString(data.clientName, { label: 'Client', maxLength: 255 }),
    orderCode: normalizeOptionalString(data.orderCode, { label: 'Code commande', maxLength: 100 }),
    itemReference: normalizeOptionalString(data.itemReference, { label: 'Reference article', maxLength: 255 }),
    quantity: normalizeOptionalQuantity(data.quantity),
    quantityUnit: normalizeOptionalString(data.quantityUnit, { label: 'Unite', maxLength: 50 }) || 'pcs',
    dueDate: normalizeOptionalDate(data.dueDate, 'Date d echeance'),
    plannedDate: normalizeOptionalDate(data.plannedDate, 'Date planifiee'),
    productionLine: normalizeOptionalString(data.productionLine, { label: 'Ligne de production', maxLength: 120 }),
    machine: normalizeOptionalString(data.machine, { label: 'Machine', maxLength: 120 }),
    workshop: normalizeOptionalString(data.workshop, { label: 'Atelier', maxLength: 120 }),
    notes: normalizeDescription(data.notes),
    expectedAction: normalizeDescription(data.expectedAction),
  };
}

function normalizePriority(priority) {
  if (priority == null || priority === '') {
    return 'MEDIUM';
  }

  if (!TASK_PRIORITIES.includes(priority)) {
    throw createHttpError(400, 'Priorite invalide');
  }

  return priority;
}

function normalizeCreationStatus(status) {
  if (status == null || status === '') {
    return 'TODO';
  }

  if (!TASK_CREATION_STATUSES.includes(status)) {
    throw createHttpError(400, 'Statut de creation invalide');
  }

  return status;
}

function normalizeTaskDraft(data = {}) {
  return {
    title: normalizeTitle(data.title),
    description: normalizeDescription(data.description),
    priority: normalizePriority(data.priority),
    ...normalizeTaskMetadata(data),
  };
}

function normalizeTaskBatch(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw createHttpError(400, 'La liste des taches est obligatoire');
  }

  return tasks.map((task) => {
    const normalized = normalizeTaskDraft(task);
    if (task.stockImportId != null) {
      const id = Number.parseInt(task.stockImportId, 10);
      if (Number.isInteger(id) && id > 0) {
        normalized.stockImportId = id;
      }
    }
    if (task.taskType != null && TASK_TYPES.includes(task.taskType)) {
      normalized.taskType = task.taskType;
    }
    return normalized;
  });
}

function normalizeTaskUpdatePayload(data = {}) {
  const normalized = {};

  if (Object.prototype.hasOwnProperty.call(data, 'title')) {
    normalized.title = normalizeTitle(data.title);
  }

  if (Object.prototype.hasOwnProperty.call(data, 'description')) {
    normalized.description = normalizeDescription(data.description);
  }

  if (Object.prototype.hasOwnProperty.call(data, 'priority')) {
    normalized.priority = normalizePriority(data.priority);
  }

  if (Object.prototype.hasOwnProperty.call(data, 'status')) {
    if (!TASK_STATUSES.includes(data.status)) {
      throw createHttpError(400, 'Statut invalide');
    }
    normalized.status = data.status;
  }

  if (Object.prototype.hasOwnProperty.call(data, 'reasonBlocked')) {
    normalized.reasonBlocked = normalizeDescription(data.reasonBlocked);
  }

  if (Object.prototype.hasOwnProperty.call(data, 'assignedTo')) {
    if (data.assignedTo == null || data.assignedTo === '') {
      normalized.assignedTo = null;
    } else {
      const assignedTo = Number.parseInt(data.assignedTo, 10);
      if (!Number.isInteger(assignedTo)) {
        throw createHttpError(400, 'assignedTo invalide');
      }
      normalized.assignedTo = assignedTo;
    }
  }

  const metadata = normalizeTaskMetadata(data);
  for (const [key, value] of Object.entries(metadata)) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      normalized[key] = value;
    }
  }

  return normalized;
}

function normalizeCommentBody(body) {
  const value = normalizeDescription(body);
  if (!value) {
    throw createHttpError(400, 'Le commentaire est obligatoire');
  }
  return value;
}

module.exports = {
  normalizeCreationStatus,
  normalizeCommentBody,
  normalizeTaskBatch,
  normalizeTaskDraft,
  normalizeTaskMetadata,
  normalizeTaskUpdatePayload,
};
