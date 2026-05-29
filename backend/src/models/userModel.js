const pool = require('../config/db');
const bcrypt = require('bcryptjs');

const UserModel = {
  async findByEmail(email) {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0];
  },

  async findById(id) {
    const result = await pool.query('SELECT id, name, email, role, commercial_id, created_at FROM users WHERE id = $1', [id]);
    return result.rows[0];
  },

  async findByCommercialId(commercialId) {
    if (!commercialId) return null;
    const result = await pool.query(
      'SELECT id, name, email, role, commercial_id FROM users WHERE commercial_id = $1 AND role = $2 LIMIT 1',
      [commercialId, 'commercial']
    );
    return result.rows[0] || null;
  },

  async getAll() {
    const result = await pool.query('SELECT id, name, email, role, commercial_id, created_at FROM users ORDER BY name');
    return result.rows;
  },

  async findByRoles(roles = []) {
    if (!Array.isArray(roles) || roles.length === 0) return [];
    const result = await pool.query(
      'SELECT id, name, email, role, commercial_id FROM users WHERE role = ANY($1::text[]) ORDER BY id ASC',
      [roles]
    );
    return result.rows;
  },

  async create(name, email, password, role = 'user', commercialId = null) {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password, role, commercial_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role, commercial_id, created_at',
      [name, email, hashedPassword, role, commercialId || null]
    );
    return result.rows[0];
  },

  async validatePassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  },

  async updatePassword(userId, newPassword) {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId]);
  },

  async delete(id) {
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      throw new Error('Utilisateur introuvable');
    }
    return result.rows[0];
  },

  // Find a user by (case-insensitive) name and role — used by Excel import to resolve commercial names
  async findByNameAndRole(nameLower, role) {
    const result = await pool.query(
      'SELECT id, name, role FROM users WHERE LOWER(name) = $1 AND role = $2 LIMIT 1',
      [nameLower, role]
    );
    return result.rows[0] || null;
  }
};

module.exports = UserModel;
