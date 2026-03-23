require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const cron = require('node-cron');
const db = require('./src/config/database');
const ws = require('./src/websocket');
const { ensureCollaborationSchema } = require('./src/bootstrap/collaborationSchema');
const { errorHandler, notFound } = require('./src/middleware/errorHandler');
const { authLimiter, apiLimiter } = require('./src/middleware/rateLimiter');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// Request logger — shows every request in CMD
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
  next();
});

// Init WebSocket
ws.init(server);
app.set('ws', ws);

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
app.use('/api/logs', require('./src/routes/logs'));
app.use('/api/users', require('./src/routes/users'));
app.use('/api/admin', require('./src/routes/admin'));
app.use('/api/company-admin', require('./src/routes/companyAdmin'));
app.use('/api/analytics', require('./src/routes/analytics'));
app.use('/api/notifications', require('./src/routes/notifications'));
app.use('/api/chat', require('./src/routes/chat'));

// Cron: overdue alert every hour
cron.schedule('0 * * * *', async () => {
  try {
    const [overdue] = await db.execute(
      `SELECT t.id, t.title, t.team_id, t.assigned_to
       FROM tasks t
       WHERE t.due_date < CURDATE() AND t.status != 'DONE' AND t.is_deleted = FALSE
         AND NOT EXISTS (
           SELECT 1 FROM audit_logs al
           WHERE al.task_id = t.id AND al.activity = 'Overdue Alert'
             AND al.created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
         )`
    );
    for (const task of overdue) {
      await db.execute(
        'INSERT INTO audit_logs (user_id, team_id, task_id, activity, task_details, description, automated_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [task.assigned_to, task.team_id, task.id, 'Overdue Alert', task.title, `Task overdue: ${task.title}`, 'System (AI)']
      );
      await db.execute(
        'INSERT INTO notifications (user_id, type, message, task_id) VALUES (?, ?, ?, ?)',
        [task.assigned_to, 'overdue', `Task overdue: ${task.title}`, task.id]
      );
      ws.broadcast(task.team_id, 'overdue_alert', { taskId: task.id, title: task.title });
    }
    if (overdue.length) console.log(`[CRON] ${overdue.length} overdue alerts sent`);
  } catch (e) { console.error('[CRON] overdue error:', e.message); }
});

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await ensureCollaborationSchema();
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (error) {
    console.error('Failed to bootstrap collaboration schema:', error.message);
    process.exit(1);
  }
};

startServer();
