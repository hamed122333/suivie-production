const pool = require('../config/db');

const WorkspaceModel = {
  async findByName(name) {
    const result = await pool.query(
      `SELECT id, name, created_at
       FROM workspaces
       WHERE name = $1
       LIMIT 1`,
      [name]
    );
    return result.rows[0] || null;
  },

  async getAll() {
    const result = await pool.query(
      `SELECT id, name, created_at
       FROM workspaces
       ORDER BY created_at DESC, id DESC`
    );
    return result.rows;
  },

  async create({ name }) {
    const result = await pool.query(
      `INSERT INTO workspaces (name)
       VALUES ($1)
       RETURNING id, name, created_at`,
      [name]
    );
    return result.rows[0];
  },
};

module.exports = WorkspaceModel;

