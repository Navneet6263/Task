const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../src/config/database');

process.env.JWT_SECRET = 'send-back-test-only';

async function client(t, identity) {
  const app = express(); app.use(express.json()); app.use(require('../src/routes/tasks/sendBack'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const token = jwt.sign(identity, process.env.JWT_SECRET);
  return async (path, method = 'GET', body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  };
}

// Task 40 in team 2 is assigned to person 5 (Asha); Ravi (9) gave it to her; Meera (7) leads the team.
function fakeDb(t, { task = {}, inTeam = true, leader = { id: 7, name: 'Meera' }, bugTracking = false, updated = 1 } = {}) {
  const calls = [];
  t.mock.method(db, 'execute', async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('FROM tasks t LEFT JOIN teams te ON te.id = t.team_id WHERE t.id = ?')) return [[{ id: 40, title: 'VAT return for Acme', team_id: 2, org_id: 8, status: 'IN_PROGRESS', issue_type: 'task', assigned_to: 5, assigned_by: 9, version: 3, team_name: 'Accounts', ...task }]];
    if (sql.includes('FROM team_members tm') && sql.includes('tm.user_id = ?')) return [inTeam ? [{ id: 1 }] : []];
    if (sql.startsWith('SELECT id, name FROM users WHERE id = ?')) return [Number(params[0]) === 9 ? [{ id: 9, name: 'Ravi' }] : []];
    if (sql.includes('tm.is_reporting_manager = 1')) return [leader ? [leader] : []];
    if (sql.startsWith('SELECT name FROM users WHERE id = ?')) return [[{ name: 'Asha' }]];
    if (sql.includes('FROM org_modules')) return [[{ is_enabled: bugTracking }]];
    if (sql.startsWith('UPDATE tasks SET assigned_to')) return [{ affectedRows: updated }];
    if (sql.startsWith('INSERT') || sql.startsWith('UPDATE')) return [{ affectedRows: 1 }];
    return [[]];
  });
  return calls;
}

test('the assignee sends a task back to whoever gave it, with the reason as a comment and a notification', async (t) => {
  const calls = fakeDb(t);
  const send = await client(t, { id: 5, role: 'person', org_id: 8 });
  const info = await send('/40/send-back');
  assert.deepEqual(info.body, { allowed: true, to: { id: 9, name: 'Ravi' } });

  const done = await send('/40/send-back', 'POST', { reason: '  This is payroll work,   I do VAT.  ', version: 3 });
  assert.equal(done.status, 200);
  assert.equal(done.body.message, 'Sent back to Ravi.');
  const update = calls.find((c) => c.sql.startsWith('UPDATE tasks SET assigned_to'));
  assert.deepEqual(update.params, [9, 5, 9, 'This is payroll work, I do VAT.', 40, 5], 'back to Ravi, only while still Asha\'s');
  assert.match(update.sql, /status = CASE WHEN status = 'IN_PROGRESS' THEN 'TODO'/, 'nobody is working on it any more');
  assert.deepEqual(calls.find((c) => c.sql.startsWith('INSERT INTO task_comments')).params, [40, 5, 'Sent back to Ravi: This is payroll work, I do VAT.']);
  const note = calls.find((c) => c.sql.startsWith('INSERT INTO notifications'));
  assert.equal(note.params[0], 9);
  assert.match(note.params[2], /^Asha sent back "VAT return for Acme": This is payroll work/);
  const history = calls.find((c) => c.sql.startsWith('INSERT INTO audit_logs'));
  assert.equal(history.params[3], 'Task Sent Back');
  assert.deepEqual(JSON.parse(history.params[5]).assigned_to, { before: 5, after: 9 });
});

test('a task nobody assigned (email, API) goes to the team leader; with no leader it cannot be sent back', async (t) => {
  let calls = fakeDb(t, { task: { assigned_by: null } });
  let send = await client(t, { id: 5, role: 'person', org_id: 8 });
  assert.equal((await send('/40/send-back', 'POST', { reason: 'Wrong team for this one' })).body.message, 'Sent back to Meera.');
  assert.equal(calls.find((c) => c.sql.startsWith('UPDATE tasks SET assigned_to')).params[0], 7);
  t.mock.restoreAll();

  calls = fakeDb(t, { task: { assigned_by: 5 }, leader: null });
  send = await client(t, { id: 5, role: 'person', org_id: 8 });
  const none = await send('/40/send-back', 'POST', { reason: 'Wrong team for this one' });
  assert.equal(none.status, 409, 'a task she gave herself, and no leader');
  assert.equal(calls.filter((c) => c.sql.startsWith('UPDATE')).length, 0);
});

test('only the assignee, with a real reason, on an open task they can see', async (t) => {
  let calls = fakeDb(t);
  let send = await client(t, { id: 6, role: 'person', org_id: 8 });
  assert.equal((await send('/40/send-back', 'POST', { reason: 'Not my work at all' })).status, 403, 'someone else\'s task');
  send = await client(t, { id: 5, role: 'person', org_id: 8 });
  const short = await send('/40/send-back', 'POST', { reason: 'no' });
  assert.equal(short.status, 422);
  assert.ok(short.body.fields.reason);
  assert.equal((await send('/40/send-back', 'POST', { reason: 'x'.repeat(501) })).status, 422);
  assert.equal((await send('/40/send-back', 'POST', { reason: 'Not my work at all', version: 2 })).status, 409, 'an old copy of the task');
  assert.equal(calls.filter((c) => c.sql.startsWith('UPDATE') || c.sql.startsWith('INSERT')).length, 0);
  t.mock.restoreAll();

  calls = fakeDb(t, { task: { status: 'DONE' } });
  send = await client(t, { id: 5, role: 'person', org_id: 8 });
  assert.equal((await send('/40/send-back', 'POST', { reason: 'Not my work at all' })).status, 403);
  t.mock.restoreAll();

  fakeDb(t, { inTeam: false });
  send = await client(t, { id: 5, role: 'person', org_id: 8 });
  assert.equal((await send('/40/send-back', 'POST', { reason: 'Not my work at all' })).status, 404, 'a team they cannot see');
});

test('bugs with bug tracking on use Give back instead; a lost race is reported, not hidden', async (t) => {
  fakeDb(t, { task: { issue_type: 'bug' }, bugTracking: true });
  let send = await client(t, { id: 5, role: 'person', org_id: 8 });
  const bug = await send('/40/send-back', 'POST', { reason: 'Not my module at all' });
  assert.equal(bug.status, 409);
  assert.match(bug.body.error, /Give back/);
  t.mock.restoreAll();

  const calls = fakeDb(t, { updated: 0 });
  send = await client(t, { id: 5, role: 'person', org_id: 8 });
  assert.equal((await send('/40/send-back', 'POST', { reason: 'Not my work at all' })).status, 409);
  assert.equal(calls.filter((c) => c.sql.startsWith('INSERT')).length, 0, 'no comment or notification when nothing changed');
});
