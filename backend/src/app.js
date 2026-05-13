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
const scanInventoryRoutes = require('./routes/scanInventoryRoutes');
const { addClient } = require('./services/sseService');

const app = express();

// Trust proxy for Render deployment so rate limits measure the original IP instead of the reverse proxy IP
app.set('trust proxy', 1);

app.disable('x-powered-by');

app.use(cors());
app.use(express.json());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requetes, veuillez reessayer plus tard.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives de connexion, veuillez reessayer plus tard.' },
});

app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/stock-import', stockImportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/scan/inventory', scanInventoryRoutes);

// SSE endpoint — real-time push to frontend
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // Nginx: disable buffering
  });
  res.write(':\n\n'); // initial comment to flush headers
  addClient(res);

  // Keep-alive every 30s to prevent proxy/timeout drops
  const keepAlive = setInterval(() => res.write(':\n\n'), 30000);
  req.on('close', () => clearInterval(keepAlive));
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Suivi Production API running' });
});

app.get('/', (req, res) => {
  res.send('API Suivi Production is running. Access the frontend app instead.');
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route introuvable' });
});

module.exports = app;
