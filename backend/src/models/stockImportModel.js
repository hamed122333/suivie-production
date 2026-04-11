const pool = require('../config/db');

const StockImportModel = {
  async createMany(records) {
    if (!records || records.length === 0) return [];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const created = [];

      for (const record of records) {
        // Look up if article exists to avoid duplicate entries. We use UPPER() for case insensitivity.
        const check = await client.query(
          `SELECT id, quantity FROM stock_import WHERE UPPER(article) = UPPER($1) LIMIT 1`,
          [record.article]
        );

        if (check.rows.length > 0) {
          const existingId = check.rows[0].id;
          const result = await client.query(
            `UPDATE stock_import 
             SET quantity = quantity + $2, 
                 ready_date = GREATEST(ready_date, $3::DATE),
                 is_used = FALSE
             WHERE id = $1 RETURNING *`,
            [existingId, record.quantity, record.readyDate]
          );
          created.push(result.rows[0]);
        } else {
          const result = await client.query(
            `INSERT INTO stock_import (article, quantity, ready_date)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [record.article, record.quantity, record.readyDate]
          );
          created.push(result.rows[0]);
        }
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
         *
       FROM stock_import
       ORDER BY ready_date ASC, id ASC`
    );
    
    // Evaluate is_ready in JS to avoid DB timezone issues
    const now = new Date();
    const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    return result.rows.map(row => {
      // row.ready_date might be a Date object or string
      const rDate = row.ready_date instanceof Date 
        ? row.ready_date.getFullYear() + '-' + String(row.ready_date.getMonth() + 1).padStart(2, '0') + '-' + String(row.ready_date.getDate()).padStart(2, '0')
        : String(row.ready_date).slice(0, 10);
      return {
        ...row,
        is_ready: rDate <= today
      };
    });
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

  async deductQuantity(id, quantityToDeduct) {
    const result = await pool.query(
      `UPDATE stock_import
       SET quantity = GREATEST(quantity - $2, 0),
           is_used = CASE WHEN quantity - $2 <= 0 THEN TRUE ELSE is_used END
       WHERE id = $1
       RETURNING *`,
      [id, quantityToDeduct]
    );
    return result.rows[0] || null;
  },

  async addQuantity(id, quantityToAdd) {
    const result = await pool.query(
      `UPDATE stock_import
       SET quantity = quantity + $2,
           is_used = FALSE
       WHERE id = $1
       RETURNING *`,
      [id, quantityToAdd]
    );
    return result.rows[0] || null;
  },
};

module.exports = StockImportModel;
