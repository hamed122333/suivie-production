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

// Transitions de statut AUTORISÉES par glisser-déposer (anti-parachutage). On suit le
// flux : Hors Stock PF → À Préparer → En Préparation → (Prêt à Livrer = AUTO) → Livré.
// - DONE (Prêt à Livrer) n'est jamais une cible manuelle : il est posé par le système
//   à la confirmation du stock PF.
// - Les retours en arrière contrôlés (révision / déblocage) sont permis.
// Toute transition absente de cette table est refusée côté board.
export const TASK_DRAG_TRANSITIONS = {
  WAITING_STOCK: ['TODO', 'BLOCKED'],
  TODO:          ['IN_PROGRESS', 'WAITING_STOCK', 'BLOCKED'],
  IN_PROGRESS:   ['TODO', 'BLOCKED'],
  BLOCKED:       ['WAITING_STOCK', 'TODO', 'IN_PROGRESS'],
  DONE:          ['DELIVERED'],
  DELIVERED:     [],
  PENDING_APPROVAL: [],
};

// Limites de WIP (Work In Progress) par colonne — méthode Kanban. SOFT : alerte visuelle
// uniquement, jamais bloquant. null = pas de limite. (Miroir de backend/constants/task.js)
export const TASK_WIP_LIMITS = {
  WAITING_STOCK: null,
  TODO: 25,
  IN_PROGRESS: 10,
  BLOCKED: 8,
  DONE: null,
  DELIVERED: null,
};

// Aging : seuils (jours dans la colonne) avant alerte sur la carte, et colonnes concernées.
export const TASK_AGING_THRESHOLDS = { warn: 3, danger: 7 };
export const TASK_AGING_STATUSES = ['WAITING_STOCK', 'TODO', 'IN_PROGRESS', 'BLOCKED'];

/**
 * Ancienneté d'une carte dans sa colonne courante (depuis status_changed_at).
 * Retourne null si non applicable (statut non concerné, pas d'horodatage, < 1 jour).
 * level : 'warn' | 'danger' selon les seuils ; sert au style du badge.
 */
export function getTaskAging(task) {
  if (!task || !TASK_AGING_STATUSES.includes(task.status)) return null;
  const ref = task.status_changed_at || task.updated_at;
  if (!ref) return null;
  const ms = Date.now() - new Date(ref).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const days = Math.floor(ms / 86400000);
  if (days < 1) return null;
  let level = null;
  if (days >= TASK_AGING_THRESHOLDS.danger) level = 'danger';
  else if (days >= TASK_AGING_THRESHOLDS.warn) level = 'warn';
  return { days, level };
}

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
export const DELIVERY_PROGRESS_BADGE = { label: 'Livraison en cours', color: '#15803d', bg: '#dcfce7' };

/** Progression livraison cumulative (une seule fiche, pas de split). */
export function getDeliveryProgress(task) {
  if (!task) return null;
  const total = Math.round(Number(task.quantity || 0));
  if (total <= 0) return null;

  const delivered = task.status === 'DELIVERED'
    ? total
    : Math.round(Number(task.quantity_delivered || 0));

  if (delivered <= 0) return null;

  const remaining = Math.max(0, total - delivered);
  const pct = Math.min(100, Math.round((delivered / total) * 100));

  return { total, delivered, remaining, pct, inProgress: task.status === 'DONE' && remaining > 0 };
}

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
