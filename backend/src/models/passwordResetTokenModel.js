const pool = require('../config/db');

const PasswordResetTokenModel = {
  async invalidateActiveTokens(userId) {
    await pool.query(
      `
      UPDATE password_reset_tokens
      SET used_at = NOW()
      WHERE user_id = $1
        AND used_at IS NULL
        AND expires_at > NOW()
      `,
      [userId]
    );
  },

  async create({ userId, tokenHash, expiresAt }) {
    await this.invalidateActiveTokens(userId);
    const result = await pool.query(
      `
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [userId, tokenHash, expiresAt]
    );
    return result.rows[0];
  },

  async findValidByHash(tokenHash) {
    const result = await pool.query(
      `
      SELECT *
      FROM password_reset_tokens
      WHERE token_hash = $1
        AND used_at IS NULL
        AND expires_at > NOW()
      LIMIT 1
      `,
      [tokenHash]
    );
    return result.rows[0] || null;
  },

  async markUsed(id) {
    await pool.query(
      `
      UPDATE password_reset_tokens
      SET used_at = NOW()
      WHERE id = $1
      `,
      [id]
    );
  },

  async invalidateAllForUser(userId) {
    await pool.query(
      `
      UPDATE password_reset_tokens
      SET used_at = NOW()
      WHERE user_id = $1
        AND used_at IS NULL
      `,
      [userId]
    );
  },
};

module.exports = PasswordResetTokenModel;
