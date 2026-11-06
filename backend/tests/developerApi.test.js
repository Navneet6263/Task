const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../src/config/database');
const keys = require('../src/services/apiKeys');
const hooks = require('../src/services/webhooks');

process.env.JWT_SECRET = 'developer-test-only';

async function serve(t, router) {
  const app = express(); app.set('trust proxy', 1); app.use(express.json()); app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  return (path, { method = 'GET', body, headers = {} } = {}) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { 'content-type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}),
  }).then(async (r) => ({ status: r.status, body: await r.json(), headers: r.headers }));
}

test('keys are long random secrets; only a SHA-256 and a public prefix are kept', () => {
  const a = keys.generateKey();
  const b = keys.generateKey();
  assert.match(a.key, /^gt_live_[a-f0-9]{12}_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a.key, b.key);
  assert.equal(keys.prefixOf(a.key), a.prefix);
  assert.equal(a.hash, keys.sha256(a.key));
  assert.ok(!a.hash.includes(a.key.split('_').pop()));
  assert.equal(keys.prefixOf('gt_live_123'), null);
  assert.equal(keys.prefixOf(`${a.key}x`), null);
});

test('IP allowlists accept addresses and IPv4 ranges, and refuse anything else', () => {
  assert.deepEqual(keys.parseAllowedIps('203.0.113.7, 198.51.100.0/24'), ['203.0.113.7', '198.51.100.0/24']);
  assert.throws(() => keys.parseAllowedIps('example.com'), /not an IP/);
  assert.throws(() => keys.parseAllowedIps('10.0.0.0/4'), /not an IP/);
  assert.equal(keys.ipAllowed('198.51.100.42', ['198.51.100.0/24']), true);
  assert.equal(keys.ipAllowed('::ffff:203.0.113.7', ['203.0.113.7']), true);
  assert.equal(keys.ipAllowed('203.0.113.8', ['203.0.113.7']), false);
  assert.equal(keys.ipAllowed('1.2.3.4', []), true);
});

test('each key gets a fixed number of calls a minute, counted in the database for every process', async (t) => {
  const now = Date.UTC(2026, 0, 1, 10, 0, 5);
  let left;
  for (let i = 0; i < keys.RATE_PER_MINUTE; i += 1) left = keys.takeLocalToken('rate-test', now);
  assert.equal(left, 0);
  assert.ok(keys.takeLocalToken('rate-test', now) < 0);
  assert.equal(keys.takeLocalToken('rate-test', now + 60000), keys.RATE_PER_MINUTE - 1, 'a new minute starts fresh');
  let used = 0;
  t.mock.method(db, 'execute', async (sql, params) => { assert.match(sql, /^MERGE api_rate_windows WITH \(HOLDLOCK\)/); assert.equal(params[1], Math.floor(now / 60000)); used += 1; return [{ rows: [{ used }] }]; });
  assert.equal(await keys.takeToken(9, now), keys.RATE_PER_MINUTE - 1);
  assert.equal(await keys.takeToken(9, now), keys.RATE_PER_MINUTE - 2);
});

// One fake company (org 1) with a key, an admin, two teams and people; org 2 is someone else.
function fakeDb(t, overrides = {}) {
  const { key, prefix, hash } = keys.generateKey();
  const state = {
    key: { id: 3, org_id: 1, name: 'CRM', key_prefix: prefix, key_hash: hash, scopes: 'tasks:read,tasks:write,users:read', allowed_ips: null,
      created_by: 10, revoked_at: null, expires_at: null, user_deleted: false, user_role: 'admin', ...overrides.key },
    enabled: overrides.enabled ?? true,
    writes: [],
  };
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.includes('FROM api_keys k JOIN users u')) return [[params[0] === state.key.key_prefix ? state.key : undefined].filter(Boolean)];
    if (sql.startsWith('SELECT is_enabled FROM org_modules')) return [[{ is_enabled: state.enabled }]];
    if (sql.startsWith('INSERT INTO api_request_logs') || sql.startsWith('UPDATE api_keys')) return [{}];
    if (sql.startsWith('SELECT id, name FROM teams WHERE org_id')) return [params[0] === 1 ? [{ id: 7, name: 'Payroll' }, { id: 8, name: 'Audit' }] : []];
    if (sql.startsWith('SELECT u.id FROM users u WHERE u.email')) return [params[0] === 'asha@acme.com' && params[1] === 1 ? [{ id: 12 }] : []];
    if (sql.startsWith('SELECT u.id FROM users u WHERE u.login_code')) return [[]];
    if (sql.startsWith('SELECT id FROM team_members')) return [params[1] === 12 ? [{ id: 1 }] : []];
    if (sql.startsWith('SELECT id, team_id FROM tasks WHERE org_id = ? AND external_source')) return [overrides.existing ? [overrides.existing] : []];
    if (sql.startsWith('INSERT INTO tasks')) { state.writes.push({ sql, params }); return [{ insertId: 500 }]; }
    if (sql.startsWith('UPDATE tasks SET')) { state.writes.push({ sql, params }); return [{ affectedRows: 1 }]; }
    if (sql.includes('FROM tasks t LEFT JOIN users u')) return [[{ id: params[0], title: 'X', status: 'TODO', org_id: 1, assigned_to_email: 'asha@acme.com' }]];
    if (sql.startsWith('SELECT task_prefix')) return [[{ company_code: 'ORG-ACCO-1AB' }]];
    if (sql.startsWith('SELECT id, team_id, status FROM tasks WHERE id = ? AND org_id = ?')) return [params[1] === 1 && params[0] === 77 ? [{ id: 77, team_id: 7 }] : []];
    return [[]];
  });
  return { key, state };
}
const auth = (key) => ({ authorization: `Bearer ${key}` });

test('the API refuses wrong, revoked, expired, switched-off, foreign-IP and orphaned keys', async (t) => {
  const send = await serve(t, require('../src/routes/publicApi'));
  const ok = fakeDb(t);
  assert.equal((await send('/me')).status, 401);
  assert.equal((await send('/me', { headers: auth(`${ok.key.slice(0, -1)}A`) })).body.error.code, 'invalid_key');
  assert.equal((await send('/me', { headers: auth(ok.key) })).status, 200);

  const cases = [
    [{ key: { revoked_at: new Date() } }, 401, 'revoked_key'],
    [{ key: { expires_at: new Date(Date.now() - 1000) } }, 401, 'expired_key'],
    [{ enabled: false }, 403, 'api_disabled'],
    [{ key: { allowed_ips: '203.0.113.7' } }, 403, 'ip_not_allowed'],
    [{ key: { user_deleted: true } }, 401, 'owner_removed'],
    [{ key: { user_role: 'manager' } }, 401, 'owner_not_admin'],
  ];
  for (const [setup, status, code] of cases) {
    t.mock.restoreAll();
    const { key } = fakeDb(t, setup);
    const r = await send('/me', { headers: auth(key) });
    assert.equal(r.status, status, code);
    assert.equal(r.body.error.code, code);
  }
});

test('permissions are enforced per key', async (t) => {
  const send = await serve(t, require('../src/routes/publicApi'));
  const { key } = fakeDb(t, { key: { scopes: 'tasks:read' } });
  assert.equal((await send('/tasks', { method: 'POST', headers: auth(key), body: { title: 'X' } })).body.error.code, 'missing_scope');
  assert.equal((await send('/users', { headers: auth(key) })).status, 403);
});

test('creating a task: only this company\'s teams and people, and the same external id updates instead of duplicating', async (t) => {
  const send = await serve(t, require('../src/routes/publicApi'));
  let { key, state } = fakeDb(t);
  const created = await send('/tasks', { method: 'POST', headers: auth(key), body: { title: 'Call client', team: 'payroll', assignee: { email: 'asha@acme.com' }, external_id: 'TCK-1', source: 'CRM', due_date: '2026-11-30' } });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.key, 'ACCO-500');
  const insert = state.writes[0];
  assert.deepEqual([insert.params[4], insert.params[5], insert.params[6], insert.params[7]], [12, 10, 7, 1], 'assignee, created as the key owner, team, company');
  assert.deepEqual(insert.params.slice(-2), ['crm', 'TCK-1']);

  assert.equal((await send('/tasks', { method: 'POST', headers: auth(key), body: { title: 'X', team: 'Somebody else' } })).body.error.code, 'unknown_team');
  assert.equal((await send('/tasks', { method: 'POST', headers: auth(key), body: { title: 'X', team: 7, assignee: 'stranger@other.com' } })).body.error.code, 'unknown_assignee');
  assert.equal((await send('/tasks', { method: 'POST', headers: auth(key), body: { team: 7 } })).body.error.code, 'title_required');
  assert.equal((await send('/tasks', { method: 'POST', headers: auth(key), body: { title: 'X', team: 7, due_date: '30/11/2026' } })).body.error.code, 'invalid_date');
  assert.equal((await send('/tasks/999', { headers: auth(key) })).status, 404, 'a task of another company is not found');

  t.mock.restoreAll();
  ({ key, state } = fakeDb(t, { existing: { id: 77, team_id: 7 } }));
  const again = await send('/tasks', { method: 'POST', headers: auth(key), body: { title: 'Call client again', external_id: 'TCK-1', source: 'crm', status: 'DONE' } });
  assert.equal(again.status, 200);
  assert.equal(again.body.created, false);
  assert.ok(state.writes.every((w) => !w.sql.startsWith('INSERT INTO tasks')));
  assert.match(state.writes[0].sql, /^UPDATE tasks SET title = \?, status = \?, completed_at = CASE/);
});

test('webhooks only call public https addresses, even if a name later points somewhere private', async () => {
  ['10.0.0.5', '127.0.0.1', '169.254.169.254', '172.20.1.1', '192.168.1.9', '100.64.0.1', '::1', 'fd00::1', '::ffff:127.0.0.1'].forEach((ip) => assert.equal(hooks.isPrivateAddress(ip), true, ip));
  ['8.8.8.8', '203.0.113.9', '2606:4700::1111'].forEach((ip) => assert.equal(hooks.isPrivateAddress(ip), false, ip));
  assert.throws(() => hooks.checkUrl('http://crm.example.com/hook'), /https/);
  assert.throws(() => hooks.checkUrl('https://169.254.169.254/latest/meta-data'), /private/);
  assert.throws(() => hooks.checkUrl('https://localhost/hook'), /private/);
  assert.throws(() => hooks.checkUrl('https://user:pass@crm.example.com/hook'), /password/);
  assert.throws(() => hooks.checkUrl('https://crm.example.com:8443/hook'), /443/);
  assert.equal(hooks.checkUrl('https://crm.example.com/hooks/greentask'), 'https://crm.example.com/hooks/greentask');
  const resolved = await new Promise((resolve) => hooks.safeLookup('localhost', {}, (error) => resolve(error)));
  assert.equal(resolved.code, 'EPRIVATE');
});

test('webhook signatures are HMAC-SHA256 over the timestamp and body', () => {
  const crypto = require('crypto');
  const expected = crypto.createHmac('sha256', 'whsec_x').update('1700000000.{"a":1}').digest('hex');
  assert.equal(hooks.sign('whsec_x', '1700000000', '{"a":1}'), expected);
});

test('only admins of the organization manage keys and webhooks', async (t) => {
  const send = await serve(t, require('../src/routes/developer'));
  t.mock.method(db, 'execute', async () => [[]]);
  const token = (identity) => ({ authorization: `Bearer ${jwt.sign(identity, process.env.JWT_SECRET)}` });
  assert.equal((await send('/keys', { headers: token({ id: 5, role: 'manager', org_id: 1 }) })).status, 403);
  assert.equal((await send('/keys', { method: 'POST', headers: token({ id: 5, role: 'person', org_id: 1 }), body: { name: 'x' } })).status, 403);
  assert.equal((await send('/webhooks', { headers: token({ id: 5, role: 'company_admin', company_admin_id: 9, org_id: 1 }) })).status, 403, 'a company admin of another company');
});
