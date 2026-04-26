const TASK_STATUSES = [
  'OUT_OF_STOCK',
  'TODO',
  'IN_PROGRESS',
  'BLOCKED',
  'DONE',
];

const TASK_BOARD_STATUSES = [...TASK_STATUSES];
const TASK_CREATION_STATUSES = ['TODO', 'OUT_OF_STOCK'];
const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const TASK_TYPES = ['PRODUCTION_ORDER', 'OUT_OF_STOCK_ORDER'];

const TASK_STATUS_LABELS = {
  OUT_OF_STOCK: 'Hors stock',
  TODO: 'A faire',
  IN_PROGRESS: 'En cours',
  DONE: 'Terminee',
  BLOCKED: 'Bloquee',
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
  TASK_TYPES,
  TASK_STATUS_LABELS,
  TRACKED_TASK_FIELDS,
};
