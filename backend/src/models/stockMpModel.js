const pool = require('../config/db');
const { isValidArticleCode, normalizeArticleCode } = require('../utils/articleCode');

const StockMpModel = {
  async findById(id) {
    const result = await pool.query(
      `SELECT * FROM stock_mp WHERE id = $1 LIMIT 1`,
      [id]
    );
    return result.rows[0] || null;
  },

  async findByArticle(article) {
    const normalizedArticle = normalizeArticleCode(article);
    if (!normalizedArticle) return null;
    if (!isValidArticleCode(normalizedArticle)) return null;
    const result = await pool.query(
      `SELECT article, MAX(designation) as designation, MAX(client_name) as client_name, MAX(client_code) as client_code, SUM(quantity) as quantity
       FROM stock_mp
       WHERE UPPER(article) = UPPER($1)
       GROUP BY article`,
      [normalizedArticle]
    );
    return result.rows[0] || null;
  },

  async upsertManual({ article, quantity, designation = null, clientCode = null, clientName = null, readyDate, entryDate = null, batchNumber = null }) {
    const normalizedArticle = normalizeArticleCode(article);
    const normalizedQty = Number(quantity || 0);
    if (!normalizedArticle || !isValidArticleCode(normalizedArticle) || !Number.isFinite(normalizedQty) || normalizedQty <= 0) {
      throw new Error('Invalid manual stock MP payload');
    }

    // New logic: We don't just update the first found row, we create a new entry for different entry dates or batches
    const finalEntryDate = entryDate || new Date().toISOString().split('T')[0];

    // For manual entry, if the same article and same date, we might update or create new.
    // To keep it "intelligent", let's create a new record for each import/manual entry to track by date.
    const inserted = await pool.query(
      `INSERT INTO stock_mp (article, quantity, initial_quantity, entry_date, ready_date, designation, client_code, client_name, batch_number)
       VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [normalizedArticle, normalizedQty, finalEntryDate, readyDate, designation, clientCode, clientName, batchNumber]
    );
    return { row: inserted.rows[0], action: 'new_entry_created' };
  },

  async findAvailableForTask({ stockMpId, itemReference, requiredQuantity }) {
    const qty = Number(requiredQuantity || 0);
    if (!Number.isFinite(qty) || qty <= 0) {
      return null;
    }

    if (stockMpId) {
      const result = await pool.query(
        `SELECT id, article, quantity
         FROM stock_mp
         WHERE id = $1
         LIMIT 1`,
        [stockMpId]
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        stockMpId: row.id,
        article: row.article,
        quantity: Number(row.quantity || 0),
        available: Number(row.quantity || 0) >= qty,
      };
    }

    if (!itemReference) return null;
    const normalizedReference = normalizeArticleCode(itemReference);
    if (!isValidArticleCode(normalizedReference)) return null;

    // Modification: check the sum of all available batches
    const result = await pool.query(
      `SELECT SUM(quantity) as total_quantity
       FROM stock_mp
       WHERE UPPER(article) = UPPER($1) AND is_used = FALSE`,
      [normalizedReference]
    );

    const totalQty = Number(result.rows[0]?.total_quantity || 0);

    // Also get the first available batch for ID tracking if needed
    const firstBatchResult = await pool.query(
      `SELECT id, article, quantity
       FROM stock_mp
       WHERE UPPER(article) = UPPER($1) AND is_used = FALSE AND quantity > 0
       ORDER BY entry_date ASC, id ASC
       LIMIT 1`,
      [normalizedReference]
    );

    const firstBatch = firstBatchResult.rows[0];
    if (!firstBatch && totalQty <= 0) return null;

    return {
      stockMpId: firstBatch?.id || null,
      article: normalizedReference,
      quantity: totalQty,
      available: totalQty >= qty,
    };
  },

  async getStockQuantity(itemReference) {
    if (!itemReference) return 0;
    const result = await pool.query(
      `SELECT SUM(quantity) AS quantity
       FROM stock_mp
       WHERE UPPER(article) = UPPER($1) AND is_used = FALSE`,
      [itemReference]
    );
    return Number(result.rows[0]?.quantity || 0);
  },

  async hasAvailableQuantity({ stockMpId, itemReference, requiredQuantity }) {
    const match = await this.findAvailableForTask({ stockMpId, itemReference, requiredQuantity });
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

        // Always create a new entry for imports to track stock coming in at different times
        const result = await client.query(
          `INSERT INTO stock_mp (article, quantity, initial_quantity, entry_date, ready_date, designation, client_code, client_name, batch_number)
           VALUES ($1, $2, $2, COALESCE($3, CURRENT_DATE), $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            normalizedArticle,
            record.quantity,
            record.entryDate || null,
            record.readyDate,
            record.designation,
            record.clientCode,
            record.clientName,
            record.batchNumber || null
          ]
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
         *
       FROM stock_mp
       ORDER BY entry_date DESC, id DESC`
    );

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    return result.rows.map(row => {
      const rDate = row.ready_date instanceof Date
        ? row.ready_date.toISOString().split('T')[0]
        : row.ready_date ? String(row.ready_date).slice(0, 10) : null;

      const eDate = row.entry_date instanceof Date
        ? row.entry_date.toISOString().split('T')[0]
        : row.entry_date ? String(row.entry_date).slice(0, 10) : null;

      return {
        ...row,
        ready_date: rDate,
        entry_date: eDate,
        is_ready: rDate ? rDate <= today : true
      };
    });
  },

  async markAsUsed(id) {
    const result = await pool.query(
      `UPDATE stock_mp SET quantity = 0, used_quantity = initial_quantity, is_used = TRUE WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  },

  async markManyAsUsed(ids) {
    if (!ids || ids.length === 0) return;
    const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ');
    await pool.query(
      `UPDATE stock_mp SET is_used = TRUE WHERE id IN (${placeholders})`,
      ids
    );
  },

  async deductQuantity(id, quantityToDeduct) {
    const result = await pool.query(
      `UPDATE stock_mp
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

    // FIFO Logic for deduction
    const batches = await pool.query(
      `SELECT id, quantity, used_quantity 
       FROM stock_mp 
       WHERE UPPER(article) = UPPER($1) AND is_used = FALSE AND quantity > 0
       ORDER BY entry_date ASC, id ASC`,
      [normalizedArticle]
    );

    let remainingToDeduct = quantityToDeduct;
    let lastUpdatedRow = null;

    for (const batch of batches.rows) {
      if (remainingToDeduct <= 0) break;

      const deductFromThisBatch = Math.min(batch.quantity, remainingToDeduct);
      const newQuantity = batch.quantity - deductFromThisBatch;
      const newUsedQuantity = Number(batch.used_quantity || 0) + deductFromThisBatch;

      const result = await pool.query(
        `UPDATE stock_mp
         SET quantity = $2,
             used_quantity = $3,
             is_used = CASE WHEN $2 <= 0 THEN TRUE ELSE is_used END
         WHERE id = $1
         RETURNING *`,
        [batch.id, newQuantity, newUsedQuantity]
      );

      remainingToDeduct -= deductFromThisBatch;
      lastUpdatedRow = result.rows[0];
    }

    return lastUpdatedRow;
  },

  async addQuantity(id, quantityToAdd) {
    const result = await pool.query(
      `UPDATE stock_mp
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
      `UPDATE stock_mp
       SET quantity = quantity + $2,
           is_used = FALSE
       WHERE id = (
         SELECT id
         FROM stock_mp
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

module.exports = StockMpModel;
