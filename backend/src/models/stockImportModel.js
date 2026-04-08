const pool = require('../config/db');

const StockImportModel = {
  async createMany(records) {
    if (!records || records.length === 0) return [];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const created = [];

      for (const record of records) {
        const result = await client.query(
          `INSERT INTO stock_import (article, quantity, ready_date)
           VALUES ($1, $2, $3)
           RETURNING *`,
          [record.article, record.quantity, record.readyDate]
        );
        created.push(result.rows[0]);
      }

      await client.query('COMMIT');
      return created;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async getAll() {
    const result = await pool.query(
      `SELECT
         *,
         (ready_date <= CURRENT_DATE) AS is_ready
       FROM stock_import
       ORDER BY ready_date ASC, id ASC`
    );
    return result.rows;
  },

  async markAsUsed(id) {
    const result = await pool.query(
      `UPDATE stock_import SET is_used = TRUE WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  },

  async markManyAsUsed(ids) {
    if (!ids || ids.length === 0) return;
    const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ');
    await pool.query(
      `UPDATE stock_import SET is_used = TRUE WHERE id IN (${placeholders})`,
      ids
    );
  },
};

module.exports = StockImportModel;
