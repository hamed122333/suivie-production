require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./src/config/db');

async function fixPasswords() {
  try {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('admin123', salt);
    await pool.query('UPDATE users SET password = $1', [hash]);
    console.log('All passwords successfully set to admin123');
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
fixPasswords();
