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
const stockImportMpRoutes = require('./routes/stockImportMpRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

const app = express();

// Trust proxy for Render deployment so rate limits measure the original IP instead of the reverse proxy IP
app.set('trust proxy', 1);

app.disable('x-powered-by');

app.use(cors());
app.use(express.json());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requetes, veuillez reessayer plus tard.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
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
app.use('/api/stock-import-mp', stockImportMpRoutes);
app.use('/api/notifications', notificationRoutes);

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
