const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const db = require('../src/config/database');
const keys = require('../src/services/apiKeys');
const inbound = require('../src/services/inboundHooks');

process.env.JWT_SECRET = 'developer-extras-test-only';

async function serve(t, router) {
  const app = express(); app.set('trust proxy', 1); app.use(express.json()); app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  return (path, { method = 'GET', body, headers = {} } = {}) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { 'content-type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
}

test('test keys look different and run every check, but never save or announce anything', async (t) => {
  const { key, prefix, hash } = keys.generateKey('test');
  assert.match(key, /^gt_test_/);
  assert.equal(keys.prefixOf(key), prefix);
  const writes = [];
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.includes('FROM api_keys k JOIN users u')) return [[{ id: 4, org_id: 1, name: 'Try', key_prefix: prefix, key_hash: hash, scopes: 'tasks:write', mode: 'test', created_by: 10, user_role: 'admin' }]];
    if (sql.startsWith('SELECT is_enabled FROM org_modules')) return [[{ is_enabled: true }]];
    if (sql.startsWith('MERGE')) return [{ rows: [{ used: 1 }] }];
    if (sql.startsWith('SELECT id, name FROM teams')) return [[{ id: 7, name: 'Payroll' }]];
    if (/^(INSERT|UPDATE|DELETE)/.test(sql) && !sql.includes('api_request_logs') && !sql.startsWith('UPDATE api_keys')) writes.push(sql);
    return [[]];
  });
  const send = await serve(t, require('../src/routes/publicApi'));
  const r = await send('/tasks', { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: { title: 'Dry run', due_date: '2026-11-30' } });
  assert.equal(r.status, 201);
  assert.equal(r.body.test, true);
  assert.equal(r.body.data.team_id, 7);
  assert.deepEqual(writes, [], 'nothing is written in test mode');
  const bad = await send('/tasks', { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: { title: 'X', priority: 'URGENT' } });
  assert.equal(bad.body.error.code, 'invalid_priority', 'test mode still checks everything');
});

test('rotating a key keeps its settings and gives the old one 24 hours', async (t) => {
  const calls = [];
  t.mock.method(db, 'execute', async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT * FROM api_keys')) return [[{ id: 3, name: 'CRM', scopes: 'tasks:read', allowed_ips: '203.0.113.7', mode: 'live', expires_at: null, replaced_by: null }]];
    if (sql.startsWith('INSERT INTO api_keys')) return [{ insertId: 9 }];
    return [{ affectedRows: 1 }];
  });
  const result = await keys.rotateKey(1, 10, 3);
  assert.match(result.key, /^gt_live_/);
  const insert = calls.find((c) => c.sql.startsWith('INSERT INTO api_keys'));
  assert.deepEqual([insert.params[1], insert.params[4], insert.params[5]], ['CRM', 'tasks:read', '203.0.113.7']);
  const old = calls.find((c) => c.sql.startsWith('UPDATE api_keys SET replaced_by'));
  assert.match(old.sql, /DATEADD\(HOUR, 24/);
  assert.deepEqual(old.params, [9, 3]);
});

test('failed webhooks wait 1 min, 5 min, 30 min, 2 h, 6 h, then give up', async (t) => {
  const hooks = require('../src/services/webhooks');
  assert.deepEqual(hooks.RETRY_SECONDS, [60, 300, 1800, 7200, 21600]);
  const { seal } = require('../src/services/secretBox');
  const updates = [];
  let attempts = 1;
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('UPDATE q SET status')) return [{ rows: [{ id: 50, webhook_id: 2, event: 'task.created', body: '{"id":"evt_1"}', attempts }] }];
    if (sql.startsWith('SELECT * FROM webhooks')) return [[{ id: 2, url: 'https://localhost/never', secret: seal('whsec_x'), is_active: 1, failure_count: 0 }]];
    if (sql.startsWith('UPDATE webhook_queue SET status = ?')) updates.push(params);
    return [{ affectedRows: 1 }];
  });
  await hooks.processQueue();
  assert.deepEqual([updates[0][0], updates[0][2]], ['pending', 60], 'first failure: try again in a minute');
  attempts = 6; updates.length = 0;
  await hooks.processQueue();
  assert.equal(updates[0][0], 'failed', 'after the sixth try it stops');
});

test('incoming connections read any JSON shape and turn their words into ours', () => {
  const record = { ticket: { subject: 'Printer jam', id: 'T-9', due: '2026-11-30T10:00:00Z', owner: { mail: 'asha@acme.com' }, state: 'Resolved', tags: ['IT', 'Office'] } };
  assert.equal(inbound.getPath(record, 'ticket.owner.mail'), 'asha@acme.com');
  assert.equal(inbound.getPath({ items: [{ name: 'A' }] }, 'items[0].name'), 'A');
  assert.equal(inbound.getPath(record, 'ticket.__proto__.x'), undefined);
  assert.ok(inbound.flattenPaths(record).some((p) => p.path === 'ticket.owner.mail' && p.sample === 'asha@acme.com'));
  const hook = { source: 'helpdesk', team_id: 7, required: ['due_date'], mapping: { title: 'ticket.subject', external_id: 'ticket.id', due_date: 'ticket.due', assignee: 'ticket.owner.mail', status: 'ticket.state', labels: 'ticket.tags' } };
  const { body, problems } = inbound.mapRecord(record, hook);
  assert.deepEqual(problems, []);
  assert.deepEqual(body, { source: 'helpdesk', team: 7, title: 'Printer jam', external_id: 'T-9', assignee: 'asha@acme.com', due_date: '2026-11-30', status: 'DONE', labels: ['IT', 'Office'] });
  assert.deepEqual(inbound.mapRecord({ ticket: { subject: 'X' } }, hook).problems, ['Due date is empty']);
  assert.throws(() => inbound.readMapping({ mapping: { title: 'a;DROP TABLE' } }), /not a field path/);
});

test('incoming addresses: wrong tokens learn nothing, the first call is a sample, then records become tasks', async (t) => {
  const { token, prefix, hash } = inbound.generateToken();
  let hook = { id: 5, org_id: 1, name: 'Helpdesk', source: 'helpdesk', token_prefix: prefix, token_hash: hash, team_id: 7, mapping: '{}', required_fields: '[]', listening: 1, is_active: 1, created_by: 10, user_role: 'admin' };
  const saved = [];
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.includes('FROM inbound_hooks h JOIN users u')) return [[params[0] === hook.token_prefix ? hook : undefined].filter(Boolean)];
    if (sql.startsWith('SELECT is_enabled FROM org_modules')) return [[{ is_enabled: true }]];
    if (sql.startsWith('MERGE')) return [{ rows: [{ used: 1 }] }];
    if (sql.startsWith('UPDATE inbound_hooks SET sample')) { saved.push(params[0]); return [{}]; }
    if (sql.startsWith('SELECT id, team_id FROM tasks WHERE org_id = ? AND external_source')) return [[]];
    if (sql.startsWith('SELECT id, name FROM teams')) return [[{ id: 7, name: 'Payroll' }]];
    if (sql.startsWith('INSERT INTO tasks')) { saved.push(params); return [{ insertId: 600 }]; }
    if (sql.startsWith('SELECT task_prefix')) return [[{ company_code: 'ORG-ACCO-1' }]];
    if (sql.includes('FROM tasks t LEFT JOIN users u')) return [[{ id: 600, title: 'Printer jam', org_id: 1 }]];
    return [[]];
  });
  const send = await serve(t, require('../src/routes/publicApi'));
  const wrong = await send(`/inbound/${prefix}_${'x'.repeat(32)}`, { method: 'POST', body: { a: 1 } });
  const junk = await send('/inbound/hello', { method: 'POST', body: { a: 1 } });
  assert.deepEqual([wrong.status, junk.status], [404, 404]);
  assert.deepEqual(wrong.body, junk.body, 'a near-miss and nonsense look the same');

  const sample = await send(`/inbound/${token}`, { method: 'POST', body: { ticket: { subject: 'Printer jam', id: 'T-9' } } });
  assert.equal(sample.status, 202);
  assert.match(saved[0], /Printer jam/);

  hook = { ...hook, listening: 0, mapping: JSON.stringify({ title: 'ticket.subject', external_id: 'ticket.id' }) };
  const live = await send(`/inbound/${token}`, { method: 'POST', body: [{ ticket: { subject: 'Printer jam', id: 'T-9' } }, { ticket: {} }] });
  assert.equal(live.status, 207, 'one created, one skipped');
  assert.equal(live.body.results[0].ok, true);
  assert.equal(live.body.results[1].ok, false);
  const insert = saved.find((p) => Array.isArray(p));
  assert.deepEqual([insert[0], insert[5], insert[6], insert[7], insert[11], insert[12]], ['Printer jam', 10, 7, 1, 'helpdesk', 'T-9']);
});

test('the OpenAPI description is public and lists every endpoint', async (t) => {
  t.mock.method(db, 'execute', async () => [[]]);
  const send = await serve(t, require('../src/routes/publicApi'));
  const r = await send('/openapi.json');
  assert.equal(r.status, 200);
  assert.equal(r.body.openapi, '3.0.3');
  ['/me', '/users', '/teams', '/tasks', '/tasks/{id}', '/tasks/{id}/comments'].forEach((path) => assert.ok(r.body.paths[path], path));
  assert.equal((await send('/tasks')).status, 401, 'everything else still needs a key');
});

test('webhook addresses written as raw IPv6 or NAT64 are refused, and only pending rows are ever claimed', async (t) => {
  const hooks = require('../src/services/webhooks');
  ['https://[::1]/x', 'https://[fd00::1]/x', 'https://2130706433/x', 'https://[64:ff9b::7f00:1]/x'].forEach((url) => assert.throws(() => hooks.checkUrl(url), /private/, url));
  let claim;
  t.mock.method(db, 'execute', async (sql) => { if (sql.startsWith('UPDATE q SET status')) claim = sql; return [{ rows: [] }]; });
  await hooks.processQueue();
  assert.match(claim, /WHERE q\.status = 'pending'\s+AND q\.id IN/);
});
