const pool = require('../config/db');
const { isValidArticleCode, normalizeArticleCode } = require('../utils/articleCode');

const StockImportModel = {
  async findByArticle(article) {
    const normalizedArticle = normalizeArticleCode(article);
    if (!normalizedArticle) return null;
    if (!isValidArticleCode(normalizedArticle)) return null;
    const result = await pool.query(
      `SELECT *
       FROM stock_import
       WHERE UPPER(article) = UPPER($1)
       ORDER BY id DESC
       LIMIT 1`,
      [normalizedArticle]
    );
    return result.rows[0] || null;
  },

  async upsertManual({ article, quantity, designation = null, clientCode = null, clientName = null, readyDate }) {
    const normalizedArticle = normalizeArticleCode(article);
    const normalizedQty = Number(quantity || 0);
    if (!normalizedArticle || !isValidArticleCode(normalizedArticle) || !Number.isFinite(normalizedQty) || normalizedQty <= 0) {
      throw new Error('Invalid manual stock payload');
    }

    const result = await pool.query(
      `SELECT id, quantity FROM stock_import WHERE UPPER(article) = UPPER($1) LIMIT 1`,
      [normalizedArticle]
    );

    if (result.rows.length > 0) {
      const current = result.rows[0];
      const updated = await pool.query(
        `UPDATE stock_import
         SET quantity = quantity + $2,
             ready_date = COALESCE($3::DATE, ready_date),
             is_used = FALSE,
             designation = COALESCE($4, designation),
             client_code = COALESCE($5, client_code),
             client_name = COALESCE($6, client_name)
         WHERE id = $1
         RETURNING *`,
        [current.id, normalizedQty, readyDate, designation, clientCode, clientName]
      );
      return { row: updated.rows[0], action: 'stock_added' };
    }

    const inserted = await pool.query(
      `INSERT INTO stock_import (article, quantity, ready_date, designation, client_code, client_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [normalizedArticle, normalizedQty, readyDate, designation, clientCode, clientName]
    );
    return { row: inserted.rows[0], action: 'new_product_created' };
  },

  async findAvailableForTask({ stockImportId, itemReference, requiredQuantity }) {
    const qty = Number(requiredQuantity || 0);
    if (!Number.isFinite(qty) || qty <= 0) {
      return null;
    }

    if (stockImportId) {
      const result = await pool.query(
        `SELECT id, article, quantity
         FROM stock_import
         WHERE id = $1
         LIMIT 1`,
        [stockImportId]
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        stockImportId: row.id,
        article: row.article,
        available: Number(row.quantity || 0) >= qty,
      };
    }

    if (!itemReference) return null;
    const normalizedReference = normalizeArticleCode(itemReference);
    if (!isValidArticleCode(normalizedReference)) return null;
    const result = await pool.query(
      `SELECT id, article, quantity
       FROM stock_import
       WHERE UPPER(article) = UPPER($1)
       ORDER BY id DESC
       LIMIT 1`,
      [normalizedReference]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      stockImportId: row.id,
      article: row.article,
      available: Number(row.quantity || 0) >= qty,
    };
  },

  async hasAvailableQuantity({ stockImportId, itemReference, requiredQuantity }) {
    const match = await this.findAvailableForTask({ stockImportId, itemReference, requiredQuantity });
    return Boolean(match && match.available);
  },

  async createMany(records) {
    if (!records || records.length === 0) return [];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const created = [];

      for (const record of records) {
        const normalizedArticle = normalizeArticleCode(record.article);
        if (!isValidArticleCode(normalizedArticle)) {
          continue;
        }
        // Look up if article exists to avoid duplicate entries. We use UPPER() for case insensitivity.
        const check = await client.query(
          `SELECT id, quantity FROM stock_import WHERE UPPER(article) = UPPER($1) LIMIT 1`,
          [normalizedArticle]
        );

        if (check.rows.length > 0) {
          const existingId = check.rows[0].id;
          const result = await client.query(
            `UPDATE stock_import 
             SET quantity = $2, 
                 ready_date = $3::DATE,
                 is_used = FALSE,
                 designation = COALESCE($4, designation),
                 client_code = COALESCE($5, client_code),
                 client_name = COALESCE($6, client_name)
             WHERE id = $1 RETURNING *`,
            [existingId, record.quantity, record.readyDate, record.designation, record.clientCode, record.clientName]
          );
          created.push(result.rows[0]);
        } else {
          const result = await client.query(
            `INSERT INTO stock_import (article, quantity, ready_date, designation, client_code, client_name)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [normalizedArticle, record.quantity, record.readyDate, record.designation, record.clientCode, record.clientName]
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

  async deductQuantityByArticle(article, quantityToDeduct) {
    const normalizedArticle = normalizeArticleCode(article);
    if (!normalizedArticle) return null;
    if (!isValidArticleCode(normalizedArticle)) return null;
    const result = await pool.query(
      `UPDATE stock_import
       SET quantity = GREATEST(quantity - $2, 0),
           is_used = CASE WHEN quantity - $2 <= 0 THEN TRUE ELSE is_used END
       WHERE id = (
         SELECT id
         FROM stock_import
         WHERE UPPER(article) = UPPER($1)
         ORDER BY id DESC
         LIMIT 1
       )
       RETURNING *`,
      [normalizedArticle, quantityToDeduct]
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

  async addQuantityByArticle(article, quantityToAdd) {
    const normalizedArticle = normalizeArticleCode(article);
    if (!normalizedArticle) return null;
    if (!isValidArticleCode(normalizedArticle)) return null;
    const result = await pool.query(
      `UPDATE stock_import
       SET quantity = quantity + $2,
           is_used = FALSE
       WHERE id = (
         SELECT id
         FROM stock_import
         WHERE UPPER(article) = UPPER($1)
         ORDER BY id DESC
         LIMIT 1
       )
       RETURNING *`,
      [normalizedArticle, quantityToAdd]
    );
    return result.rows[0] || null;
  },
};

module.exports = StockImportModel;
