const pool = require('../config/db');

const WorkspaceModel = {
  async findByName(name) {
    const result = await pool.query(
      `SELECT id, name, type, created_at
       FROM workspaces
       WHERE name = $1
       LIMIT 1`,
      [name]
    );
    return result.rows[0] || null;
  },

  async findById(id) {
    const result = await pool.query(
      `SELECT id, name, type, created_at
       FROM workspaces
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    return result.rows[0] || null;
  },

  async getAll() {
    const result = await pool.query(
      `SELECT id, name, type, created_at
       FROM workspaces
       ORDER BY created_at DESC, id DESC`
    );
    return result.rows;
  },

  async create({ name, type }) {
    const result = await pool.query(
      `INSERT INTO workspaces (name, type)
       VALUES ($1, $2)
       RETURNING id, name, type, created_at`,
      [name, type]
    );
    return result.rows[0];
  },
};

module.exports = WorkspaceModel;
