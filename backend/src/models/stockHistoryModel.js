const pool = require('../config/db');
const { normalizeArticleCode } = require('../utils/articleCode');

const StockHistoryModel = {
  async create({ article, quantityAdded, quantityBefore, quantityAfter, source = 'manual', sourceDetail = null, createdBy = null }) {
    const normalizedArticle = normalizeArticleCode(article);
    const result = await pool.query(
      `INSERT INTO stock_history (article, quantity_added, quantity_before, quantity_after, source, source_detail, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [normalizedArticle, quantityAdded, quantityBefore, quantityAfter, source, sourceDetail, createdBy]
    );
    return result.rows[0];
  },

  async getByArticle(article, limit = 50) {
    const normalizedArticle = normalizeArticleCode(article);
    const result = await pool.query(
      `SELECT 
        sh.*,
        u.name as created_by_name
       FROM stock_history sh
       LEFT JOIN users u ON u.id = sh.created_by
       WHERE UPPER(sh.article) = UPPER($1)
       ORDER BY sh.created_at DESC
       LIMIT $2`,
      [normalizedArticle, limit]
    );
    return result.rows;
  },

  async getAll(limit = 100, offset = 0) {
    const result = await pool.query(
      `SELECT 
        sh.*,
        u.name as created_by_name
       FROM stock_history sh
       LEFT JOIN users u ON u.id = sh.created_by
       ORDER BY sh.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  },

  async getStatsByArticle(article) {
    const normalizedArticle = normalizeArticleCode(article);
    const result = await pool.query(
      `SELECT 
        COUNT(*) as total_additions,
        SUM(quantity_added) as total_added,
        MIN(created_at) as first_addition,
        MAX(created_at) as last_addition
       FROM stock_history
       WHERE UPPER(article) = UPPER($1)`,
      [normalizedArticle]
    );
    return result.rows[0] || null;
  },

  async getAllStats() {
    const result = await pool.query(
      `SELECT 
        article,
        COUNT(*) as total_additions,
        SUM(quantity_added) as total_added,
        MIN(created_at) as first_addition,
        MAX(created_at) as last_addition
       FROM stock_history
       GROUP BY article
       ORDER BY article ASC`
    );
    return result.rows;
  },

  async getRecentHistory(days = 30) {
    const result = await pool.query(
      `SELECT 
        sh.*,
        u.name as created_by_name,
        si.designation
       FROM stock_history sh
       LEFT JOIN users u ON u.id = sh.created_by
       LEFT JOIN stock_import si ON UPPER(si.article) = UPPER(sh.article)
       WHERE sh.created_at >= NOW() - INTERVAL '${days} days'
       ORDER BY sh.created_at DESC
       LIMIT 200`
    );
    return result.rows;
  },
};

module.exports = StockHistoryModel;