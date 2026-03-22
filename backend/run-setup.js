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
});

async function setup() {
  try {
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    console.log('Running schema migration...');
    await pool.query(schemaSql);
    console.log('Schema applied.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    if(err.code === '3D000') {
        console.error('Please create the database first: createdb suivi_production');
    }
    process.exit(1);
  }
}

setup();

