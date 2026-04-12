export const WORKSPACE_TYPES = {
  STOCK: 'STOCK',
  PREPARATION: 'PREPARATION',
  RUPTURE: 'RUPTURE',
};

export const WORKSPACE_TYPE_CONFIG = {
  [WORKSPACE_TYPES.STOCK]: {
    label: 'Stock produits finis',
    description: 'Saisie limitee aux articles importes et disponibles.',
    badge: 'Stock',
    color: '#2563eb',
    bg: '#dbeafe',
  },
  [WORKSPACE_TYPES.PREPARATION]: {
    label: 'Preparation planifiee',
    description: 'Demandes libres avec une date planifiee obligatoire.',
    badge: 'Prep',
    color: '#b45309',
    bg: '#fef3c7',
  },
  [WORKSPACE_TYPES.RUPTURE]: {
    label: 'Rupture / Urgence',
    description: 'Commandes tres urgentes, priorite automatique Urgente.',
    badge: 'Urgent',
    color: '#b91c1c',
    bg: '#fee2e2',
  },
};

export const WORKSPACE_TYPE_OPTIONS = Object.values(WORKSPACE_TYPES).map((value) => ({
  value,
  label: WORKSPACE_TYPE_CONFIG[value].label,
  description: WORKSPACE_TYPE_CONFIG[value].description,
}));

export function resolveWorkspaceType(workspace) {
  if (!workspace || !workspace.type) return WORKSPACE_TYPES.STOCK;
  return Object.values(WORKSPACE_TYPES).includes(workspace.type) ? workspace.type : WORKSPACE_TYPES.STOCK;
}
