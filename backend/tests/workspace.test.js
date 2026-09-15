const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../src/config/database');
const { listTeamTasks, parseTaskQuery } = require('../src/services/taskQueryService');
const { normalizeDate } = require('../src/routes/tasks/taskSupport');
const baseTask = { id: 8, title: 'Task', team_id: 2, org_id: 1, version: 3, status: 'TODO', priority: 'MEDIUM', assigned_to: null, assigned_by: 10 };

async function request(t, route, path, method = 'GET', body) {
  const app = express(); app.use(express.json()); app.use(route);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  process.env.JWT_SECRET = 'workspace-test-only-secret';
  const token = jwt.sign({ id: 10, role: 'member', org_id: 1 }, process.env.JWT_SECRET);
  return fetch(`http://127.0.0.1:${server.address().port}${path}`, { method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}) });
}

test('calendar validation rejects impossible dates and accepts SQL Date values', () => {
  assert.throws(() => parseTaskQuery({ created_from: '2026-02-30' }), /valid date/);
  assert.throws(() => normalizeDate('2026-13-01', 'due_date'), /valid date/);
  assert.equal(normalizeDate(new Date('2026-09-08T00:00:00Z'), 'due_date'), '2026-09-08');
});

test('comments are denied before data is returned to a non-member', async t => {
  const calls = [];
  t.mock.method(db, 'execute', async sql => { calls.push(sql); return sql.includes('FROM tasks WHERE') ? [[baseTask]] : [[]]; });
  const response = await request(t, require('../src/routes/comments'), '/task/8');
  assert.equal(response.status, 403);
  assert.equal(calls.some(sql => sql.includes('FROM task_comments')), false);
});

test('bug pick requires team access', async t => {
  t.mock.method(db, 'execute', async sql => sql.includes('FROM tasks WHERE') ? [[{ ...baseTask, issue_type: 'bug' }]] : [[]]);
  const response = await request(t, require('../src/routes/tasks'), '/8/pick', 'PATCH');
  assert.equal(response.status, 403);
});

test('task update rejects stale client version without issuing an UPDATE', async t => {
  const calls = [];
  t.mock.method(db, 'execute', async sql => { calls.push(sql); return sql.includes('SELECT * FROM tasks') ? [[baseTask]] : [[{ id: 1 }]]; });
  const response = await request(t, require('../src/routes/tasks'), '/8', 'PUT', { title: 'Edited', version: 2 });
  assert.equal(response.status, 409);
  assert.equal(calls.some(sql => sql.trim().startsWith('UPDATE')), false);
});

test('task update protects the actual SQL write against a concurrent version change', async t => {
  let update;
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.includes('SELECT * FROM tasks')) return [[baseTask]];
    if (sql.trim().startsWith('UPDATE tasks')) { update = { sql, params }; return [{ affectedRows: 0 }]; }
    return [[{ id: 1 }]];
  });
  const response = await request(t, require('../src/routes/tasks'), '/8', 'PUT', { title: 'Edited', version: 3 });
  assert.equal(response.status, 409);
  assert.match(update.sql, /WHERE id=\? AND is_deleted=FALSE AND version=\?/);
  assert.equal(update.params.at(-1), 3);
});

test('successful update returns the incremented version', async t => {
  t.mock.method(db, 'execute', async sql => {
    if (sql.includes('SELECT * FROM tasks')) return [[baseTask]];
    if (sql.trim().startsWith('UPDATE')) return [{ affectedRows: 1 }];
    return [[{ id: 1 }]];
  });
  const response = await request(t, require('../src/routes/tasks'), '/8', 'PUT', { title: 'Edited', version: 3 });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).version, 4);
});

test('read receipts are scoped to the viewing user, not just the assignee', async t => {
  let readParams;
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('MERGE task_reads')) { readParams = params; return [{ affectedRows: 1 }]; }
    if (sql.includes('SELECT t.*')) return [[baseTask]];
    return [[{ id: 1 }]];
  });
  const response = await request(t, require('../src/routes/tasks'), '/8/view', 'PATCH');
  assert.equal(response.status, 200);
  assert.deepEqual(readParams, [8, 10, 8, 0]);
});

test('board fetch bounds each status column and keeps full summary counts', async t => {
  let boardSql;
  t.mock.method(db, 'execute', async sql => {
    if (sql.startsWith('WITH ranked')) { boardSql = sql; return [[baseTask]]; }
    return [[{ total: 219, todo: 100, done: 119 }]];
  });
  const result = await listTeamTasks(2, { board: 'true', limit: 12 }, 10);
  assert.match(boardSql, /PARTITION BY t.status ORDER BY t.created_at DESC, t.id DESC/);
  assert.match(boardSql, /column_row <= \?/);
  assert.equal(result.summary.total, 219);
  assert.equal(result.summary.done, 119);
  assert.equal(result.data.length, 1);
});

test('workflow denies a non-member and cannot change another task checklist', async t => {
  t.mock.method(db, 'execute', async sql => sql.includes('FROM tasks WHERE') ? [[baseTask]] : [[]]);
  const response = await request(t, require('../src/routes/taskWorkflow'), '/8/checklist/9', 'PATCH', { is_done: true });
  assert.equal(response.status, 403);
});

test('review changes require an explanation', async t => {
  t.mock.method(db, 'execute', async sql => sql.includes('FROM tasks WHERE') ? [[{ ...baseTask, review_status: 'READY' }]] : [[{ id: 1 }]]);
  const response = await request(t, require('../src/routes/taskWorkflow'), '/8', 'PATCH', { version: 3, review_status: 'CHANGES_REQUESTED', review_note: '' });
  assert.equal(response.status, 422);
});
