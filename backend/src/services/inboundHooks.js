const crypto = require('crypto');
const db = require('../config/database');
const { isModuleEnabled } = require('./orgModules');
const { takeToken } = require('./apiKeys');
const { parseDate, parsePriority } = require('./sheetToTask');
const { upsertTask } = require('./apiTasks');

// Incoming connections: another system posts its own JSON to a secret address. The admin matches its
// fields to task fields once (from a sample it sent), so the other side changes no code at all.

const FIELDS = [
  { key: 'title', label: 'Task title', always: true },
  { key: 'description', label: 'Description' },
  { key: 'external_id', label: 'Their record id', hint: 'The same id updates the same task' },
  { key: 'assignee', label: 'Assignee', hint: 'Email or employee code' },
  { key: 'due_date', label: 'Due date' },
  { key: 'start_date', label: 'Start date' },
  { key: 'priority', label: 'Priority' },
  { key: 'status', label: 'Status' },
  { key: 'client_name', label: 'Client' },
  { key: 'labels', label: 'Labels', hint: 'A list, or names split by commas' },
];
const FIELD_KEYS = FIELDS.map((f) => f.key);
const MAX_BATCH = 50;
const fail = (status, message) => Object.assign(new Error(message), { status });
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

function generateToken() {
  const prefix = `gti_${crypto.randomBytes(6).toString('hex')}`;
  const token = `${prefix}_${crypto.randomBytes(24).toString('base64url')}`;
  return { token, prefix, hash: sha256(token) };
}
const tokenPrefix = (token) => (String(token || '').match(/^(gti_[a-f0-9]{12})_[A-Za-z0-9_-]{32}$/) || [])[1] || null;

// "ticket.subject", "items.0.name" or "items[0].name".
function getPath(obj, path) {
  return String(path || '').replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)
    .reduce((value, part) => (value !== null && value !== undefined && Object.prototype.hasOwnProperty.call(Object(value), part) ? value[part] : undefined), obj);
}

// Every field in a sample, for the matching screen: [{ path, sample }].
function flattenPaths(obj, prefix = '', out = [], depth = 0) {
  if (out.length >= 200 || depth > 6 || obj === null || typeof obj !== 'object') return out;
  Object.entries(obj).forEach(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) flattenPaths(value, path, out, depth + 1);
    else if (Array.isArray(value) && value.length && typeof value[0] === 'object') flattenPaths(value[0], `${path}.0`, out, depth + 1);
    else if (out.length < 200) out.push({ path, sample: Array.isArray(value) ? value.join(', ').slice(0, 80) : String(value ?? '').slice(0, 80) });
  });
  return out;
}

const STATUS_WORDS = {
  TODO: ['todo', 'to do', 'open', 'new', 'pending start', 'not started', 'backlog'],
  IN_PROGRESS: ['in progress', 'in_progress', 'inprogress', 'working', 'started', 'doing', 'active'],
  PENDING: ['pending', 'on hold', 'hold', 'waiting', 'blocked'],
  DONE: ['done', 'closed', 'resolved', 'complete', 'completed', 'finished'],
};
function toStatus(value) {
  const t = String(value ?? '').trim().toLowerCase();
  if (!t) return undefined;
  return Object.keys(STATUS_WORDS).find((s) => STATUS_WORDS[s].includes(t) || s.toLowerCase() === t) || null;
}
// ISO date-times from other systems are fine too: 2026-11-30T10:00:00Z.
const toDate = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const iso = String(value).match(/^(\d{4}-\d{2}-\d{2})T/);
  return iso ? iso[1] : parseDate(value) || null;
};

// One record of theirs as an API task body, or the reasons it cannot be one.
function mapRecord(record, hook) {
  const mapping = hook.mapping || {};
  const required = hook.required || [];
  const body = { source: hook.source, team: hook.team_id || undefined };
  const problems = [];
  FIELD_KEYS.forEach((key) => {
    const raw = mapping[key] ? getPath(record, mapping[key]) : undefined;
    const empty = raw === undefined || raw === null || String(raw).trim() === '' || (Array.isArray(raw) && !raw.length);
    if (empty) { if (key === 'title' || required.includes(key)) problems.push(`${FIELDS.find((f) => f.key === key).label} is empty`); return; }
    if (key === 'due_date' || key === 'start_date') {
      const d = toDate(raw);
      if (!d) problems.push(`${key} "${String(raw).slice(0, 30)}" is not a date`); else body[key] = d;
    } else if (key === 'priority') {
      const p = parsePriority(raw);
      if (!p) problems.push(`Priority "${String(raw).slice(0, 20)}" should be High, Medium or Low`); else body.priority = p;
    } else if (key === 'status') {
      const s = toStatus(raw);
      if (!s) problems.push(`Status "${String(raw).slice(0, 20)}" is not known`); else body.status = s;
    } else if (key === 'labels') {
      body.labels = (Array.isArray(raw) ? raw : String(raw).split(',')).map((l) => String(l).trim()).filter(Boolean).slice(0, 10);
    } else if (key === 'assignee') {
      body.assignee = typeof raw === 'object' ? raw : String(raw).trim();
    } else body[key] = typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
  });
  return { body, problems };
}

const logEvent = (hookId, outcome, message, taskId = null) => db.execute(
  'INSERT INTO inbound_hook_events (hook_id, outcome, message, task_id) VALUES (?, ?, ?, ?)', [hookId, outcome, message ? String(message).slice(0, 300) : null, taskId]
).catch(() => {});
const parseJson = (text, fallback) => { try { return JSON.parse(text) ?? fallback; } catch { return fallback; } };

// POST /api/v1/inbound/:token. Wrong tokens all get the same answer, so nothing can be learned by guessing.
async function receive(token, payload) {
  const notFound = { status: 404, body: { error: { code: 'not_found', message: 'Unknown address' } } };
  const prefix = tokenPrefix(token);
  if (!prefix) return notFound;
  const [[hook]] = await db.execute(
    'SELECT h.*, u.is_deleted AS user_deleted, u.role AS user_role FROM inbound_hooks h JOIN users u ON u.id = h.created_by WHERE h.token_prefix = ?', [prefix]
  );
  const given = Buffer.from(sha256(String(token)), 'hex');
  if (!hook || !crypto.timingSafeEqual(given, Buffer.from(hook.token_hash, 'hex'))) return notFound;
  if (!hook.is_active) return { status: 403, body: { error: { code: 'paused', message: 'This connection is paused' } } };
  if (!await isModuleEnabled(hook.org_id, 'developer_api')) return { status: 403, body: { error: { code: 'api_disabled', message: 'The developer API is turned off for this company' } } };
  if (hook.user_deleted || hook.user_role !== 'admin') return { status: 403, body: { error: { code: 'owner_not_admin', message: 'The admin who set this up no longer has access' } } };
  if (await takeToken(-hook.id) < 0) return { status: 429, body: { error: { code: 'rate_limited', message: 'Too many requests. The limit is 60 a minute.' } } };
  const records = Array.isArray(payload) ? payload : [payload];
  if (!records.length || records.length > MAX_BATCH || records.some((r) => !r || typeof r !== 'object' || Array.isArray(r))) {
    return { status: 422, body: { error: { code: 'invalid_body', message: `Send one JSON object, or a list of up to ${MAX_BATCH}` } } };
  }
  await db.execute('UPDATE inbound_hooks SET last_received_at = SYSDATETIME() WHERE id = ?', [hook.id]);

  const settings = { ...hook, mapping: parseJson(hook.mapping, {}), required: parseJson(hook.required_fields, []) };
  // Until the fields are matched, every call just teaches GreenTask what their data looks like.
  if (hook.listening || !settings.mapping.title) {
    await db.execute('UPDATE inbound_hooks SET sample = ? WHERE id = ?', [JSON.stringify(records[0]).slice(0, 20000), hook.id]);
    await logEvent(hook.id, 'sample', 'Sample saved for field matching');
    return { status: 202, body: { received: true, message: 'Sample saved. Match the fields in GreenTask (Admin → Developer → Incoming) to start creating tasks.' } };
  }

  const results = [];
  for (const record of records) {
    const { body, problems } = mapRecord(record, settings);
    if (problems.length) { results.push({ ok: false, error: problems.join('; ') }); await logEvent(hook.id, 'skipped', problems.join('; ')); continue; }
    try {
      const result = await upsertTask({ orgId: hook.org_id, actorId: hook.created_by, actorLabel: `the incoming connection "${hook.name}"`, body });
      results.push({ ok: true, created: result.created, key: result.data?.key, id: result.data?.id });
      await logEvent(hook.id, result.created ? 'created' : 'updated', body.title || body.external_id, result.data?.id);
    } catch (error) {
      results.push({ ok: false, error: error.status ? error.message : 'Could not save this record' });
      await logEvent(hook.id, 'error', error.status ? error.message : 'Server error');
    }
  }
  const allOk = results.every((r) => r.ok);
  return { status: allOk ? 200 : results.some((r) => r.ok) ? 207 : 422, body: { results } };
}

async function createInbound(orgId, userId, body) {
  const name = String(body?.name || '').trim().slice(0, 100);
  if (!name) throw fail(422, 'Give the connection a name, like "CRM tickets"');
  const source = String(body?.source || name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'inbound';
  const [[{ count }]] = await db.execute('SELECT COUNT(*) AS count FROM inbound_hooks WHERE org_id = ?', [orgId]);
  if (Number(count) >= 10) throw fail(409, 'A company can have 10 incoming connections');
  const { token, prefix, hash } = generateToken();
  const [created] = await db.execute(
    'INSERT INTO inbound_hooks (org_id, name, source, token_prefix, token_hash, mapping, required_fields, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [orgId, name, source, prefix, hash, '{}', '[]', userId]
  );
  return { id: created.insertId, token, source };
}

// Save the matching. Only known fields and plain paths are kept.
function readMapping(body) {
  const mapping = {};
  const raw = body?.mapping && typeof body.mapping === 'object' ? body.mapping : {};
  FIELD_KEYS.forEach((key) => {
    const path = String(raw[key] || '').trim();
    if (path) { if (!/^[\w\-$ ]+(\.[\w\-$ ]+|\[\d+\])*$/.test(path) || path.length > 200) throw fail(422, `"${path}" is not a field path`); mapping[key] = path; }
  });
  const required = [...new Set((Array.isArray(body?.required) ? body.required : []).filter((k) => FIELD_KEYS.includes(k) && k !== 'title' && mapping[k]))];
  return { mapping, required };
}

module.exports = { FIELDS, MAX_BATCH, generateToken, tokenPrefix, getPath, flattenPaths, toStatus, toDate, mapRecord, receive, createInbound, readMapping, sha256 };
