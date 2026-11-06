const crypto = require('crypto');
const dns = require('dns');
const https = require('https');
const net = require('net');
const db = require('../config/database');
const { isModuleEnabled } = require('./orgModules');
const { seal, open } = require('./secretBox');
const { isPlaceholderEmail } = require('./employeeAccounts');

// Outgoing webhooks: when a task changes, a signed POST goes to the company's own URL.
// Only public https addresses are called, checked again at connect time (no DNS tricks), no redirects.

const EVENTS = {
  'task.created': 'A task is created',
  'task.updated': 'A task changes (status, owner, details)',
  'task.completed': 'A task is marked done',
  'task.deleted': 'A task is deleted',
};
const EVENT_KEYS = Object.keys(EVENTS);
const TIMEOUT_MS = 8000;
const DISABLE_AFTER = 20;
// After a failed try, wait 1 min, 5 min, 30 min, 2 h and 6 h before trying again (6 tries in all).
const RETRY_SECONDS = [60, 300, 1800, 7200, 21600];
const fail = (status, message) => Object.assign(new Error(message), { status });

// Addresses a webhook may never reach: loopback, private networks, link-local (cloud metadata), etc.
function isPrivateAddress(ip) {
  const clean = String(ip || '').replace(/^::ffff:/i, '');
  if (net.isIPv4(clean)) {
    const [a, b] = clean.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (net.isIPv6(clean)) {
    const lower = clean.toLowerCase();
    // NAT64 (64:ff9b::) can reach IPv4 inside the network, so it is treated as private too.
    return lower === '::' || lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80') || lower.startsWith('ff') || lower.startsWith('64:ff9b:') || lower.startsWith('100::');
  }
  return true;
}

// Host as an IP, without the brackets of an IPv6 literal; '' when it is a name.
const literalIp = (hostname) => { const bare = String(hostname || '').replace(/^\[|\]$/g, ''); return net.isIP(bare) ? bare : ''; };

function checkUrl(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { throw fail(422, 'Enter the full https:// address'); }
  if (url.protocol !== 'https:') throw fail(422, 'Webhook addresses must start with https://');
  if (url.username || url.password) throw fail(422, 'Do not put a user name or password in the address');
  if (url.port && url.port !== '443') throw fail(422, 'Use the normal https port (443)');
  if (literalIp(url.hostname) && isPrivateAddress(literalIp(url.hostname))) throw fail(422, 'That address is on a private network');
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(url.hostname)) throw fail(422, 'That address is on a private network');
  if (url.toString().length > 500) throw fail(422, 'The address is too long');
  return url.toString();
}

// DNS lookup that refuses private answers, used for the actual connection.
function safeLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error);
    const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: options.family || 4 }];
    const bad = list.find((a) => isPrivateAddress(a.address));
    if (bad || !list.length) return callback(Object.assign(new Error('Refused: the address resolves to a private network'), { code: 'EPRIVATE' }));
    return options.all ? callback(null, list) : callback(null, list[0].address, list[0].family);
  });
}

const sign = (secret, timestamp, body) => crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');

function post(url, body, headers) {
  return new Promise((resolve) => {
    const started = Date.now();
    let target;
    try { target = new URL(url); } catch { resolve({ status: null, error: 'Bad address', ms: 0 }); return; }
    const ip = literalIp(target.hostname);
    if (target.protocol !== 'https:' || (ip && isPrivateAddress(ip))) { resolve({ status: null, error: 'Refused: private or non-https address', ms: 0 }); return; }
    let request = null;
    const deadline = setTimeout(() => request?.destroy(new Error('Timed out after 8 seconds')), TIMEOUT_MS);
    const finish = (result) => { clearTimeout(deadline); resolve(result); };
    request = https.request(url, {
      method: 'POST', lookup: safeLookup, timeout: TIMEOUT_MS,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'User-Agent': 'GreenTask-Webhooks/1.0', ...headers },
    }, (response) => {
      const status = response.statusCode;
      response.resume(); // the answer body is not needed
      response.on('end', () => finish({ status, ms: Date.now() - started }));
      response.on('error', () => finish({ status, ms: Date.now() - started }));
    });
    request.on('timeout', () => request.destroy(new Error('Timed out after 8 seconds')));
    request.on('error', (error) => finish({ status: null, error: String(error.message).slice(0, 300), ms: Date.now() - started }));
    request.end(body);
  });
}

const eventBody = (event, data) => JSON.stringify({ id: `evt_${crypto.randomBytes(8).toString('hex')}`, event, created_at: new Date().toISOString(), data });

// One signed attempt, recorded. A run of twenty failed attempts switches the webhook off.
async function send(hook, event, body, attempt = 1) {
  const secret = open(hook.secret);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const result = await post(hook.url, body, {
    'X-GreenTask-Event': event, 'X-GreenTask-Timestamp': timestamp, 'X-GreenTask-Delivery-Attempt': String(attempt),
    'X-GreenTask-Signature': `sha256=${sign(secret, timestamp, body)}`,
  });
  const ok = result.status >= 200 && result.status < 300;
  await db.execute('INSERT INTO webhook_deliveries (webhook_id, event, status_code, error, duration_ms) VALUES (?, ?, ?, ?, ?)',
    [hook.id, event, result.status, ok ? null : (result.error || `HTTP ${result.status}`), result.ms]);
  await db.execute(
    `UPDATE webhooks SET last_status = ?, last_delivery_at = SYSDATETIME(), failure_count = CASE WHEN ? = 1 THEN 0 ELSE failure_count + 1 END,
       is_active = CASE WHEN ? = 0 AND failure_count + 1 >= ? THEN 0 ELSE is_active END WHERE id = ?`,
    [result.status, ok ? 1 : 0, ok ? 1 : 0, DISABLE_AFTER, hook.id]
  );
  return { ok, ...result };
}

// Straight away, without the queue: used by "Send test".
const deliver = (hook, event, data) => send(hook, event, eventBody(event, data));

// Send what is due: new events and retries. Rows are claimed first, so two runs never send one twice.
async function processQueue() {
  await db.execute("UPDATE webhook_queue SET status = 'pending' WHERE status = 'sending' AND next_attempt_at < DATEADD(MINUTE, -10, SYSDATETIME())");
  const [claimed] = await db.execute(
    `UPDATE q SET status = 'sending', attempts = q.attempts + 1, next_attempt_at = SYSDATETIME()
     OUTPUT inserted.id, inserted.webhook_id, inserted.event, inserted.body, inserted.attempts
     FROM webhook_queue q
     WHERE q.status = 'pending'
       AND q.id IN (SELECT TOP 25 id FROM webhook_queue WITH (READPAST) WHERE status = 'pending' AND next_attempt_at <= SYSDATETIME() ORDER BY id)`
  );
  for (const item of claimed?.rows || []) {
    const [[hook]] = await db.execute('SELECT * FROM webhooks WHERE id = ?', [item.webhook_id]);
    if (!hook || !hook.is_active) { await db.execute("UPDATE webhook_queue SET status = 'dropped' WHERE id = ?", [item.id]); continue; }
    const result = await send(hook, item.event, item.body, item.attempts);
    if (result.ok) await db.execute("UPDATE webhook_queue SET status = 'sent', last_error = NULL WHERE id = ?", [item.id]);
    else {
      const wait = RETRY_SECONDS[item.attempts - 1];
      await db.execute(
        `UPDATE webhook_queue SET status = ?, last_error = ?, next_attempt_at = DATEADD(SECOND, ?, SYSDATETIME()) WHERE id = ?`,
        [wait ? 'pending' : 'failed', String(result.error || `HTTP ${result.status}`).slice(0, 300), wait || 0, item.id]
      );
    }
  }
  return (claimed?.rows || []).length;
}
let draining = false;
const drainSoon = () => setImmediate(async () => {
  if (draining) return;
  draining = true;
  try { await processQueue(); } catch (error) { console.error('[webhooks] queue', error.message); } finally { draining = false; }
});

// The task as integrations see it.
async function taskPayload(taskId) {
  const [[t]] = await db.execute(
    `SELECT t.id, t.title, t.description, t.status, t.priority, t.due_date, t.start_date, t.client_name, t.team_id, te.name AS team_name,
       t.assigned_to, u.name AS assigned_to_name, u.email AS assigned_to_email, u.login_code AS assigned_to_employee_code,
       t.external_source, t.external_id, t.created_at, t.updated_at, t.completed_at, t.org_id
     FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to LEFT JOIN teams te ON te.id = t.team_id WHERE t.id = ?`, [taskId]
  );
  return t || null;
}

// Called for every live task event (see websocket broadcast). Never throws, never slows the request.
function onTaskEvent(teamId, wsEvent, data) {
  const map = { task_created: 'task.created', task_updated: 'task.updated', task_deleted: 'task.deleted' };
  if (!map[wsEvent] || !data?.id) return;
  setImmediate(async () => {
    try {
      const task = await taskPayload(data.id);
      const orgId = task?.org_id || (await db.execute('SELECT org_id FROM teams WHERE id = ?', [teamId]))[0][0]?.org_id;
      if (!orgId || !await isModuleEnabled(orgId, 'developer_api')) return;
      const events = [map[wsEvent]];
      if (wsEvent === 'task_updated' && task?.status === 'DONE' && data.status === 'DONE') events.push('task.completed');
      const [hooks] = await db.execute('SELECT * FROM webhooks WHERE org_id = ? AND is_active = 1', [orgId]);
      const payload = task
        ? (({ org_id: _org, ...rest }) => ({ ...rest, assigned_to_email: isPlaceholderEmail(rest.assigned_to_email) ? null : rest.assigned_to_email }))(task)
        : { id: Number(data.id) };
      let queued = 0;
      for (const hook of hooks) {
        for (const event of events) {
          if (!String(hook.events).split(',').includes(event)) continue;
          await db.execute('INSERT INTO webhook_queue (webhook_id, event, body) VALUES (?, ?, ?)', [hook.id, event, eventBody(event, { task: payload })]);
          queued += 1;
        }
      }
      if (queued) drainSoon();
    } catch (error) { console.error('[webhooks]', error.message); }
  });
}

async function createWebhook(orgId, userId, body) {
  const name = String(body?.name || '').trim().slice(0, 100);
  if (!name) throw fail(422, 'Give the webhook a name');
  const url = checkUrl(body?.url);
  const events = [...new Set((Array.isArray(body?.events) ? body.events : []).filter((e) => EVENT_KEYS.includes(e)))];
  if (!events.length) throw fail(422, 'Choose at least one event');
  const [[{ count }]] = await db.execute('SELECT COUNT(*) AS count FROM webhooks WHERE org_id = ?', [orgId]);
  if (Number(count) >= 10) throw fail(409, 'A company can have 10 webhooks');
  const secret = `whsec_${crypto.randomBytes(24).toString('base64url')}`;
  const [created] = await db.execute('INSERT INTO webhooks (org_id, name, url, events, secret, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    [orgId, name, url, events.join(','), seal(secret), userId]);
  return { id: created.insertId, secret };
}

module.exports = { EVENTS, EVENT_KEYS, RETRY_SECONDS, isPrivateAddress, literalIp, checkUrl, safeLookup, sign, send, deliver, processQueue, onTaskEvent, createWebhook, taskPayload };
