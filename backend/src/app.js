const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const taskRoutes = require('./routes/taskRoutes');
const userRoutes = require('./routes/userRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const workspaceRoutes = require('./routes/workspaceRoutes');
const stockImportRoutes = require('./routes/stockImportRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const { addClient } = require('./services/sseService');
const errorHandler = require('./middleware/errorHandler');
const pool = require('./config/db');
const jwt = require('jsonwebtoken');

const app = express();

// Trust proxy for Render deployment so rate limits measure the original IP instead of the reverse proxy IP
app.set('trust proxy', 1);

app.disable('x-powered-by');

// CORS : restreint à l'origin frontend en prod via CORS_ORIGIN (liste séparée par
// des virgules, ex. "https://mon-app.vercel.app"). Repli ouvert si non défini pour
// ne pas casser le dev / un déploiement non encore configuré.
const corsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors(
    corsOrigins.length > 0
      ? { origin: corsOrigins, credentials: true }
      : undefined
  )
);
// Limite la taille du corps JSON (anti-abus mémoire). Généreuse pour les créations
// en lot (createBulk envoie un tableau de tâches). Surchargeable via JSON_BODY_LIMIT.
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '5mb' }));

const API_RATE_LIMIT_MAX = Number.parseInt(process.env.API_RATE_LIMIT_MAX, 10) || 500;
const AUTH_RATE_LIMIT_MAX = Number.parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 50;

// Compte le quota PAR UTILISATEUR authentifié plutôt que par IP : en entreprise
// tous les utilisateurs sortent souvent derrière une seule IP NAT et partageraient
// alors le même budget (→ 429 collectif). On extrait l'id du JWT ; repli sur l'IP
// pour les requêtes non authentifiées.
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key_do_not_use_in_production';
function rateLimitKey(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(header.slice(7), JWT_SECRET);
      if (decoded && decoded.id) return `user:${decoded.id}`;
    } catch { /* token invalide → repli IP */ }
  }
  return `ip:${req.ip}`;
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: API_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
  message: { error: 'Trop de requetes, veuillez reessayer plus tard.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives de connexion, veuillez reessayer plus tard.' },
});

// SSE — excluded from rate limiting (long-lived connection); JWT verified via query param
app.get('/api/events', (req, res) => {
  // EventSource cannot send headers, so token is passed as ?token=<jwt>
  const token = req.query.token;
  const secret = process.env.JWT_SECRET || 'dev_secret_key_do_not_use_in_production';
  if (!token) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  try {
    jwt.verify(token, secret);
  } catch {
    return res.status(401).json({ error: 'Token invalide' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(':\n\n');
  addClient(res);
  // Ping toutes les 15s : sous le délai d'inactivité QUIC/HTTP3 de Chrome (~30s)
  // pour éviter ERR_QUIC_PROTOCOL_ERROR.QUIC_NETWORK_IDLE_TIMEOUT (reconnexions + bruit console).
  const keepAlive = setInterval(() => res.write(':\n\n'), 15000);
  req.on('close', () => clearInterval(keepAlive));
});

// Liveness léger (toujours 200 si le process répond).
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Suivi Production API running' });
});

// Readiness : vérifie la connectivité DB (utilisable par le health check Render).
// 200 si la base répond, 503 sinon → évite de router du trafic vers une instance
// dont la DB est injoignable.
app.get('/api/ready', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'OK', db: 'up' });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: 'down' });
  }
});

app.use('/api/auth', authLimiter);
// Skip apiLimiter for /api/auth/* so auth requests aren't double-counted
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth')) return next();
  return apiLimiter(req, res, next);
});

app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/stock-import', stockImportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/analytics', analyticsRoutes);

app.get('/', (req, res) => {
  res.send('API Suivi Production is running. Access the frontend app instead.');
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route introuvable' });
});

// Gestionnaire d'erreurs global — DOIT rester le dernier middleware monté
app.use(errorHandler);

module.exports = app;
