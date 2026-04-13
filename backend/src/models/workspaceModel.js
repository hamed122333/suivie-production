const pool = require('../config/db');

const COMMERCIAL_MONTHLY_NAME_SQL_REGEX = '^Commercial [0-9]{4}-[0-9]{2}$';
const COMMERCIAL_MONTHLY_NAME_PATTERN = new RegExp(COMMERCIAL_MONTHLY_NAME_SQL_REGEX);

function getCommercialMonthlyWorkspaceName(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `Commercial ${year}-${month}`;
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
       ORDER BY created_at DESC, id DESC`
    );
    return result.rows;
  },

  async getCommercialMonthlyWorkspaces() {
    const result = await pool.query(
      `SELECT id, name, created_at
       FROM workspaces
       WHERE name ~ '${COMMERCIAL_MONTHLY_NAME_SQL_REGEX}'
       ORDER BY name DESC`
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

  async ensureCommercialMonthlyWorkspace(date = new Date()) {
    const monthlyName = getCommercialMonthlyWorkspaceName(date);
    const existing = await this.findByName(monthlyName);
    if (existing) return existing;
    return this.create({ name: monthlyName });
  },

  isCommercialMonthlyWorkspaceName(name) {
    return COMMERCIAL_MONTHLY_NAME_PATTERN.test((name || '').trim());
  },

  getCommercialMonthlyWorkspaceName,
};

module.exports = WorkspaceModel;
