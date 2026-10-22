const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../src/config/database');
const router = require('../src/routes/analytics');

async function client(t, identity = { id: 10, role: 'admin', org_id: 1 }) {
  process.env.JWT_SECRET = 'report-test-only';
  const app = express(); app.use(express.json()); app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const token = jwt.sign(identity, process.env.JWT_SECRET);
  return (path) => fetch(`http://127.0.0.1:${server.address().port}${path}`, { headers: { authorization: `Bearer ${token}` } });
}

test('task export refuses teams outside the organization before querying tasks', async (t) => {
  const calls = [];
  t.mock.method(db, 'execute', async (sql, params) => { calls.push({ sql, params }); return [[]]; });
  const send = await client(t);
  assert.equal((await send('/report/7/tasks')).status, 403);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, [7, 1]);
});

test('task export applies filters to the team and caps the rows', async (t) => {
  let exportQuery;
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('SELECT id FROM teams')) return [[{ id: 7 }]];
    exportQuery = { sql, params };
    return [Array.from({ length: 5001 }, (_, i) => ({ id: i + 1 }))];
  });
  const send = await client(t);
  const response = await send('/report/7/tasks?statuses=%5B%22DONE%22%5D&priorities=HIGH&created_from=2026-10-01&sort=due');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.rows.length, 5000);
  assert.equal(body.truncated, true);
  assert.match(exportQuery.sql, /t\.team_id = \?/);
  assert.match(exportQuery.sql, /FETCH NEXT 5001 ROWS ONLY/);
  assert.match(exportQuery.sql, /ORDER BY CASE WHEN t\.due_date IS NULL/);
  assert.deepEqual(exportQuery.params.slice(0, 3), [7, 'DONE', 'HIGH']);
});

test('invalid filter values are rejected with a clear message', async (t) => {
  t.mock.method(db, 'execute', async () => [[{ id: 7 }]]);
  const send = await client(t);
  const response = await send('/report/7/tasks?statuses=%5B%22NOPE%22%5D');
  assert.equal(response.status, 422);
});
