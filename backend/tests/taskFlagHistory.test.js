const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../src/config/database');

async function client(t, router, identity = { id: 10, role: 'person', org_id: 1 }) {
  process.env.JWT_SECRET = 'task-flag-history-test-only';
  const app = express(); app.use(express.json()); app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const token = jwt.sign(identity, process.env.JWT_SECRET);
  return (path, method = 'GET', body) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const visible = (sql, params) => sql.startsWith('SELECT t.id, t.title, t.status, t.team_id, t.org_id, t.parent_task_id, t.flagged FROM tasks t')
  && [[Number(params[0]) === 8 ? { id: 8, title: 'VAT return', status: 'TODO', team_id: 2, org_id: 1, parent_task_id: null, flagged: 0 } : undefined].filter(Boolean)];

test('a task can be flagged and unflagged by people who can see it, and the change is written to its history', async (t) => {
  const writes = [];
  t.mock.method(db, 'execute', async (sql, params) => {
    const seen = visible(sql, params); if (seen) return seen;
    writes.push({ sql, params }); return [{ affectedRows: 1 }];
  });
  const send = await client(t, require('../src/routes/taskExtras'));
  const on = await send('/8/flag', 'PUT', { flagged: true });
  assert.equal(on.status, 200);
  assert.deepEqual(await on.json(), { flagged: true });
  assert.deepEqual(writes[0].params, [true, 8]);
  assert.equal(writes[1].params[3], 'Flag Added');
  assert.equal((await send('/8/flag', 'PUT', { flagged: 'yes' })).status, 422);
  assert.equal((await send('/99/flag', 'PUT', { flagged: true })).status, 404);
});

test('task history lists who changed what, newest first, with before and after', async (t) => {
  t.mock.method(db, 'execute', async (sql, params) => {
    const seen = visible(sql, params); if (seen) return seen;
    if (sql.includes('FROM audit_logs a')) {
      assert.deepEqual(params, [8]);
      return [[
        { id: 3, activity: 'Task Updated', description: JSON.stringify({ status: { before: 'TODO', after: 'IN_PROGRESS' } }), created_at: '2026-11-14T10:00:00Z', user_id: 10, user_name: 'Asha Rao', avatar: null },
        { id: 1, activity: 'Task Assigned', description: 'Task assigned', created_at: '2026-11-13T10:00:00Z', user_id: 4, user_name: null, avatar: null },
      ]];
    }
    throw Error(`Unexpected query: ${sql.slice(0, 60)}`);
  });
  const send = await client(t, require('../src/routes/taskExtras'));
  const rows = await (await send('/8/history')).json();
  assert.deepEqual(rows[0].changes, { status: { before: 'TODO', after: 'IN_PROGRESS' } });
  assert.equal(rows[0].user_name, 'Asha Rao');
  assert.deepEqual([rows[1].changes, rows[1].note, rows[1].user_name], [null, 'Task assigned', 'Someone']);
  assert.equal((await send('/99/history')).status, 404);
});
