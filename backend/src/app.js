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
const { addClient } = require('./services/sseService');
const jwt = require('jsonwebtoken');

const app = express();

// Trust proxy for Render deployment so rate limits measure the original IP instead of the reverse proxy IP
app.set('trust proxy', 1);

app.disable('x-powered-by');

app.use(cors());
app.use(express.json());

const API_RATE_LIMIT_MAX = Number.parseInt(process.env.API_RATE_LIMIT_MAX, 10) || 500;
const AUTH_RATE_LIMIT_MAX = Number.parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 50;

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: API_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
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
  const keepAlive = setInterval(() => res.write(':\n\n'), 30000);
  req.on('close', () => clearInterval(keepAlive));
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Suivi Production API running' });
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

app.get('/', (req, res) => {
  res.send('API Suivi Production is running. Access the frontend app instead.');
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route introuvable' });
});

module.exports = app;
