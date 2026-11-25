require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const ws = require('./src/websocket');
const { ensureCollaborationSchema } = require('./src/bootstrap/collaborationSchema');
const { ensureWorkspaceSchema } = require('./src/bootstrap/workspaceSchema');
const { errorHandler, notFound } = require('./src/middleware/errorHandler');
const { loginLimiter, accountLimiter, apiLimiter, consoleAuthLimiter } = require('./src/middleware/rateLimiter');
const { safeErrors } = require('./src/middleware/safeErrors');

const app = express();
// Trust Nginx reverse proxy (1 hop). Required for express-rate-limit to work correctly.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS) || 1);
app.disable('x-powered-by');
const server = http.createServer(app);

// Security headers on every API answer. The API serves JSON, images and downloads, never pages,
// so nothing may frame it or run as a page from it.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  next();
});
// Database and crash text never reaches the browser (see the file for why).
app.use(safeErrors);

const normalizeOrigin = (value) => String(value || '').trim().replace(/\/+$/, '');

// Only our own sites may call the API from a browser. Any *.vercel.app used to be allowed, but anyone
// can publish a site there. Extra sites go in FRONTEND_ORIGINS (comma separated).
const configuredOrigins = [
  'https://task.greencall.in',
  'https://task-qds4.vercel.app',
  ...(process.env.NODE_ENV === 'production' ? [] : ['http://localhost:3000']),
  process.env.FRONTEND_URL,
  process.env.APP_FRONTEND_URL,
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
  return allowedOrigins.includes(normalizedOrigin);
};

app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) return callback(null, true);
    callback(Object.assign(new Error('Not allowed by CORS'), { status: 403 }));
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
app.use(['/api/auth/login', '/api/company-auth/login'], loginLimiter);
app.use(['/api/auth/register', '/api/auth/send-reset-link', '/api/auth/send-reset-otp', '/api/auth/reset-password', '/api/company-auth/register'], accountLimiter);
app.use(['/api/sa/login', '/api/sa/setup-password'], consoleAuthLimiter);
app.get('/api/users/avatar/:token', require('./src/services/avatars').serveAvatar);
app.get('/api/teams/photo/:token', require('./src/services/avatars').serveTeamPhoto);
app.use('/api', apiLimiter);

// Routes
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/company-auth', require('./src/routes/companyAuth'));
app.use('/api/sessions', require('./src/routes/sessions'));
app.use('/api/sa', require('./src/routes/superAdminAuth').router);
app.use('/api/teams', require('./src/routes/teams'));
app.use('/api/task-sheets', require('./src/routes/taskSheets'));
app.use('/api/task-extras', require('./src/routes/taskExtras'));
app.use('/api/developer', require('./src/routes/developer'));
app.use('/api/bugs', require('./src/routes/bugs'));
app.use('/api/v1', require('./src/routes/publicApi'));
app.use('/api/tasks', require('./src/routes/tasks'));
app.use('/api/task-form', require('./src/routes/taskForm'));
app.use('/api/clients', require('./src/routes/clients'));
app.use('/api/timesheet', require('./src/routes/timesheet'));
app.use('/api/workspace', require('./src/routes/workspace'));
app.use('/api/updates', require('./src/routes/updates'));
app.use('/api/task-productivity', require('./src/routes/taskProductivity'));
app.use('/api/task-workflow', require('./src/routes/taskWorkflow'));
app.use('/api/task-recurrence', require('./src/routes/taskRecurrence'));
app.use('/api/logs', require('./src/routes/logs'));
app.use('/api/users', require('./src/routes/users'));
app.use('/api/hrms', require('./src/routes/hrms'));
app.use('/api/admin', require('./src/routes/admin'));
app.use('/api/company-admin', require('./src/routes/companyAdmin'));
app.use('/api/analytics', require('./src/routes/analytics'));
app.use('/api/notifications', require('./src/routes/notifications'));
app.use('/api/chat', require('./src/routes/chat'));
app.use('/api/comments', require('./src/routes/comments'));
app.use('/api/communications', require('./src/routes/communications'));
app.use('/api/calendar', require('./src/routes/calendar'));
app.use('/api/notes', require('./src/routes/notes'));

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
