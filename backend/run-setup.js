require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL || '';
const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';
const adminName = process.env.BOOTSTRAP_ADMIN_NAME || '';
const adminRole = process.env.BOOTSTRAP_ADMIN_ROLE || '';

// If Supabase uses IPv6 and IPv4 but host resolves default to IPv6 in some Node versions, force IPv4
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

// Force TLS for schema setup if in production
if (process.env.NODE_ENV === 'production') {
  process.env.PGSSLMODE = 'require';
}

async function setup() {
  try {
    // Apply schema.sql
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    console.log('Running schema migration...');
    await pool.query(schemaSql);
    console.log('Schema applied.');

    // Table de suivi : n'applique chaque migration qu'UNE seule fois (évite la
    // réexécution complète à chaque déploiement et les états partiels).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const appliedRows = await pool.query('SELECT filename FROM schema_migrations');
    const applied = new Set(appliedRows.rows.map((r) => r.filename));

    // Apply all migrations in migrations/ folder in order
    const migrationsDir = path.join(__dirname, 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const migrationFiles = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();
      for (const file of migrationFiles) {
        if (applied.has(file)) {
          console.log(`Skip (already applied): ${file}`);
          continue;
        }
        const migrationSql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        console.log(`Running migration: ${file}`);
        // NB : pas de BEGIN/COMMIT externe ici — certaines migrations gèrent déjà
        // leur propre transaction. Les migrations sont idempotentes (IF NOT EXISTS).
        await pool.query(migrationSql);
        await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        console.log(`Applied migration: ${file}`);
      }
    }

    // Optional bootstrap admin (only if env vars are set)
    if (adminEmail && adminPassword) {
      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [adminEmail]);
      if (existing.rows.length === 0) {
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        await pool.query(
          'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)',
          [adminName, adminEmail, hashedPassword, adminRole]
        );
        console.log('Bootstrap admin created.');
      } else {
        console.log('Bootstrap admin already exists.');
      }
    }
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
