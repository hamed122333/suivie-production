require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function runMigration() {
  try {
    const migrationNames = [
      '005_production_workflow_core.sql',
      '006_restore_simple_kanban_workflow.sql',
    ];

    for (const migrationName of migrationNames) {
      const migrationPath = path.join(__dirname, 'migrations', migrationName);
      const sql = fs.readFileSync(migrationPath, 'utf8');
      await pool.query(sql);
    }

    console.log('Production workflow migrations applied successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Production workflow migration failed:', error.message);
    process.exit(1);
  }
}

// Force TLS for schema setup if in production
if (process.env.NODE_ENV === 'production') {
  const tls = require('tls');
  tls.DEFAULT_MIN_VERSION = 'TLSv1.2';
}

runMigration();
