const pool = require('./db');
const fs = require('fs');
const path = require('path');

async function initDb() {
  try {
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    
    console.log('Running schema migration...');
    await pool.query(schemaSql);
    console.log('Database initialized successfully.');
    
    process.exit(0);
  } catch (err) {
    console.error('Error initializing database:', err.message);
    console.error('Ensure PostgreSQL is running and the database "suivi_production" exists (or update .env).');
    process.exit(1);
  }
}

initDb();

