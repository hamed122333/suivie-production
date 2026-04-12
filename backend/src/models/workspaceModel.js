const pool = require('../config/db');

const VALID_TYPES = ['STANDARD', 'PLANNED', 'URGENT'];

const WorkspaceModel = {
  async findByName(name) {
    const result = await pool.query(
      `SELECT id, name, workspace_type, planned_date, created_at
       FROM workspaces
       WHERE name = $1
       LIMIT 1`,
      [name]
    );
    return result.rows[0] || null;
  },

  async getAll() {
    const result = await pool.query(
      `SELECT id, name, workspace_type, planned_date, created_at
       FROM workspaces
       ORDER BY created_at DESC, id DESC`
    );
    return result.rows;
  },

  async create({ name, workspace_type = 'STANDARD', planned_date = null }) {
    const result = await pool.query(
      `INSERT INTO workspaces (name, workspace_type, planned_date)
       VALUES ($1, $2, $3)
       RETURNING id, name, workspace_type, planned_date, created_at`,
      [name, workspace_type, planned_date]
    );
    return result.rows[0];
  },

  VALID_TYPES,
};

module.exports = WorkspaceModel;

