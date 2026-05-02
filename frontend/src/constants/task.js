export const TASK_STATUS_ORDER = [
  'WAITING_STOCK',
  'TODO',
  'IN_PROGRESS',
  'BLOCKED',
  'DONE',
];

export const TASK_STATUS_CONFIG = {
  TODO: { label: 'A faire', shortLabel: 'A faire', color: '#1d4ed8', bg: '#eff6ff', headerBg: '#dbeafe' },
  WAITING_STOCK: { label: 'Hors stock PF', shortLabel: 'Hors stock', color: '#7c3aed', bg: '#f5f3ff', headerBg: '#ede9fe' },
  IN_PROGRESS: { label: 'En cours', shortLabel: 'En cours', color: '#c2410c', bg: '#fff7ed', headerBg: '#ffedd5' },
  DONE: { label: 'Terminee', shortLabel: 'Terminee', color: '#15803d', bg: '#f0fdf4', headerBg: '#dcfce7' },
  BLOCKED: { label: 'Bloquee', shortLabel: 'Bloquee', color: '#b91c1c', bg: '#fef2f2', headerBg: '#fee2e2' },
};

export const TASK_PRIORITY_CONFIG = {
  LOW: { color: '#6b7280', bg: '#f3f4f6', label: 'Basse', icon: '▾' },
  MEDIUM: { color: '#d97706', bg: '#fef3c7', label: 'Moyenne', icon: '◆' },
  HIGH: { color: '#dc2626', bg: '#fee2e2', label: 'Haute', icon: '▲' },
  URGENT: { color: '#7c3aed', bg: '#ede9fe', label: 'Urgente', icon: '!' },
};

export const TASK_PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Basse' },
  { value: 'MEDIUM', label: 'Moyenne' },
  { value: 'HIGH', label: 'Haute' },
  { value: 'URGENT', label: 'Urgente' },
];

export const STATUS_COUNT_FIELDS = {
  TODO: 'totalTodo',
  WAITING_STOCK: 'totalWaitingStock',
  IN_PROGRESS: 'totalInProgress',
  BLOCKED: 'totalBlocked',
  DONE: 'totalDone',
};

export const TASK_STATUS_OPTIONS = TASK_STATUS_ORDER.map((status) => ({
  value: status,
  label: TASK_STATUS_CONFIG[status].label,
}));

export function getTaskKey(task) {
  if (!task || task.id == null) {
    return 'SP-—';
  }
  return `SP-${task.id}`;
}

export const TASK_TYPE_CONFIG = {
  PRODUCTION_ORDER: { label: 'Commande', badge: null },
  PREDICTIVE: { label: 'Prévisionnel', badge: 'Prévisionnel', color: '#0369a1', bg: '#e0f2fe' },
};

// Seuil (jours) à partir duquel une date de livraison est considérée urgente dans la colonne Hors stock
export const WAITING_STOCK_ALERT_DAYS = 2;
