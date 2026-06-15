const TASK_STATUSES = [
  'PENDING_APPROVAL', // Commercial must approve before entering production
  'WAITING_STOCK',
  'TODO',
  'IN_PROGRESS',
  'BLOCKED',
  'DONE',
  'DELIVERED',
];

const TASK_TYPES = ['PRODUCTION_ORDER', 'PREDICTIVE'];

// Nombre de jours à partir duquel une date est considérée urgente (approbation planner requise)
const URGENT_DATE_THRESHOLD_DAYS = 3;

// Seuil (jours) à partir duquel une date de livraison est considérée urgente dans la colonne Hors stock
const WAITING_STOCK_ALERT_DAYS = 2;

// Board statuses: PENDING_APPROVAL is NOT shown on the Kanban board — it lives in the commercial review table
const TASK_BOARD_STATUSES = ['WAITING_STOCK', 'TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'DELIVERED'];
const TASK_CREATION_STATUSES = ['TODO', 'WAITING_STOCK', 'PENDING_APPROVAL'];
const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

// Limites de WIP (Work In Progress) par colonne du board — méthode Kanban.
// SOFT : purement indicatif (alerte visuelle), jamais bloquant. null = pas de limite.
// IN_PROGRESS est le vrai goulot (capacité de l'atelier) → limite la plus stricte.
const TASK_WIP_LIMITS = {
  WAITING_STOCK: null,
  TODO: 25,
  IN_PROGRESS: 10,
  BLOCKED: 8,
  DONE: null,
  DELIVERED: null,
};

// Seuils d'« aging » (jours dans la colonne courante) avant alerte visuelle sur la carte.
// Ne s'applique qu'aux colonnes actives (une carte livrée ne « vieillit » pas).
const TASK_AGING_THRESHOLDS = { warn: 3, danger: 7 };
const TASK_AGING_STATUSES = ['WAITING_STOCK', 'TODO', 'IN_PROGRESS', 'BLOCKED'];

const TASK_STATUS_LABELS = {
  PENDING_APPROVAL: 'En attente de validation',
  TODO:          'À Préparer',
  WAITING_STOCK: 'Hors Stock PF',
  IN_PROGRESS:   'En Préparation',
  DONE:          'Prêt à Livrer',
  BLOCKED:       'Bloquée',
  DELIVERED:     'Livré',
};

const TRACKED_TASK_FIELDS = [
  'title',
  'description',
  'priority',
  'assignedTo',
  'clientName',
  'orderCode',
  'itemReference',
  'quantity',
  'quantityUnit',
  'dueDate',
  'plannedDate',
  'productionLine',
  'machine',
  'workshop',
  'notes',
  'expectedAction',
];

module.exports = {
  TASK_BOARD_STATUSES,
  TASK_STATUSES,
  TASK_CREATION_STATUSES,
  TASK_PRIORITIES,
  TASK_WIP_LIMITS,
  TASK_AGING_THRESHOLDS,
  TASK_AGING_STATUSES,
  TASK_STATUS_LABELS,
  TRACKED_TASK_FIELDS,
  TASK_TYPES,
  URGENT_DATE_THRESHOLD_DAYS,
  WAITING_STOCK_ALERT_DAYS,
};
