require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./src/config/db');

async function run() {
  const sql = fs.readFileSync(path.join(__dirname, 'migrations', '001_add_board_position.sql'), 'utf8');
  console.log('Applying board_position migration...');
  await pool.query(sql);
  console.log('Migration OK.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
