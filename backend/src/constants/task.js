const TASK_STATUSES = [
  'TODO',
  'IN_PROGRESS',
  'BLOCKED',
  'DONE',
];

const TASK_BOARD_STATUSES = [...TASK_STATUSES];
const TASK_CREATION_STATUSES = ['TODO'];
const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const TASK_STATUS_LABELS = {
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
  TASK_STATUS_LABELS,
  TRACKED_TASK_FIELDS,
};
