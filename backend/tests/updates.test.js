const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../src/config/database');
const router = require('../src/routes/updates');
const update = { id: 7, title: 'Saved views', version: 2 };
const report = { update_id: 7, update_version: 2, assigned_to: 20, title: 'Cannot save', description: 'Save fails', request_key: 'report-test-key-12345' };
const publication = { title: 'New filters', summary: 'Multiple choices', why_text: 'Find work', how_text: 'Open filters' };

async function client(t, identity = { id: 10, role: 'member', org_id: 1 }) {
  process.env.JWT_SECRET = 'updates-test-only';
  const app = express(); app.use(express.json()); app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const token = jwt.sign(identity, process.env.JWT_SECRET);
  return (path, method = 'GET', body) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
function mockDb(t, handle, role = 'member') {
  const calls = [];
  t.mock.method(db, 'execute', async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT u.id, u.role FROM users')) return [[{ id: 10, role }]];
    return handle(sql, params);
  });
  return calls;
}

test('employees and managers cannot publish or edit, even with a forged can_publish body', async t => {
  const calls = mockDb(t, () => { throw Error('Unexpected query'); });
  const send = await client(t);
  assert.equal((await send('/', 'POST', { ...publication, can_publish: true })).status, 403);
  assert.equal((await send('/7', 'PUT', { ...publication, version: 2 })).status, 403);
  assert.equal(calls.every(call => call.sql.startsWith('SELECT u.id, u.role')), true);
});

test('an admin whose live role was revoked cannot publish using an old token', async t => {
  mockDb(t, () => [[]], 'member');
  const send = await client(t, { id: 10, role: 'admin', org_id: 1 });
  assert.equal((await send('/', 'POST', publication)).status, 403);
});

test('missing current organization membership denies every updates route', async t => {
  t.mock.method(db, 'execute', async () => [[]]);
  const send = await client(t);
  for (const path of ['/', '/summary', '/reports', '/reports/1', '/reports/assignees'])
    assert.equal((await send(path)).status, 403);
});

test('admin publishing uses server organization and author, not user supplied ownership', async t => {
  let values;
  mockDb(t, async (sql, params) => { assert.match(sql, /INSERT INTO workspace_updates/); values = params; return [{ insertId: 8 }]; }, 'admin');
  const send = await client(t, { id: 10, role: 'admin', org_id: 1 });
  assert.equal((await send('/', 'POST', { ...publication, org_id: 999, created_by: 999 })).status, 201);
  assert.deepEqual(values.slice(-2), [1, 10]);
});

test('publishing validates fields and editing requires an atomic version match', async t => {
  let write;
  mockDb(t, async (sql, params) => { write = { sql, params }; return [{ affectedRows: 0 }]; }, 'admin');
  const send = await client(t, { id: 10, role: 'admin', org_id: 1 });
  assert.equal((await send('/', 'POST', { ...publication, title: ' '.repeat(3) })).status, 422);
  assert.equal((await send('/7', 'PUT', { ...publication, version: 2 })).status, 409);
  assert.match(write.sql, /WHERE id = \? AND created_by = \? AND version = \?/);
  assert.deepEqual(write.params.slice(-3), [7, 10, 2]);
});

test('private report submission creates only a private task, with validated assignee and update snapshot', async t => {
  let inserted;
  const calls = mockDb(t, async (sql, params) => {
    if (sql.startsWith('SELECT id, update_id')) return [[]];
    if (sql.startsWith('SELECT id, title, version')) return [[update]];
    if (sql.startsWith('SELECT u.id FROM users')) return [[{ id: 20 }]];
    if (sql.startsWith('INSERT INTO update_report_tasks')) { inserted = params; return [{ insertId: 45 }]; }
    throw Error('Unexpected query');
  });
  const send = await client(t);
  const response = await send('/reports', 'POST', { ...report, org_id: 3, reported_by: 5, status: 'DONE' });
  assert.equal(response.status, 201);
  assert.deepEqual(inserted.slice(0, 6), [1, 7, 'Saved views', 2, 10, 20]);
  assert.equal(calls.some(({ sql }) => /INSERT INTO (tasks|notifications|activity_logs)/.test(sql)), false);
  assert.deepEqual(Object.keys(await response.json()).sort(), ['id', 'message']);
});

test('cross-organization or inactive assignees, missing selection and changed releases are rejected', async t => {
  mockDb(t, async sql => sql.startsWith('SELECT id, title, version') ? [[update]] : [[]]);
  const send = await client(t);
  assert.equal((await send('/reports', 'POST', { ...report, assigned_to: null })).status, 422);
  assert.equal((await send('/reports', 'POST', report)).status, 422);
  assert.equal((await send('/reports', 'POST', { ...report, update_version: 1 })).status, 409);
});

test('a missing release ID cannot be reported', async t => {
  const calls = mockDb(t, () => [[]]);
  const send = await client(t);
  assert.equal((await send('/reports', 'POST', report)).status, 404);
  assert.equal(calls.some(({ sql }) => sql.startsWith('INSERT')), false);
});

test('retrying a successful report returns just its receipt and does not insert twice', async t => {
  const calls = mockDb(t, async () => [[{ ...report, id: 45, steps: '', priority: 'MEDIUM' }]]);
  const send = await client(t);
  const response = await send('/reports', 'POST', report);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).id, 45);
  assert.equal(calls.some(({ sql }) => sql.startsWith('INSERT')), false);
});

test('retrying with a changed assignee cannot falsely confirm a different recipient', async t => {
  mockDb(t, async () => [[{ ...report, id: 45, steps: '', priority: 'MEDIUM' }]]);
  const send = await client(t);
  assert.equal((await send('/reports', 'POST', { ...report, assigned_to: 30 })).status, 409);
});

test('report reads are assignee-only, including for reporter, other admins, and another organization', async t => {
  mockDb(t, async (sql, params) => {
    assert.match(sql, /WHERE id = \? AND org_id = \? AND assigned_to = \?/);
    return params[1] === 1 && params[2] === 20 ? [[{ id: 45, description: 'Private' }]] : [[]];
  }, 'admin');
  for (const identity of [{ id: 10, role: 'member', org_id: 1 }, { id: 30, role: 'admin', org_id: 1 }, { id: 20, role: 'admin', org_id: 2 }]) {
    const send = await client(t, identity);
    assert.equal((await send('/reports/45')).status, 404);
  }
  const assignee = await client(t, { id: 20, role: 'admin', org_id: 1 });
  assert.equal((await assignee('/reports/45')).status, 200);
});

test('list, counts and summary apply assignee scope without any admin override', async t => {
  const calls = mockDb(t, async sql => sql.startsWith('SELECT r.*') ? [[]] : [[{ total: 0, unread: 2, reports: 0 }]], 'admin');
  const send = await client(t, { id: 30, role: 'admin', org_id: 1 });
  assert.equal((await send('/reports?page=2&status=DONE')).status, 200);
  assert.equal((await send('/summary')).status, 200);
  const scoped = calls.filter(({ sql }) => sql.includes('FROM update_report_tasks'));
  assert.equal(scoped.length, 3);
  scoped.forEach(({ sql }) => assert.match(sql, /assigned_to = \?/));
  assert.deepEqual(scoped[0].params, [1, 30, 'DONE', 20]);
});

test('report writes require assignee, org and version; changing ownership is forbidden', async t => {
  let write;
  mockDb(t, async (sql, params) => { write = { sql, params }; return [{ affectedRows: 0 }]; });
  const send = await client(t);
  assert.equal((await send('/reports/45', 'PATCH', { status: 'DONE', version: 1, assigned_to: 10 })).status, 422);
  assert.equal((await send('/reports/45', 'PATCH', { status: 'DONE', version: 1 })).status, 409);
  assert.match(write.sql, /WHERE id = \? AND org_id = \? AND assigned_to = \? AND version = \?/);
  assert.deepEqual(write.params.slice(-4), [45, 1, 10, 1]);
});

test('global guide read markers are persisted per user and release version', async t => {
  let merge;
  mockDb(t, async (sql, params) => { merge = { sql, params }; return [{ affectedRows: 1 }]; });
  const send = await client(t);
  assert.equal((await send('/7/read', 'POST', { version: 2 })).status, 200);
  assert.match(merge.sql, /WITH \(HOLDLOCK\)/);
  assert.match(merge.sql, /WHERE id = \? AND version = \?/);
  assert.deepEqual(merge.params, [10, 2, 7, 2]);
});

test('product feed is global, uses explicit UTC strings, and limits editing to the author', async t => {
  let params;
  mockDb(t, async (sql, values) => {
    if (sql.startsWith('SELECT w.*')) {
      assert.doesNotMatch(sql, /WHERE w.org_id/); params = values;
      return [[{ id: 7, created_by: 30, published_utc: '2026-08-26T10:47:07Z', updated_utc: '2026-08-26T10:47:07Z' }]];
    }
    return [[{ total: 1 }]];
  }, 'admin');
  const send = await client(t, { id: 10, role: 'admin', org_id: 2 });
  const data = await (await send('/')).json();
  assert.equal(data.data[0].published_at, '2026-08-26T10:47:07Z');
  assert.equal(data.data[0].can_edit, false);
  assert.deepEqual(params, [10, 0]);
});

test('release notes cover exactly the last two recorded pushes with valid field sizes', () => {
  const notes = require('../src/bootstrap/releaseNotes');
  assert.deepEqual(notes.map(note => note.key), ['push-4c7ddb8', 'push-ef9dd80']);
  for (const note of notes) {
    assert(note.title.length <= 160 && note.how_text.length <= 5000);
    assert(note.summary.length <= 3000 && note.why_text.length <= 3000 && note.performance_text.length <= 3000);
    assert(note.how_text.includes('Show results'));
  }
});

test('Updates migration uses MAX instead of invalid SQL Server NVARCHAR lengths', async t => {
  const statements = [];
  t.mock.method(db, 'execute', async sql => { statements.push(sql); return [{ affectedRows: 0 }]; });
  t.mock.method(db, 'query', async sql => { statements.push(sql); return [{ affectedRows: 0 }]; });
  await require('../src/bootstrap/updatesSchema').ensureUpdatesSchema();
  assert.match(statements.join('\n'), /how_text NVARCHAR\(MAX\)/);
  for (const match of statements.join('\n').matchAll(/NVARCHAR\((\d+)\)/g)) assert(Number(match[1]) <= 4000);
});

test('all guide keys are unique, valid length, and current-build guides are not backdated', () => {
  const current = require('../src/bootstrap/workspaceReleaseNotes');
  const all = [...require('../src/bootstrap/releaseNotes'), ...require('../src/bootstrap/earlierReleaseNotes'), ...current];
  assert.equal(new Set(all.map(note => note.key)).size, all.length);
  for (const note of all) {
    assert(note.key.length <= 80 && note.title.length <= 160 && note.summary.length <= 3000);
    assert(note.why_text.length <= 3000 && note.how_text.length <= 5000 && note.performance_text.length <= 3000);
  }
  assert(current.every(note => note.releasedAt === null));
});
