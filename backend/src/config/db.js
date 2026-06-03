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
  // Limites de connexion / timeouts adaptés au free tier (Render mono-instance +
  // Supabase connexions limitées). Évite la saturation du pool et les requêtes
  // zombies lors des rafales (imports). Surchargeable via variables d'environnement.
  max: parseInt(process.env.DB_POOL_MAX, 10) || 15,
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS, 10) || 30_000,
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT_MS, 10) || 10_000,
  // Coupe toute requête dépassant ce délai côté serveur PG → évite qu'une requête
  // lente (gros export, scan) ne monopolise une connexion et n'épuise le pool.
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT_MS, 10) || 20_000,
  // Idem côté client (libère la connexion même si le serveur ne répond pas).
  query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT_MS, 10) || 25_000,
  // Garde les connexions vivantes (Supabase coupe les sockets idle).
  keepAlive: true,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

module.exports = pool;
