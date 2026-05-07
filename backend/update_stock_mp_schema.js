
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function updateTable() {
  try {
    console.log('Starting stock_mp table update...');
    await pool.query(`
      ALTER TABLE stock_mp ADD COLUMN IF NOT EXISTS batch_number VARCHAR(100);
      ALTER TABLE stock_mp ADD COLUMN IF NOT EXISTS initial_quantity NUMERIC(12,2);
      ALTER TABLE stock_mp ADD COLUMN IF NOT EXISTS used_quantity NUMERIC(12,2) DEFAULT 0;
      ALTER TABLE stock_mp ADD COLUMN IF NOT EXISTS entry_date DATE DEFAULT CURRENT_DATE;
      UPDATE stock_mp SET initial_quantity = quantity WHERE initial_quantity IS NULL;
    `);
    console.log('Successfully updated stock_mp table structure for batch tracking');
  } catch (err) {
    console.error('Error updating stock_mp table:', err);
  } finally {
    await pool.end();
  }
}

updateTable();

