require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'suivi_production',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function run() {
  const name = 'Commercial';
  const email = 'commercial@example.com';
  const password = 'commercial123';
  const role = 'super_admin';
  const hash = await bcrypt.hash(password, 10);

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    await pool.query(
      'UPDATE users SET name = $1, password = $2, role = $3 WHERE email = $4',
      [name, hash, role, email]
    );
    console.log('Commercial account updated');
  } else {
    await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)',
      [name, email, hash, role]
    );
    console.log('Commercial account created');
  }
}

run()
  .then(async () => {
    await pool.end();
  })
  .catch(async (e) => {
    console.error(e.message);
    await pool.end();
    process.exit(1);
  });

