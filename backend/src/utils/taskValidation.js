const { TASK_CREATION_STATUSES, TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES } = require('../constants/task');
const { createHttpError } = require('./httpErrors');
const { isValidArticleCode, normalizeArticleCode } = require('./articleCode');

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

function normalizeOptionalArticleCode(value, label = 'Reference article') {
  const normalized = normalizeOptionalString(value, { label, maxLength: 255 });
  if (!normalized) return null;
  const upper = normalizeArticleCode(normalized);
  if (!isValidArticleCode(upper)) {
    throw createHttpError(400, 'Code article invalide. Prefixes autorises: CI, CV, DI, DV, PL');
  }
  return upper;
}

function normalizeTaskMetadata(data = {}) {
  return {
    clientName: normalizeOptionalString(data.clientName, { label: 'Client', maxLength: 255 }),
    clientCode: normalizeOptionalString(data.clientCode, { label: 'Code client', maxLength: 100 }),
    orderCode: normalizeOptionalString(data.orderCode, { label: 'Code commande', maxLength: 100 }),
    itemReference: normalizeOptionalArticleCode(data.itemReference, 'Reference article'),
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

function normalizeTaskType(value) {
  if (!value) return 'PRODUCTION_ORDER';
  if (!TASK_TYPES.includes(value)) throw createHttpError(400, 'Type de tache invalide');
  return value;
}

function normalizeTaskDraft(data = {}) {
  return {
    title: normalizeTitle(data.title),
    description: normalizeDescription(data.description),
    priority: normalizePriority(data.priority),
    taskType: normalizeTaskType(data.taskType),
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

  if (Object.prototype.hasOwnProperty.call(data, 'commercialId')) {
    normalized.commercialId = data.commercialId == null || data.commercialId === '' ? null : data.commercialId;
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

/**
 * Valide la quantité d'une préparation PARTIELLE : entier strict, 0 < prepared < total.
 * Fonction pure (testable) → renvoie { ok, value } ou { ok:false, error }.
 */
function validatePartialPreparationQuantity(prepared, total) {
  const t = Math.round(Number(total));
  const p = Math.round(Number(prepared));
  if (!Number.isFinite(p)) return { ok: false, error: 'Quantité préparée invalide.' };
  if (p <= 0) return { ok: false, error: 'La quantité préparée doit être supérieure à 0.' };
  if (p >= t) return { ok: false, error: 'Quantité préparée invalide (entre 1 et la quantité totale - 1).' };
  return { ok: true, value: p };
}

/**
 * Valide la quantité d'une LIVRAISON (partielle ou complète) : entier, 1 ≤ ship ≤ remaining.
 * Fonction pure (testable).
 */
function validateDeliveryQuantity(thisShip, remaining) {
  const r = Math.round(Number(remaining));
  const s = Math.round(Number(thisShip));
  if (!Number.isFinite(s)) return { ok: false, error: 'Quantité de livraison invalide.' };
  if (s <= 0) return { ok: false, error: 'La quantité livrée doit être supérieure à 0.' };
  if (s > r) {
    return { ok: false, error: r === 1 ? 'Il reste 1 pièce — utilisez la livraison complète.' : `Quantité invalide (entre 1 et ${r}).` };
  }
  return { ok: true, value: s };
}

module.exports = {
  normalizeCreationStatus,
  normalizeCommentBody,
  normalizeTaskBatch,
  normalizeTaskDraft,
  normalizeTaskMetadata,
  normalizeTaskUpdatePayload,
  validatePartialPreparationQuantity,
  validateDeliveryQuantity,
};
