const pool = require('../config/db');

const STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'];

const statusOrderSql = `
  CASE t.status
    WHEN 'TODO' THEN 1
    WHEN 'IN_PROGRESS' THEN 2
    WHEN 'DONE' THEN 3
    WHEN 'BLOCKED' THEN 4
    ELSE 5
  END`;

const TaskModel = {
  STATUSES,

  async getAll(filters = {}) {
    let query = `
      SELECT t.*, 
             u1.name as assigned_to_name, 
             u2.name as created_by_name
      FROM tasks t
      LEFT JOIN users u1 ON t.assigned_to = u1.id
      LEFT JOIN users u2 ON t.created_by = u2.id
    `;
    const params = [];
    const conditions = [];

    if (filters.assignedTo) {
      conditions.push(`t.assigned_to = $${params.length + 1}`);
      params.push(filters.assignedTo);
    }

    if (filters.status) {
      conditions.push(`t.status = $${params.length + 1}`);
      params.push(filters.status);
    }

    if (filters.date) {
      conditions.push(`DATE(t.created_at) = $${params.length + 1}`);
      params.push(filters.date);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ` ORDER BY ${statusOrderSql}, t.board_position ASC, t.id ASC`;

    const result = await pool.query(query, params);
    return result.rows;
  },

  async getById(id) {
    const result = await pool.query(
      `SELECT t.*, u1.name as assigned_to_name, u2.name as created_by_name
       FROM tasks t
       LEFT JOIN users u1 ON t.assigned_to = u1.id
       LEFT JOIN users u2 ON t.created_by = u2.id
       WHERE t.id = $1`,
      [id]
    );
    return result.rows[0];
  },

  async create(data) {
    const { title, description, assignedTo, priority, createdBy } = data;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const maxRes = await client.query(
        `SELECT COALESCE(MAX(board_position), -1) + 1 AS next_pos FROM tasks WHERE status = 'TODO'`
      );
      const nextPos = maxRes.rows[0].next_pos;
      const result = await client.query(
        `INSERT INTO tasks (title, description, assigned_to, priority, created_by, status, board_position)
         VALUES ($1, $2, $3, $4, $5, 'TODO', $6)
         RETURNING *`,
        [title, description, assignedTo, priority || 'MEDIUM', createdBy, nextPos]
      );
      await client.query('COMMIT');
      return result.rows[0];
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async update(id, data) {
    const { title, description, assignedTo, priority, status, reasonBlocked } = data;
    const result = await pool.query(
      `UPDATE tasks SET 
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         assigned_to = COALESCE($3, assigned_to),
         priority = COALESCE($4, priority),
         status = COALESCE($5, status),
         blocked_reason = $6,
         updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [title, description, assignedTo, priority, status, reasonBlocked || null, id]
    );
    return result.rows[0];
  },

  async reorderBoard(columnOrders) {
    const flat = STATUSES.flatMap((s) => columnOrders[s] || []);
    const seen = new Set();
    for (const raw of flat) {
      const id = Number(raw);
      if (!Number.isInteger(id) || id < 1) {
        throw new Error('Invalid task id in board order');
      }
      if (seen.has(id)) throw new Error('Duplicate task id in board order');
      seen.add(id);
    }

    const allTasks = await this.getAll({});
    if (flat.length !== allTasks.length || flat.length !== seen.size) {
      throw new Error('Board order must list each task exactly once');
    }
    const allowed = new Set(allTasks.map((t) => t.id));
    for (const id of seen) {
      if (!allowed.has(id)) throw new Error('Unknown task id in board order');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const status of STATUSES) {
        const ids = columnOrders[status] || [];
        for (let i = 0; i < ids.length; i++) {
          const taskId = Number(ids[i]);
          await client.query(
            `UPDATE tasks SET
               status = $1,
               board_position = $2,
               blocked_reason = CASE WHEN $1::text = 'BLOCKED' THEN blocked_reason ELSE NULL END,
               updated_at = NOW()
             WHERE id = $3`,
            [status, i, taskId]
          );
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async updateStatus(id, status, reasonBlocked = null, userId, userRole) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const lock = await client.query(
        `SELECT * FROM tasks WHERE id = $1 FOR UPDATE`,
        [id]
      );
      const task = lock.rows[0];
      if (!task) {
        await client.query('ROLLBACK');
        return null;
      }

      if (userRole !== 'admin' && task.assigned_to !== userId) {
        await client.query('ROLLBACK');
        throw new Error('Not authorized to update this task');
      }

      const oldStatus = task.status;
      const oldPos = task.board_position ?? 0;

      if (oldStatus === status) {
        await client.query('COMMIT');
        return await this.getById(id);
      }

      await client.query(
        `UPDATE tasks SET board_position = board_position - 1
         WHERE status = $1 AND board_position > $2`,
        [oldStatus, oldPos]
      );

      const maxRes = await client.query(
        `SELECT COALESCE(MAX(board_position), -1) + 1 AS next_pos FROM tasks WHERE status = $1`,
        [status]
      );
      const nextPos = maxRes.rows[0].next_pos;

      const blocked =
        status === 'BLOCKED'
          ? reasonBlocked != null
            ? reasonBlocked
            : task.blocked_reason
          : null;

      await client.query(
        `UPDATE tasks SET
           status = $1,
           board_position = $2,
           blocked_reason = $3,
           updated_at = NOW()
         WHERE id = $4`,
        [status, nextPos, blocked, id]
      );

      await client.query('COMMIT');
      return await this.getById(id);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async delete(id) {
    const result = await pool.query('DELETE FROM tasks WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  },

  async getDashboardStats() {
    const today = new Date().toISOString().split('T')[0];
    const result = await pool.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE DATE(created_at) = $1) as today_total,
        COUNT(*) FILTER (WHERE status = 'DONE') as total_done,
        COUNT(*) FILTER (WHERE status = 'IN_PROGRESS') as total_in_progress,
        COUNT(*) FILTER (WHERE status = 'BLOCKED') as total_blocked,
        COUNT(*) FILTER (WHERE status = 'TODO') as total_todo,
        COUNT(*) as grand_total
      FROM tasks
    `,
      [today]
    );
    return result.rows[0];
  }
};

module.exports = TaskModel;
