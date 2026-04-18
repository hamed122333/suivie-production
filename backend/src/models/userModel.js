const pool = require('../config/db');
const bcrypt = require('bcryptjs');

const UserModel = {
  async findByEmail(email) {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0];
  },

  async findById(id) {
    const result = await pool.query('SELECT id, name, email, role, created_at FROM users WHERE id = $1', [id]);
    return result.rows[0];
  },

  async getAll() {
    const result = await pool.query('SELECT id, name, email, role, created_at FROM users ORDER BY name');
    return result.rows;
  },

  async findByRoles(roles = []) {
    if (!Array.isArray(roles) || roles.length === 0) return [];
    const result = await pool.query(
      'SELECT id, name, email, role FROM users WHERE role = ANY($1::text[]) ORDER BY id ASC',
      [roles]
    );
    return result.rows;
  },

  async create(name, email, password, role = 'user') {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at',
      [name, email, hashedPassword, role]
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
  }
};

module.exports = UserModel;
