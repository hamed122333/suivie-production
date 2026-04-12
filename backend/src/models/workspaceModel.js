const pool = require('../config/db');

// STOCK       : linked to available finished products (xlsx import, ready)
// PREPARATION : products being prepared (xlsx import, not yet ready) — requires planned_date
// RUPTURE     : products not in stock / out of stock / shortage
const VALID_TYPES = ['STOCK', 'PREPARATION', 'RUPTURE'];

const WorkspaceModel = {
  async findByName(name) {
    const result = await pool.query(
      `SELECT w.id, w.name, w.workspace_type, w.planned_date, w.created_by, w.created_at
       FROM workspaces w
       WHERE w.name = $1
       LIMIT 1`,
      [name]
    );
    return result.rows[0] || null;
  },

  async getAll() {
    const result = await pool.query(
      `SELECT w.id, w.name, w.workspace_type, w.planned_date, w.created_by,
              u.name AS creator_name, w.created_at
       FROM workspaces w
       LEFT JOIN users u ON u.id = w.created_by
       ORDER BY w.created_at DESC, w.id DESC`
    );
    return result.rows;
  },

  async create({ name, workspace_type = 'STOCK', planned_date = null, created_by = null }) {
    const result = await pool.query(
      `INSERT INTO workspaces (name, workspace_type, planned_date, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, workspace_type, planned_date, created_by, created_at`,
      [name, workspace_type, planned_date, created_by]
    );
    return result.rows[0];
  },

  VALID_TYPES,
};

module.exports = WorkspaceModel;
