const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../src/config/database');
const extras = require('../src/services/taskExtras');
const { listTeamTasks } = require('../src/services/taskQueryService');

async function client(t, identity) {
  process.env.JWT_SECRET = 'task-extras-test-only';
  const app = express(); app.use(express.json()); app.use(require('../src/routes/taskExtras'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const token = jwt.sign(identity, process.env.JWT_SECRET);
  return (path, method = 'GET', body) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test('task keys come from the organization: its own prefix, else the company code', () => {
  assert.equal(extras.prefixOf({ task_prefix: 'acc', company_code: 'ORG-ROHI-9YY' }), 'ACC');
  assert.equal(extras.prefixOf({ company_code: 'ORG-ROHI-9YY' }), 'ROHI');
  assert.equal(extras.prefixOf({}), 'TASK');
  assert.equal(extras.idFromKey('ACC-142'), 142);
  assert.equal(extras.idFromKey(' #7 '), 7);
  assert.equal(extras.idFromKey('payroll 7'), null);
});

test('people only reach tasks of their own teams; admins their organization', async (t) => {
  const seen = [];
  t.mock.method(db, 'execute', async (sql, params) => { seen.push({ sql, params }); return [[]]; });
  await extras.visibleTasks({ userRole: 'person', userId: 10, orgId: 1 }, [5, '6', 'x', 5]);
  assert.match(seen[0].sql, /EXISTS \(SELECT 1 FROM team_members tm WHERE tm\.team_id = t\.team_id AND tm\.user_id = \?\)/);
  assert.deepEqual(seen[0].params, [5, 6, 10, 1, 1]);
  await extras.visibleTasks({ userRole: 'admin', userId: 10, orgId: 1 }, [5]);
  assert.match(seen[1].sql, /t\.org_id = \?/);
  await assert.rejects(extras.visibleTask({ userRole: 'person', userId: 10, orgId: 1 }, 99), /Task not found/);
});

test('a subtask lives in the parent\'s team, one level deep, and its assignee must be in that team', async (t) => {
  const inserts = [];
  let parent = { id: 5, team_id: 3, org_id: 1, parent_task_id: null, title: 'Payroll', status: 'TODO' };
  let member = true;
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.includes('FROM tasks t') && sql.includes('t.id IN')) return [[parent]];
    if (sql.startsWith('SELECT id FROM team_members')) return [member ? [{ id: 1 }] : []];
    if (sql.startsWith('INSERT INTO tasks')) { inserts.push(params); return [{ insertId: 77 }]; }
    return [[]];
  });
  const req = { userRole: 'person', userId: 10, orgId: 1 };
  assert.equal(await extras.addSubtask(req, 5, { title: 'Collect timesheets', assigned_to: 12, due_date: '2026-11-10', priority: 'HIGH' }), 77);
  assert.deepEqual(inserts[0], ['Collect timesheets', 'HIGH', 12, 10, 3, 1, '2026-11-10', 5]);
  member = false;
  await assert.rejects(extras.addSubtask(req, 5, { title: 'X', assigned_to: 99 }), /must be in this team/);
  parent = { ...parent, parent_task_id: 2 };
  await assert.rejects(extras.addSubtask(req, 5, { title: 'X' }), /cannot have its own subtasks/);
});

test('"is blocked by" is saved as the other task blocking this one, and only within one organization', async (t) => {
  const writes = [];
  const tasks = { 5: { id: 5, org_id: 1, team_id: 3 }, 9: { id: 9, org_id: 1, team_id: 4 }, 11: { id: 11, org_id: 2, team_id: 8 } };
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.includes('t.id IN')) return [[tasks[params[0]]].filter(Boolean)];
    if (sql.includes('INSERT INTO task_links')) { writes.push(params); return [{}]; }
    return [[]];
  });
  const req = { userRole: 'company_admin', companyAdminId: 4, userId: 10 };
  await extras.addLink(req, 5, { type: 'blocks', task: 'ACC-9', inward: true });
  assert.deepEqual(writes[0].slice(4, 7), [9, 5, 'blocks']);
  await assert.rejects(extras.addLink(req, 5, { type: 'blocks', task_id: 11 }), /same organization/);
  await assert.rejects(extras.addLink(req, 5, { type: 'clones', task_id: 9 }), /how the tasks are linked/);
  await assert.rejects(extras.addLink(req, 5, { type: 'relates', task_id: 5 }), /another task/);
});

test('labels only attach from the task\'s own organization; only admins and managers edit them', async (t) => {
  const inserted = [];
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('SELECT id FROM task_labels WHERE org_id')) return [[{ id: 2 }]];
    if (sql.startsWith('INSERT INTO task_label_links')) { inserted.push(params); return [{}]; }
    return [[]];
  });
  assert.deepEqual(await extras.setLabels({ id: 5, org_id: 1 }, [2, 3]), [2]);
  assert.deepEqual(inserted, [[5, 2]]);
  const send = await client(t, { id: 10, role: 'person', org_id: 1 });
  assert.equal((await send('/labels/2', 'PATCH', { name: 'X' })).status, 403);
  assert.equal((await send('/labels/2', 'DELETE')).status, 403);
  assert.equal((await send('/meta/prefix', 'PUT', { prefix: 'ACC' })).status, 403);
});

test('searching ACC-142 finds task 142 in the task list, and labels filter it', async (t) => {
  const seen = [];
  t.mock.method(db, 'execute', async (sql, params) => { seen.push({ sql, params }); return [sql.includes('COUNT(*)') ? [{ total: 0 }] : []]; });
  await listTeamTasks(7, { search: 'ACC-142', labels: '3,4' }, 10, 1);
  const filtered = seen.find((c) => c.sql.includes('t.id = ? OR t.title LIKE ?'));
  assert.ok(filtered, 'the key is matched on the task number');
  assert.ok(filtered.params.includes(142));
  assert.match(filtered.sql, /ll\.label_id IN \(\?,\?\)/);
});
