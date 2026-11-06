const express = require('express');
const db = require('../config/database');
const ws = require('../websocket');
const { apiKeyAuth, requireScope } = require('../services/apiKeys');
const { isPlaceholderEmail } = require('../services/employeeAccounts');
const { fail, STATUSES, shape, resolveTeam, resolvePerson, ownTask, upsertTask, patchTask } = require('../services/apiTasks');
const { openApiSpec } = require('../services/openapi');
const { receive } = require('../services/inboundHooks');

// Public API v1, called by other software with a company API key. Everything is limited to the
// key's own company, and every task is created as the admin who made the key.
const router = express.Router();

const route = (handler) => async (req, res) => {
  try { await handler(req, res); }
  catch (error) {
    if (!error.status) console.error('[api/v1]', error.message);
    res.status(error.status || 500).json({ error: { code: error.code || 'server_error', message: error.status ? error.message : 'Something went wrong' } });
  }
};

// Open to anyone: the API description holds no company data.
router.get('/openapi.json', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}${req.baseUrl}`;
  res.set('Cache-Control', 'public, max-age=300').json(openApiSpec(base));
});

// Incoming connections authenticate with the secret in their address instead of a key.
router.post('/inbound/:token', route(async (req, res) => {
  const result = await receive(req.params.token, req.body, req.ip);
  res.status(result.status).json(result.body);
}));

router.use(apiKeyAuth);

router.get('/me', route(async (req, res) => {
  const [[org]] = await db.execute('SELECT id, name, company_code FROM organizations WHERE id = ?', [req.orgId]);
  res.json({ company: org, key: { name: req.apiKey.name, mode: req.apiKey.mode, scopes: req.apiKey.scopes } });
}));

router.get('/users', requireScope('users:read'), route(async (req, res) => {
  const q = String(req.query.search || '').trim().slice(0, 80);
  const [rows] = await db.execute(
    `SELECT TOP 500 u.id, u.name, u.email, u.login_code AS employee_code, u.role FROM users u
     WHERE u.org_id = ? AND u.is_deleted = FALSE AND u.role IN ('admin', 'manager', 'person')
       AND (? = '' OR u.name LIKE ? OR u.email LIKE ? OR u.login_code LIKE ?) ORDER BY u.name`,
    [req.orgId, q, `%${q}%`, `%${q}%`, `%${q}%`]
  );
  res.json({ data: rows.map((u) => ({ ...u, email: isPlaceholderEmail(u.email) ? null : u.email })) });
}));

router.get('/teams', requireScope('users:read'), route(async (req, res) => {
  const [rows] = await db.execute(
    `SELECT t.id, t.name, t.type, (SELECT COUNT(*) FROM team_members m WHERE m.team_id = t.id AND m.auto_added = 0) AS members
     FROM teams t WHERE t.org_id = ? AND t.is_deleted = FALSE ORDER BY t.name`, [req.orgId]
  );
  res.json({ data: rows });
}));

// List with filters; newest change first. ?status=&team=&assignee=&source=&external_id=&updated_since=&page=&limit=
router.get('/tasks', requireScope('tasks:read'), route(async (req, res) => {
  const where = ['t.org_id = ?', 't.is_deleted = FALSE'];
  const params = [req.orgId];
  if (req.query.status) { if (!STATUSES.includes(req.query.status)) throw fail(422, 'invalid_status', 'Unknown status'); where.push('t.status = ?'); params.push(req.query.status); }
  if (req.query.team) { where.push('t.team_id = ?'); params.push(await resolveTeam(req.orgId, req.query.team)); }
  if (req.query.assignee) { where.push('t.assigned_to = ?'); params.push(await resolvePerson(req.orgId, req.query.assignee)); }
  if (req.query.external_id) { where.push('t.external_id = ?'); params.push(String(req.query.external_id).slice(0, 100)); }
  if (req.query.source) { where.push('t.external_source = ?'); params.push(String(req.query.source).slice(0, 40).toLowerCase()); }
  if (req.query.updated_since) {
    const since = new Date(String(req.query.updated_since));
    if (Number.isNaN(since.getTime())) throw fail(422, 'invalid_date', '"updated_since" must be a date or date-time');
    where.push('t.updated_at >= ?'); params.push(since);
  }
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const page = Math.max(1, Number(req.query.page) || 1);
  const [[{ total }]] = await db.execute(`SELECT COUNT(*) AS total FROM tasks t WHERE ${where.join(' AND ')}`, params);
  const [rows] = await db.execute(
    `SELECT t.id FROM tasks t WHERE ${where.join(' AND ')} ORDER BY t.updated_at DESC, t.id DESC OFFSET ? ROWS FETCH NEXT ? ROWS ONLY`,
    [...params, (page - 1) * limit, limit]
  );
  res.json({ data: await Promise.all(rows.map((r) => shape(r.id, req.orgId))), page, limit, total: Number(total) });
}));

router.get('/tasks/:id', requireScope('tasks:read'), route(async (req, res) => {
  const task = await ownTask(req.orgId, req.params.id);
  res.json({ data: await shape(task.id, req.orgId) });
}));

// Create a task. With "external_id" it is an upsert: the same id from your system updates the same task.
router.post('/tasks', requireScope('tasks:write'), route(async (req, res) => {
  const result = await upsertTask({ orgId: req.orgId, actorId: req.userId, actorLabel: `the API key "${req.apiKey.name}"`, body: req.body || {}, test: req.apiKey.mode === 'test' });
  res.status(result.created ? 201 : 200).json(result);
}));

router.patch('/tasks/:id', requireScope('tasks:write'), route(async (req, res) => {
  res.json(await patchTask({ orgId: req.orgId, idOrKey: req.params.id, body: req.body || {}, test: req.apiKey.mode === 'test' }));
}));

router.post('/tasks/:id/comments', requireScope('tasks:write'), route(async (req, res) => {
  const task = await ownTask(req.orgId, req.params.id);
  const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim().slice(0, 5000) : '';
  if (!comment) throw fail(422, 'comment_required', '"comment" is required');
  if (req.apiKey.mode === 'test') return res.status(201).json({ test: true, data: { id: null, task_id: task.id, comment } });
  const [created] = await db.execute('INSERT INTO task_comments (task_id, user_id, comment) VALUES (?, ?, ?)', [task.id, req.userId, comment]);
  ws.broadcast(task.team_id, 'comment_added', { task_id: task.id });
  return res.status(201).json({ data: { id: created.insertId, task_id: task.id, comment } });
}));

router.use((req, res) => res.status(404).json({ error: { code: 'not_found', message: 'No such endpoint. See /api/v1/openapi.json or Admin → Developer.' } }));

module.exports = router;
