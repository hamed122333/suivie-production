const db = require('../config/database');

const scanInventoryModel = {
    async create({ imageUrl, codes, createdBy }) {
        const query = `
            INSERT INTO scan_inventory (image_url, codes, total_codes, created_by)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;
        const result = await db.query(query, [
            imageUrl,
            JSON.stringify(codes),
            codes.length,
            createdBy || null
        ]);
        return result.rows[0];
    },

    async getAll(limit = 50, offset = 0) {
        const query = `
            SELECT si.*, u.name as created_by_name
            FROM scan_inventory si
            LEFT JOIN users u ON si.created_by = u.id
            ORDER BY si.scanned_at DESC
            LIMIT $1 OFFSET $2
        `;
        const result = await db.query(query, [limit, offset]);
        return result.rows;
    },

    async getById(id) {
        const query = `
            SELECT si.*, u.name as created_by_name
            FROM scan_inventory si
            LEFT JOIN users u ON si.created_by = u.id
            WHERE si.id = $1
        `;
        const result = await db.query(query, [id]);
        return result.rows[0];
    },

    async delete(id) {
        const query = 'DELETE FROM scan_inventory WHERE id = $1 RETURNING *';
        const result = await db.query(query, [id]);
        return result.rows[0];
    },

    async getStats() {
        const query = `
            SELECT 
                COUNT(*) as total_scans,
                SUM(total_codes) as total_codes_detected,
                COUNT(DISTINCT scanned_at::date) as scan_days
            FROM scan_inventory
        `;
        const result = await db.query(query);
        return result.rows[0];
    },

    async getAllForExport() {
        const query = `
            SELECT id, image_url, codes, scanned_at
            FROM scan_inventory
            ORDER BY scanned_at DESC
        `;
        const result = await db.query(query);
        return result.rows;
    }
};

module.exports = scanInventoryModel;