const pool = require('../config/db');

const articleCodeConfigModel = {
    async getAll() {
        const query = `
            SELECT * FROM article_code_config 
            ORDER BY priority ASC
        `;
        const result = await pool.query(query);
        return result.rows;
    },

    async getActive() {
        const query = `
            SELECT * FROM article_code_config 
            WHERE is_active = TRUE 
            ORDER BY priority ASC
        `;
        const result = await pool.query(query);
        return result.rows;
    },

    async getById(id) {
        const query = 'SELECT * FROM article_code_config WHERE id = $1';
        const result = await pool.query(query, [id]);
        return result.rows[0];
    },

    async create({ name, label, patternRegex, exampleCode, priority = 1 }) {
        const query = `
            INSERT INTO article_code_config (name, label, pattern_regex, example_code, priority)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;
        const result = await pool.query(query, [name, label, patternRegex, exampleCode, priority]);
        return result.rows[0];
    },

    async update(id, { name, label, patternRegex, exampleCode, priority, isActive }) {
        const query = `
            UPDATE article_code_config 
            SET name = COALESCE($2, name),
                label = COALESCE($3, label),
                pattern_regex = COALESCE($4, pattern_regex),
                example_code = COALESCE($5, example_code),
                priority = COALESCE($6, priority),
                is_active = COALESCE($7, is_active),
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `;
        const result = await pool.query(query, [id, name, label, patternRegex, exampleCode, priority, isActive]);
        return result.rows[0];
    },

    async delete(id) {
        const query = 'DELETE FROM article_code_config WHERE id = $1 RETURNING *';
        const result = await pool.query(query, [id]);
        return result.rows[0];
    },

    async toggleActive(id, isActive) {
        const query = `
            UPDATE article_code_config 
            SET is_active = $2, updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `;
        const result = await pool.query(query, [id, isActive]);
        return result.rows[0];
    }
};

module.exports = articleCodeConfigModel;