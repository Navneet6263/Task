const express = require('express');
const crypto = require('crypto');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { isModuleEnabled } = require('../services/orgModules');
const { SCOPES, RATE_PER_MINUTE, createKey, rotateKey } = require('../services/apiKeys');
const { EVENTS, EVENT_KEYS, RETRY_SECONDS, checkUrl, createWebhook, deliver } = require('../services/webhooks');
const inbound = require('../services/inboundHooks');
const { seal } = require('../services/secretBox');

// Admin → Developer: API keys, webhooks and the request log for the current organization.
// Admins only, and only where the platform team turned the developer API on.
const router = express.Router();
router.use(authenticate);

const fail = (status, message) => Object.assign(new Error(message), { status });
const route = (handler) => async (req, res) => {
  try {
    if (!['admin', 'company_admin'].includes(req.userRole)) throw fail(403, 'Only admins can manage the developer API');
    if (!req.orgId) throw fail(422, 'Select an organization first');
    if (req.userRole === 'company_admin') {
      const [[own]] = await db.execute('SELECT id FROM organizations WHERE id = ? AND company_admin_id = ?', [req.orgId, req.companyAdminId]);
      if (!own) throw fail(403, 'Organization access denied');
    }
    await handler(req, res);
  } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Something went wrong' }); }
};
const requireOn = async (req) => { if (!await isModuleEnabled(req.orgId, 'developer_api')) throw fail(403, 'The developer API is not turned on for this company'); };

router.get('/status', route(async (req, res) => {
  const [[org]] = await db.execute('SELECT id, name FROM organizations WHERE id = ?', [req.orgId]);
  res.json({
    enabled: await isModuleEnabled(req.orgId, 'developer_api'), organization: org, scopes: SCOPES, events: EVENTS,
    rate_per_minute: RATE_PER_MINUTE, retry_seconds: RETRY_SECONDS, inbound_fields: inbound.FIELDS, inbound_batch: inbound.MAX_BATCH,
  });
}));

router.get('/keys', route(async (req, res) => {
  await requireOn(req);
  const [rows] = await db.execute(
    `SELECT k.id, k.name, k.key_prefix, k.scopes, k.allowed_ips, k.mode, k.replaced_by, k.created_at, k.expires_at, k.last_used_at, k.last_used_ip, k.revoked_at, u.name AS created_by_name,
       (SELECT COUNT(*) FROM api_request_logs l WHERE l.key_id = k.id AND l.created_at >= DATEADD(DAY, -1, SYSDATETIME())) AS calls_24h
     FROM api_keys k JOIN users u ON u.id = k.created_by WHERE k.org_id = ? ORDER BY CASE WHEN k.revoked_at IS NULL THEN 0 ELSE 1 END, k.created_at DESC`, [req.orgId]
  );
  res.json(rows.map((k) => ({ ...k, scopes: String(k.scopes).split(','), calls_24h: Number(k.calls_24h) })));
}));

// The full key is in this answer only; it cannot be shown again.
router.post('/keys', route(async (req, res) => {
  await requireOn(req);
  res.status(201).json(await createKey(req.orgId, req.userId, req.body));
}));

// New key, same settings; the old one keeps working for 24 hours.
router.post('/keys/:id/rotate', route(async (req, res) => {
  await requireOn(req);
  res.status(201).json(await rotateKey(req.orgId, req.userId, Number(req.params.id)));
}));

router.delete('/keys/:id', route(async (req, res) => {
  const [result] = await db.execute('UPDATE api_keys SET revoked_at = SYSDATETIME(), revoked_by = ? WHERE id = ? AND org_id = ? AND revoked_at IS NULL',
    [req.userId, Number(req.params.id), req.orgId]);
  if (!Number(result?.affectedRows)) throw fail(404, 'Key not found or already revoked');
  res.json({ message: 'Revoked' });
}));

router.get('/logs', route(async (req, res) => {
  const [rows] = await db.execute(
    `SELECT TOP 200 l.id, l.method, l.path, l.status, l.ip, l.duration_ms, l.created_at, k.name AS key_name
     FROM api_request_logs l JOIN api_keys k ON k.id = l.key_id WHERE l.org_id = ? AND (? = 0 OR l.key_id = ?) ORDER BY l.id DESC`,
    [req.orgId, Number(req.query.key_id) || 0, Number(req.query.key_id) || 0]
  );
  res.json(rows);
}));

router.get('/webhooks', route(async (req, res) => {
  await requireOn(req);
  const [rows] = await db.execute(
    `SELECT w.id, w.name, w.url, w.events, w.is_active, w.failure_count, w.last_status, w.last_delivery_at, w.created_at,
       (SELECT COUNT(*) FROM webhook_queue q WHERE q.webhook_id = w.id AND q.status = 'pending') AS waiting
     FROM webhooks w WHERE w.org_id = ? ORDER BY w.created_at DESC`, [req.orgId]
  );
  res.json(rows.map((w) => ({ ...w, events: String(w.events).split(','), is_active: Boolean(w.is_active), waiting: Number(w.waiting) })));
}));

router.post('/webhooks', route(async (req, res) => {
  await requireOn(req);
  res.status(201).json(await createWebhook(req.orgId, req.userId, req.body));
}));

async function ownHook(req) {
  const [[hook]] = await db.execute('SELECT * FROM webhooks WHERE id = ? AND org_id = ?', [Number(req.params.id), req.orgId]);
  if (!hook) throw fail(404, 'Webhook not found');
  return hook;
}

router.patch('/webhooks/:id', route(async (req, res) => {
  const hook = await ownHook(req);
  const url = req.body.url !== undefined ? checkUrl(req.body.url) : hook.url;
  const events = Array.isArray(req.body.events) ? [...new Set(req.body.events.filter((e) => EVENT_KEYS.includes(e)))] : String(hook.events).split(',');
  if (!events.length) throw fail(422, 'Choose at least one event');
  const active = req.body.is_active === undefined ? Boolean(hook.is_active) : req.body.is_active === true;
  await db.execute('UPDATE webhooks SET url = ?, events = ?, is_active = ?, failure_count = CASE WHEN ? = 1 THEN 0 ELSE failure_count END WHERE id = ?',
    [url, events.join(','), active ? 1 : 0, active ? 1 : 0, hook.id]);
  res.json({ message: 'Saved' });
}));

// A new signing secret, shown once; the old one stops working at once.
router.post('/webhooks/:id/rotate-secret', route(async (req, res) => {
  const hook = await ownHook(req);
  const secret = `whsec_${crypto.randomBytes(24).toString('base64url')}`;
  await db.execute('UPDATE webhooks SET secret = ? WHERE id = ?', [seal(secret), hook.id]);
  res.json({ secret });
}));

router.post('/webhooks/:id/test', route(async (req, res) => {
  await requireOn(req);
  const hook = await ownHook(req);
  const result = await deliver(hook, 'ping', { message: 'Test from GreenTask. If you can read this, the webhook works.' });
  res.json({ ok: result.ok, status: result.status, error: result.error || null, ms: result.ms });
}));

router.get('/webhooks/:id/deliveries', route(async (req, res) => {
  const hook = await ownHook(req);
  const [rows] = await db.execute('SELECT TOP 50 id, event, status_code, error, duration_ms, created_at FROM webhook_deliveries WHERE webhook_id = ? ORDER BY id DESC', [hook.id]);
  res.json(rows);
}));

router.delete('/webhooks/:id', route(async (req, res) => {
  const hook = await ownHook(req);
  await db.execute('DELETE FROM webhooks WHERE id = ?', [hook.id]);
  res.json({ message: 'Deleted' });
}));

/* Incoming connections: their JSON becomes tasks, matched here once. */
const parseJson = (text, fallback) => { try { return JSON.parse(text) ?? fallback; } catch { return fallback; } };
async function ownInbound(req) {
  const [[hook]] = await db.execute('SELECT * FROM inbound_hooks WHERE id = ? AND org_id = ?', [Number(req.params.id), req.orgId]);
  if (!hook) throw fail(404, 'Connection not found');
  return hook;
}
const inboundView = (h) => ({
  id: h.id, name: h.name, source: h.source, token_prefix: h.token_prefix, team_id: h.team_id, mapping: parseJson(h.mapping, {}),
  required: parseJson(h.required_fields, []), listening: Boolean(h.listening), is_active: Boolean(h.is_active),
  has_sample: Boolean(h.sample), last_received_at: h.last_received_at, created_at: h.created_at,
});

router.get('/inbound', route(async (req, res) => {
  await requireOn(req);
  const [rows] = await db.execute('SELECT * FROM inbound_hooks WHERE org_id = ? ORDER BY created_at DESC', [req.orgId]);
  res.json(rows.map(inboundView));
}));

// The secret address is in this answer only.
router.post('/inbound', route(async (req, res) => {
  await requireOn(req);
  res.status(201).json(await inbound.createInbound(req.orgId, req.userId, req.body));
}));

router.get('/inbound/:id', route(async (req, res) => {
  const hook = await ownInbound(req);
  const sample = parseJson(hook.sample, null);
  const [events] = await db.execute('SELECT TOP 30 id, outcome, message, task_id, created_at FROM inbound_hook_events WHERE hook_id = ? ORDER BY id DESC', [hook.id]);
  const [teams] = await db.execute('SELECT id, name FROM teams WHERE org_id = ? AND is_deleted = FALSE ORDER BY name', [req.orgId]);
  res.json({ ...inboundView(hook), sample, paths: sample ? inbound.flattenPaths(sample) : [], events, teams });
}));

router.patch('/inbound/:id', route(async (req, res) => {
  const hook = await ownInbound(req);
  const name = req.body.name === undefined ? hook.name : String(req.body.name).trim().slice(0, 100) || hook.name;
  let teamId = hook.team_id;
  if (req.body.team_id !== undefined) {
    const [[team]] = await db.execute('SELECT id FROM teams WHERE id = ? AND org_id = ? AND is_deleted = FALSE', [Number(req.body.team_id), req.orgId]);
    if (!team) throw fail(422, 'Pick a team of this company');
    teamId = team.id;
  }
  const { mapping, required } = req.body.mapping !== undefined ? inbound.readMapping(req.body) : { mapping: parseJson(hook.mapping, {}), required: parseJson(hook.required_fields, []) };
  const listening = req.body.listening === undefined ? Boolean(hook.listening) : req.body.listening === true;
  if (!listening && (!mapping.title || !teamId)) throw fail(422, 'Match at least the task title and pick a team before going live');
  const active = req.body.is_active === undefined ? Boolean(hook.is_active) : req.body.is_active === true;
  await db.execute('UPDATE inbound_hooks SET name = ?, team_id = ?, mapping = ?, required_fields = ?, listening = ?, is_active = ? WHERE id = ?',
    [name, teamId, JSON.stringify(mapping), JSON.stringify(required), listening ? 1 : 0, active ? 1 : 0, hook.id]);
  res.json({ message: 'Saved' });
}));

// Try the matching on the saved sample without creating anything.
router.post('/inbound/:id/preview', route(async (req, res) => {
  const hook = await ownInbound(req);
  const sample = parseJson(hook.sample, null);
  if (!sample) throw fail(422, 'No sample yet. Send one record to the address first.');
  const { mapping, required } = inbound.readMapping(req.body);
  res.json(inbound.mapRecord(sample, { source: hook.source, team_id: hook.team_id, mapping, required }));
}));

router.post('/inbound/:id/rotate', route(async (req, res) => {
  const hook = await ownInbound(req);
  const { token, prefix, hash } = inbound.generateToken();
  await db.execute('UPDATE inbound_hooks SET token_prefix = ?, token_hash = ? WHERE id = ?', [prefix, hash, hook.id]);
  res.json({ token });
}));

router.delete('/inbound/:id', route(async (req, res) => {
  const hook = await ownInbound(req);
  await db.execute('DELETE FROM inbound_hooks WHERE id = ?', [hook.id]);
  res.json({ message: 'Deleted' });
}));

module.exports = router;
