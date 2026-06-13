const { createHttpError } = require('./httpErrors');

// super_admin/planner : vue complète. importer : vue complète aussi (il importe
// et corrige les anomalies des commandes), mais ses droits d'action sont limités
// aux imports/corrections côté routes.
const PRIVILEGED_TASK_ROLES = new Set(['super_admin', 'planner', 'importer']);

function isPrivilegedTaskRole(role) {
  return PRIVILEGED_TASK_ROLES.has(role);
}

function parseOptionalInteger(value) {
  if (value == null || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    throw createHttpError(400, 'Valeur numerique invalide');
  }
  return parsed;
}

function parseWorkspaceId(value, { required = false } = {}) {
  if (value == null || value === '') {
    if (required) {
      throw createHttpError(400, 'workspaceId est obligatoire');
    }
    return null;
  }

  const workspaceId = Number.parseInt(value, 10);
  if (!Number.isInteger(workspaceId)) {
    throw createHttpError(400, 'workspaceId invalide');
  }

  return workspaceId;
}

function buildTaskFilters(query = {}) {
  const filters = {};

  if (query.assignedTo) {
    filters.assignedTo = parseOptionalInteger(query.assignedTo);
  }

  // Filter by commercial code (VL000XXX) — used by planner/admin to filter by commercial
  if (query.commercialId) {
    filters.commercialId = `${query.commercialId}`.trim().toUpperCase();
  }

  if (query.status) {
    filters.status = query.status;
  }

  if (query.date) {
    filters.date = query.date;
  }

  if (query.createdFrom) {
    filters.createdFrom = query.createdFrom;
  }

  if (query.createdTo) {
    filters.createdTo = query.createdTo;
  }

  // Date range filter on planned_date (delivery date) — replaces workspace selector in UI
  if (query.plannedFrom) {
    filters.plannedFrom = query.plannedFrom;
  }

  if (query.plannedTo) {
    filters.plannedTo = query.plannedTo;
  }

  const workspaceId = parseWorkspaceId(query.workspaceId || query.workspace);
  if (workspaceId) {
    filters.workspaceId = workspaceId;
  }

  return filters;
}

function applyTaskVisibility(filters, user) {
  const role = user?.role;

  // Never show PENDING_APPROVAL on the kanban — it lives only in the review table.
  // If a specific status filter is set (e.g. getPendingApproval passes status:'PENDING_APPROVAL')
  // we skip the board-status guard so the review endpoint still works.
  const base =
    filters.status === 'PENDING_APPROVAL'
      ? filters
      : { statusNotIn: ['PENDING_APPROVAL'], ...filters };

  // super_admin and planner see everything (except PENDING_APPROVAL filtered above)
  if (isPrivilegedTaskRole(role)) {
    return base;
  }

  // commercial sees only tasks linked to their commercial code (VL000XXX)
  // Uses commercial_id (the VL code) so it works even when tasks were imported
  // before the commercial user account was created.
  if (role === 'commercial') {
    if (user?.commercial_id) {
      return { ...base, commercialId: user.commercial_id };
    }
    // Fallback: no commercial_id on account → show nothing
    return { ...base, assignedTo: -1 };
  }

  // livreur sees tasks that are in active/delivery statuses
  if (role === 'livreur') {
    return { ...filters, statusIn: ['IN_PROGRESS', 'DONE', 'DELIVERED'] };
  }

  // regular user: only tasks they created
  return { ...base, createdBy: user?.id };
}

function canAccessTask(user, task) {
  if (!task) return false;
  const role = user?.role;
  if (isPrivilegedTaskRole(role)) return true;
  if (role === 'commercial') {
    // Match by commercial_id code (VL000XXX) — works for imported tasks
    if (user?.commercial_id) return task.commercial_id === user.commercial_id;
    return task.assigned_to === user?.id;
  }
  if (role === 'livreur') return ['IN_PROGRESS', 'DONE', 'DELIVERED'].includes(task.status);
  return task.created_by === user?.id;
}

module.exports = {
  applyTaskVisibility,
  buildTaskFilters,
  canAccessTask,
  isPrivilegedTaskRole,
  parseOptionalInteger,
  parseWorkspaceId,
};
