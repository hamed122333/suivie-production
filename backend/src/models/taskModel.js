const pool = require('../config/db');

const TaskModel = {
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

    query += ' ORDER BY t.created_at DESC';

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
    const result = await pool.query(
      `INSERT INTO tasks (title, description, assigned_to, priority, created_by, status)
       VALUES ($1, $2, $3, $4, $5, 'TODO')
       RETURNING *`,
      [title, description, assignedTo, priority || 'MEDIUM', createdBy]
    );
    return result.rows[0];
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
         reason_blocked = $6,
         updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [title, description, assignedTo, priority, status, reasonBlocked || null, id]
    );
    return result.rows[0];
  },

  async updateStatus(id, status, reasonBlocked = null, userId, userRole) {
    const task = await this.getById(id);
    if (!task) return null;

    if (userRole !== 'admin' && task.assigned_to !== userId) {
      throw new Error('Not authorized to update this task');
    }

    const result = await pool.query(
      `UPDATE tasks SET status = $1, reason_blocked = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [status, reasonBlocked, id]
    );
    return result.rows[0];
  },

  async delete(id) {
    const result = await pool.query('DELETE FROM tasks WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  },

  async getDashboardStats() {
    const today = new Date().toISOString().split('T')[0];
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE DATE(created_at) = $1) as today_total,
        COUNT(*) FILTER (WHERE status = 'DONE') as total_done,
        COUNT(*) FILTER (WHERE status = 'IN_PROGRESS') as total_in_progress,
        COUNT(*) FILTER (WHERE status = 'BLOCKED') as total_blocked,
        COUNT(*) FILTER (WHERE status = 'TODO') as total_todo,
        COUNT(*) as grand_total
      FROM tasks
    `, [today]);
    return result.rows[0];
  }
};

module.exports = TaskModel;
