const pool = require('../config/db');

let broadcast;
try {
  broadcast = require('../services/sseService').broadcast;
} catch (e) {
  broadcast = () => {};
}

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
       ORDER BY
         CASE
           WHEN name ~ '^CMD [0-9]{2}-[0-9]{2}-[0-9]{4}$'
             THEN TO_DATE(SUBSTRING(name FROM 5), 'DD-MM-YYYY')
           WHEN name ~ '^Commandes [0-9]{4}-[0-9]{2}-[0-9]{2}$'
             THEN TO_DATE(SUBSTRING(name FROM 11), 'YYYY-MM-DD')
           ELSE NULL
         END DESC NULLS LAST,
         created_at DESC,
         id DESC`
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
    broadcast('workspaces-updated', { action: 'created', name });
    return result.rows[0];
  },

  async findOrCreateByName(name) {
    const trimmed = `${name || ''}`.trim();
    if (!trimmed) throw new Error('Workspace name is required');
    const existing = await this.findByName(trimmed);
    if (existing) return existing;
    const created = await this.create({ name: trimmed });
    broadcast('workspaces-updated', { action: 'created', name: trimmed });
    return created;
  },
};

module.exports = WorkspaceModel;

