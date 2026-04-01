const { Pool } = require('pg');
const dns = require('dns');

// Force IPv4 in production to prevent ENETUNREACH on IPv6 with Supabase
dns.setDefaultResultOrder('ipv4first');

// Also explicitly set node to use IPv4 via family
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'suivi_production',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

module.exports = pool;
