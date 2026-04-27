const pool = require('../config/db');
const { TASK_BOARD_STATUSES } = require('../constants/task');

const priorityOrderSql = `
  CASE t.priority
    WHEN 'URGENT' THEN 1
    WHEN 'HIGH' THEN 2
    WHEN 'MEDIUM' THEN 3
    WHEN 'LOW' THEN 4
    ELSE 5
  END`;

const statusOrderSql = `
  CASE t.status
    WHEN 'WAITING_STOCK' THEN 1
    WHEN 'TODO' THEN 2
    WHEN 'IN_PROGRESS' THEN 3
    WHEN 'BLOCKED' THEN 4
    WHEN 'DONE' THEN 5
    ELSE 9
  END`;

const taskBaseSelect = `
  SELECT
    t.*,
    w.name AS workspace_name,
    assigned.name AS assigned_to_name,
    created.name AS created_by_name,
    blocked.name AS blocked_by_name
  FROM tasks t
  LEFT JOIN workspaces w ON w.id = t.workspace_id
  LEFT JOIN users assigned ON assigned.id = t.assigned_to
  LEFT JOIN users created ON created.id = t.created_by
  LEFT JOIN users blocked ON blocked.id = t.blocked_by
`;

const createFieldMap = {
  taskType: 'task_type',
  title: 'title',
  description: 'description',
  priority: 'priority',
  clientName: 'client_name',
  orderCode: 'order_code',
  itemReference: 'item_reference',
  quantity: 'quantity',
  quantityUnit: 'quantity_unit',
  dueDate: 'due_date',
  plannedDate: 'planned_date',
  productionLine: 'production_line',
  machine: 'machine',
  workshop: 'workshop',
  notes: 'notes',
  expectedAction: 'expected_action',
  stockImportId: 'stock_import_id',
};

const updateFieldMap = {
  taskType: 'task_type',
  title: 'title',
  description: 'description',
  priority: 'priority',
  assignedTo: 'assigned_to',
  clientName: 'client_name',
  orderCode: 'order_code',
  itemReference: 'item_reference',
  quantity: 'quantity',
  quantityUnit: 'quantity_unit',
  dueDate: 'due_date',
  plannedDate: 'planned_date',
  productionLine: 'production_line',
  machine: 'machine',
  workshop: 'workshop',
  notes: 'notes',
  expectedAction: 'expected_action',
};

function appendFilters(filters, params) {
  const conditions = [];

  if (filters.assignedTo) {
    params.push(filters.assignedTo);
    conditions.push(`t.assigned_to = $${params.length}`);
  }

  if (filters.createdBy) {
    params.push(filters.createdBy);
    conditions.push(`t.created_by = $${params.length}`);
  }

  if (filters.workspaceId) {
    params.push(filters.workspaceId);
    conditions.push(`t.workspace_id = $${params.length}`);
  }

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`t.status = $${params.length}`);
  }

  if (filters.date) {
    params.push(filters.date);
    conditions.push(`DATE(t.created_at) = $${params.length}`);
  }

  if (filters.createdFrom) {
    params.push(filters.createdFrom);
    conditions.push(`DATE(t.created_at) >= $${params.length}`);
  }

  if (filters.createdTo) {
    params.push(filters.createdTo);
    conditions.push(`DATE(t.created_at) <= $${params.length}`);
  }

  if (filters.productionLine) {
    params.push(filters.productionLine);
    conditions.push(`t.production_line = $${params.length}`);
  }

  if (filters.dueFrom) {
    params.push(filters.dueFrom);
    conditions.push(`t.due_date >= $${params.length}`);
  }

  if (filters.dueTo) {
    params.push(filters.dueTo);
    conditions.push(`t.due_date <= $${params.length}`);
  }

  return conditions;
}

function buildInsertColumns(task) {
  const columns = ['workspace_id', 'created_by', 'status', 'board_position'];
  const values = [task.workspaceId, task.createdBy, task.status, task.boardPosition];

  for (const [key, column] of Object.entries(createFieldMap)) {
    if (Object.prototype.hasOwnProperty.call(task, key)) {
      columns.push(column);
      values.push(task[key] ?? null);
    }
  }

  return { columns, values };
}

function normalizeFieldValue(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

const TaskModel = {
  STATUSES: TASK_BOARD_STATUSES,

  async getAll(filters = {}) {
    const params = [];
    const conditions = appendFilters(filters, params);
    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `
      ${taskBaseSelect}
      ${where}
      ORDER BY ${statusOrderSql}, ${priorityOrderSql}, t.board_position ASC, t.id ASC
      `,
      params
    );

    return result.rows;
  },

  async getById(id) {
    const result = await pool.query(
      `
      ${taskBaseSelect}
      WHERE t.id = $1
      LIMIT 1
      `,
      [id]
    );

    return result.rows[0] || null;
  },

  async create(data) {
    const created = await this.createMany({
      tasks: [data],
      createdBy: data.createdBy,
      workspaceId: data.workspaceId,
      status: data.status,
    });

    return created[0];
  },

  async createMany({ tasks, createdBy, workspaceId, status = 'TODO' }) {
    if (!Array.isArray(tasks) || tasks.length === 0) {
      throw new Error('At least one task is required');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const nextPositionResult = await client.query(
        `SELECT COALESCE(MAX(board_position), -1) + 1 AS next_pos
         FROM tasks
         WHERE workspace_id = $1 AND status = $2`,
        [workspaceId, status]
      );

      let nextPosition = Number(nextPositionResult.rows[0].next_pos || 0);
      const createdTasks = [];

      for (const task of tasks) {
        const { columns, values } = buildInsertColumns({
          ...task,
          createdBy,
          workspaceId,
          status,
          boardPosition: nextPosition,
        });

        const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
        const result = await client.query(
          `INSERT INTO tasks (${columns.join(', ')})
           VALUES (${placeholders})
           RETURNING id`,
          values
        );

        const createdTask = await this.getByIdWithClient(result.rows[0].id, client);
        createdTasks.push(createdTask);
        nextPosition += 1;
      }

      await client.query('COMMIT');
      return createdTasks;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async getByIdWithClient(id, client) {
    const result = await client.query(
      `
      ${taskBaseSelect}
      WHERE t.id = $1
      LIMIT 1
      `,
      [id]
    );

    return result.rows[0] || null;
  },

  async update(id, data) {
    const entries = Object.entries(updateFieldMap).filter(([key]) => Object.prototype.hasOwnProperty.call(data, key));

    if (entries.length === 0) {
      return this.getById(id);
    }

    const values = [];
    const sets = [];

    for (const [key, column] of entries) {
      values.push(data[key] ?? null);
      sets.push(`${column} = $${values.length}`);
    }

    values.push(id);

    const result = await pool.query(
      `UPDATE tasks
       SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING id`,
      values
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.getById(id);
  },

  async reorderBoard(columnOrders, workspaceId) {
    const flattenedIds = TASK_BOARD_STATUSES.flatMap((status) => columnOrders[status] || []);
    const uniqueIds = new Set();

    for (const rawId of flattenedIds) {
      const numericId = Number(rawId);
      if (!Number.isInteger(numericId) || numericId < 1) {
        throw new Error('Invalid task id in board order');
      }
      if (uniqueIds.has(numericId)) {
        throw new Error('Duplicate task id in board order');
      }
      uniqueIds.add(numericId);
    }

    const currentTasks = await this.getAll({ workspaceId });
    if (flattenedIds.length !== currentTasks.length) {
      throw new Error('Board order must list each task exactly once');
    }

    const allowedIds = new Set(currentTasks.map((task) => task.id));
    const currentStatusById = new Map(currentTasks.map((task) => [task.id, task.status]));
    for (const taskId of uniqueIds) {
      if (!allowedIds.has(taskId)) {
        throw new Error('Unknown task id in board order');
      }
    }

    for (const status of TASK_BOARD_STATUSES) {
      const taskIds = columnOrders[status] || [];
      for (const rawId of taskIds) {
        const taskId = Number(rawId);
        const currentStatus = currentStatusById.get(taskId);
        const changedStatus = currentStatus && currentStatus !== status;
        if (changedStatus && (currentStatus === 'WAITING_STOCK' || status === 'WAITING_STOCK')) {
          throw new Error('WAITING_STOCK status can only be changed by system auto promotion');
        }
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const status of TASK_BOARD_STATUSES) {
        const taskIds = columnOrders[status] || [];
        for (let index = 0; index < taskIds.length; index += 1) {
          const taskId = Number(taskIds[index]);
          await client.query(
            `UPDATE tasks
             SET status = $1,
                 board_position = $2,
                 blocked_reason = CASE WHEN $5 = 'BLOCKED' THEN blocked_reason ELSE NULL END,
                 blocked_at = CASE WHEN $5 = 'BLOCKED' THEN COALESCE(blocked_at, NOW()) ELSE NULL END,
                 blocked_by = CASE WHEN $5 = 'BLOCKED' THEN blocked_by ELSE NULL END,
                 completed_at = CASE WHEN $5 = 'DONE' THEN COALESCE(completed_at, NOW()) ELSE NULL END,
                 updated_at = NOW()
             WHERE id = $3 AND workspace_id = $4`,
            [status, index, taskId, workspaceId, status]
          );
        }
      }

      await client.query('COMMIT');
      return this.getAll({ workspaceId });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async updateStatus(id, status, reasonBlocked = null, userId, userRole, options = {}) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const currentResult = await client.query(
        `SELECT * FROM tasks WHERE id = $1 FOR UPDATE`,
        [id]
      );
      const currentTask = currentResult.rows[0];

      if (!currentTask) {
        await client.query('ROLLBACK');
        return null;
      }

      const isPrivileged = userRole === 'planner';
      if (!isPrivileged && currentTask.assigned_to !== userId) {
        await client.query('ROLLBACK');
        throw new Error('Not authorized to update this task');
      }

      if (currentTask.status === status) {
        await client.query('COMMIT');
        return this.getById(id);
      }

      const changingWaitingStock =
        currentTask.status === 'WAITING_STOCK' || status === 'WAITING_STOCK';
      if (changingWaitingStock && !options.systemAutoPromotion) {
        await client.query('ROLLBACK');
        throw new Error('WAITING_STOCK status can only be changed by system auto promotion');
      }

      await client.query(
        `UPDATE tasks
         SET board_position = board_position - 1
         WHERE workspace_id = $1
           AND status = $2
           AND board_position > $3`,
        [currentTask.workspace_id, currentTask.status, currentTask.board_position ?? 0]
      );

      const nextPositionResult = await client.query(
        `SELECT COALESCE(MAX(board_position), -1) + 1 AS next_pos
         FROM tasks
         WHERE workspace_id = $1 AND status = $2`,
        [currentTask.workspace_id, status]
      );

      const nextPosition = Number(nextPositionResult.rows[0].next_pos || 0);
      const blockedReason = status === 'BLOCKED' ? reasonBlocked || currentTask.blocked_reason : null;
      const blockedAt = status === 'BLOCKED' ? currentTask.blocked_at || new Date() : null;
      const blockedBy = status === 'BLOCKED' ? userId : null;
      const completedAt = status === 'DONE' ? currentTask.completed_at || new Date() : null;

      await client.query(
        `UPDATE tasks
         SET status = $1,
             board_position = $2,
             blocked_reason = $3,
             blocked_at = $4,
             blocked_by = $5,
             completed_at = $6,
             updated_at = NOW()
         WHERE id = $7`,
        [status, nextPosition, blockedReason, blockedAt, blockedBy, completedAt, id]
      );

      await client.query('COMMIT');
      return this.getById(id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async delete(id) {
    const result = await pool.query('DELETE FROM tasks WHERE id = $1 RETURNING *', [id]);
    return result.rows[0] || null;
  },

  async getDashboardStats(filters = {}) {
    const params = [];
    const conditions = appendFilters(filters, params);
    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

    const countsResult = await pool.query(
      `
      SELECT
        COUNT(*) AS total_tasks,
        COUNT(*) FILTER (WHERE status = 'TODO') AS total_todo,
        COUNT(*) FILTER (WHERE status = 'WAITING_STOCK') AS total_waiting_stock,
        COUNT(*) FILTER (WHERE status = 'IN_PROGRESS') AS total_in_progress,
        COUNT(*) FILTER (WHERE status = 'DONE') AS total_done,
        COUNT(*) FILTER (WHERE status = 'BLOCKED') AS total_blocked,
        COUNT(*) FILTER (WHERE due_date = CURRENT_DATE) AS due_today,
        COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status <> 'DONE') AS overdue,
        COUNT(*) FILTER (WHERE due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days') AS due_this_week,
        COUNT(*) FILTER (WHERE completed_at::date = CURRENT_DATE) AS completed_today
      FROM tasks t
      ${where}
      `,
      params
    );

    const upcomingDueResult = await pool.query(
      `
      ${taskBaseSelect}
      ${where}${where ? ' AND' : ' WHERE'} t.due_date IS NOT NULL
      ORDER BY t.due_date ASC, ${priorityOrderSql}, t.id ASC
      LIMIT 5
      `,
      params
    );

    const blockedResult = await pool.query(
      `
      ${taskBaseSelect}
      ${where}${where ? ' AND' : ' WHERE'} t.status = 'BLOCKED'
      ORDER BY t.blocked_at DESC NULLS LAST, t.updated_at DESC
      LIMIT 5
      `,
      params
    );

    const lineLoadResult = await pool.query(
      `
      SELECT
        COALESCE(NULLIF(t.production_line, ''), 'Non assignee') AS production_line,
        COUNT(*) AS task_count
      FROM tasks t
      ${where}${where ? ' AND' : ' WHERE'} t.status IN ('TODO', 'WAITING_STOCK', 'IN_PROGRESS', 'BLOCKED')
      GROUP BY COALESCE(NULLIF(t.production_line, ''), 'Non assignee')
      ORDER BY COUNT(*) DESC, production_line ASC
      LIMIT 8
      `,
      params
    );

    return {
      counts: countsResult.rows[0],
      upcomingDue: upcomingDueResult.rows,
      blockedTasks: blockedResult.rows,
      lineLoad: lineLoadResult.rows,
    };
  },
};

module.exports = TaskModel;
