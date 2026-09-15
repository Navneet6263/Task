require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const ws = require('./src/websocket');
const { ensureCollaborationSchema } = require('./src/bootstrap/collaborationSchema');
const { ensureWorkspaceSchema } = require('./src/bootstrap/workspaceSchema');
const { errorHandler, notFound } = require('./src/middleware/errorHandler');
const { authLimiter, apiLimiter } = require('./src/middleware/rateLimiter');

const app = express();
// Trust Nginx reverse proxy (1 hop). Required for express-rate-limit to work correctly.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS) || 1);
const server = http.createServer(app);

const normalizeOrigin = (value) => String(value || '').trim().replace(/\/+$/, '');

const configuredOrigins = [
  'http://localhost:3000',
  'https://task-qds4.vercel.app',
  process.env.FRONTEND_URL,
  ...(process.env.FRONTEND_ORIGINS || '')
    .split(',')
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean),
]
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean);

const allowedOrigins = Array.from(new Set(configuredOrigins));

const isAllowedOrigin = (origin) => {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return true;
  if (allowedOrigins.includes(normalizedOrigin)) return true;
  return /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(normalizedOrigin);
};

app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
// Matches the existing 450 KB reference-image UI (base64 expands the payload).
app.use(express.json({ limit: '1mb' }));

// Request logger — shows every request in CMD
app.use(require('./src/middleware/requestTiming'));

// Init WebSocket
ws.init(server);
app.set('ws', ws);

// Health check routes
app.get('/', (req, res) => res.json({ status: 'ok', service: 'GreenTask API' }));
app.get('/api', (req, res) => res.json({ status: 'ok', service: 'GreenTask API' }));

// Rate limiting
app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// Routes
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/company-auth', require('./src/routes/companyAuth'));
app.use('/api/super-admin', require('./src/routes/superAdmin'));
app.use('/api/sa', require('./src/routes/superAdminAuth').router);
app.use('/api/teams', require('./src/routes/teams'));
app.use('/api/tasks', require('./src/routes/tasks'));
app.use('/api/workspace', require('./src/routes/workspace'));
app.use('/api/updates', require('./src/routes/updates'));
app.use('/api/task-productivity', require('./src/routes/taskProductivity'));
app.use('/api/task-workflow', require('./src/routes/taskWorkflow'));
app.use('/api/task-recurrence', require('./src/routes/taskRecurrence'));
app.use('/api/logs', require('./src/routes/logs'));
app.use('/api/users', require('./src/routes/users'));
app.use('/api/admin', require('./src/routes/admin'));
app.use('/api/company-admin', require('./src/routes/companyAdmin'));
app.use('/api/analytics', require('./src/routes/analytics'));
app.use('/api/notifications', require('./src/routes/notifications'));
app.use('/api/chat', require('./src/routes/chat'));
app.use('/api/comments', require('./src/routes/comments'));
app.use('/api/communications', require('./src/routes/communications'));

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const { startBot } = require('./src/telegram/bot');

const startServer = async () => {
  try {
    console.log('Bootstrapping database schema and indexes...');
    if (process.env.RUN_MIGRATIONS_ON_START !== 'false') { await ensureCollaborationSchema(); await ensureWorkspaceSchema(); }
    console.log('Database schema and indexes verified successfully.');
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    if (process.env.ENABLE_BACKGROUND_JOBS !== 'false') require('./src/jobs/backgroundJobs').startBackgroundJobs();
    if (process.env.ENABLE_TELEGRAM_BOT !== 'false') startBot();
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();
