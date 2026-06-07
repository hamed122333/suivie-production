export const TASK_STATUS_ORDER = [
  'WAITING_STOCK',
  'TODO',
  'IN_PROGRESS',
  'BLOCKED',
  'DONE',
  'DELIVERED',
];

export const TASK_STATUS_CONFIG = {
  WAITING_STOCK: { label: 'Hors Stock PF',  shortLabel: 'Hors stock', color: '#7c3aed', bg: '#f5f3ff', headerBg: '#ede9fe' },
  TODO:          { label: 'À Préparer',      shortLabel: 'À préparer', color: '#1d4ed8', bg: '#eff6ff', headerBg: '#dbeafe' },
  IN_PROGRESS:   { label: 'En Préparation',  shortLabel: 'En prép.',   color: '#c2410c', bg: '#fff7ed', headerBg: '#ffedd5' },
  DONE:          { label: 'Prêt à Livrer',   shortLabel: 'Prêt',       color: '#15803d', bg: '#f0fdf4', headerBg: '#dcfce7' },
  BLOCKED:       { label: 'Bloquée',         shortLabel: 'Bloquée',    color: '#b91c1c', bg: '#fef2f2', headerBg: '#fee2e2' },
  DELIVERED:     { label: 'Livré',           shortLabel: 'Livré',      color: '#374151', bg: '#f9fafb', headerBg: '#e5e7eb' },
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
  DELIVERED: 'totalDelivered',
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

// Préparation partielle — libellés/couleurs des badges (sous-état, pas un statut Kanban)
export const PARTIAL_PREP_STATUS = {
  PENDING_CUSTOMER: { label: 'Partielle · attente client', color: '#b45309', bg: '#fef3c7' },
  APPROVED:         { label: 'Partielle approuvée',        color: '#15803d', bg: '#dcfce7' },
};
export const PARTIAL_REMAINDER_BADGE = { label: 'Reliquat', color: '#7c3aed', bg: '#ede9fe' };

// Article category configuration (derived from article code prefix)
export const ARTICLE_CATEGORY_CONFIG = {
  CI: { label: 'Carterie', color: '#2563eb', bg: '#dbeafe' },
  CV: { label: 'Carterie', color: '#7c3aed', bg: '#ede9fe' },
  DI: { label: 'Divers', color: '#d97706', bg: '#fef3c7' },
  DV: { label: 'Divers', color: '#ea580c', bg: '#ffedd5' },
  FC: { label: 'Feraille', color: '#c2410c', bg: '#ffedd5' },
  FD: { label: 'Feraille', color: '#c2410c', bg: '#ffedd5' },
  PL: { label: 'Plastique', color: '#15803d', bg: '#dcfce7' },
};

export function getArticleCategory(itemReference) {
  if (!itemReference) return null;
  const prefix = itemReference.toUpperCase().split('-')[0] || itemReference.toUpperCase().slice(0, 2);
  return ARTICLE_CATEGORY_CONFIG[prefix] || null;
}

export function getCoveragePercent(task) {
  if (!task || task.status === 'DONE') return null;
  const requested = Number(task.quantity || 0);
  const allocated = Number(task.stock_allocated ?? 0);
  if (requested <= 0) return null;
  return Math.round((allocated / requested) * 100);
}
