const { createHttpError } = require('./httpErrors');

const PRIVILEGED_TASK_ROLES = new Set(['super_admin', 'planner']);

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

  const workspaceId = parseWorkspaceId(query.workspaceId || query.workspace);
  if (workspaceId) {
    filters.workspaceId = workspaceId;
  }

  return filters;
}

function applyTaskVisibility(filters, user) {
  if (!isPrivilegedTaskRole(user?.role)) {
    return { ...filters, createdBy: user?.id };
  }

  return filters;
}

function canAccessTask(user, task) {
  if (!task) return false;
  if (isPrivilegedTaskRole(user?.role)) return true;
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
