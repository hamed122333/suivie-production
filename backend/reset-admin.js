require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'suivi_production',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function resetAdmin() {
  try {
    const password = 'admin123';
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Check if admin exits
    const res = await pool.query('SELECT * FROM users WHERE email = $1', ['admin@example.com']);
    
    if (res.rows.length > 0) {
      // Update
      await pool.query('UPDATE users SET password = $1 WHERE email = $2', [hashedPassword, 'admin@example.com']);
      console.log('Admin password updated to: ' + password);
    } else {
      // Create
      await pool.query(
        'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)',
        ['System Admin', 'admin@example.com', hashedPassword, 'super_admin']
      );
      console.log('Admin user created with password: ' + password);
    }

    // Reset Operator One
    const userPassword = 'user123'; 
    const hashedUserPassword = await bcrypt.hash(userPassword, 10);
    const resUser = await pool.query('SELECT * FROM users WHERE email = $1', ['op1@example.com']);
    
    if (resUser.rows.length > 0) {
       await pool.query('UPDATE users SET password = $1 WHERE email = $2', [hashedUserPassword, 'op1@example.com']);
       console.log('Operator One password updated to: ' + userPassword);
    } else {
      await pool.query(
        'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)',
        ['Operator One', 'op1@example.com', hashedUserPassword, 'user']
      );
      console.log('Operator One created with password: ' + userPassword);
    }

  } catch (err) {
    console.error('Error resetting admin password:', err);
  } finally {
    await pool.end();
  }
}

resetAdmin();
