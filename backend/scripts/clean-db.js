require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

async function clean() {
  const res = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
  );
  const tables = res.rows.map((r) => r.table_name);
  console.log('Tables found:', tables.join(', '));

  const toTruncate = tables.filter((t) =>
    ['task_history', 'task_comments', 'notifications', 'tasks', 'workspaces', 'stock_history'].includes(t)
  );
  if (toTruncate.length > 0) {
    await pool.query(`TRUNCATE TABLE ${toTruncate.join(', ')} RESTART IDENTITY CASCADE`);
    console.log('Truncated:', toTruncate.join(', '));
  } else {
    console.log('No matching tables found to truncate');
  }
  await pool.end();
}

clean().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
