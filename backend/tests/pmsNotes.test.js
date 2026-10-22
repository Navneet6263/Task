const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../src/config/database');
const notesRouter = require('../src/routes/notes');
const { buildPerformance, daysTaken, onTime, percentile } = require('../src/services/performance');

const task = (who, start, done, due, priority = 'MEDIUM') => ({ assigned_to: who, start_date: start, completed_at: `${done}T15:00:00`, due_date: due, priority, created_at: `${start}T09:00:00` });

test('days taken counts calendar days from start to completion; same day is half a day', () => {
  assert.equal(daysTaken(task(1, '2026-10-01', '2026-10-04')), 3);
  assert.equal(daysTaken(task(1, '2026-10-01', '2026-10-01')), 0.5);
  assert.equal(daysTaken({ created_at: '2026-10-02T23:30:00', completed_at: '2026-10-03T00:10:00' }), 1);
  assert.equal(onTime(task(1, '2026-10-01', '2026-10-05', '2026-10-05')), true);
  assert.equal(onTime(task(1, '2026-10-01', '2026-10-06', '2026-10-05')), false);
  assert.equal(onTime(task(1, '2026-10-01', '2026-10-06', null)), null);
});

test('percentile treats fewer days as better and needs at least two people', () => {
  assert.equal(percentile(10, [10, 5, 2]), 83);
  assert.equal(percentile(1, [1, 4, 6], true), 83);
  assert.equal(percentile(3, [3]), null);
});

test('performance compares me with anonymous team averages and ranks', () => {
  const rows = [
    task(1, '2026-10-01', '2026-10-02', '2026-10-03', 'HIGH'), task(1, '2026-10-05', '2026-10-06', '2026-10-06'), task(1, '2026-10-07', '2026-10-08', '2026-10-07'),
    task(2, '2026-10-01', '2026-10-09', '2026-10-05'),
    task(3, '2026-10-01', '2026-10-05', '2026-10-06'), task(3, '2026-10-06', '2026-10-09', '2026-10-09'),
  ];
  const result = buildPerformance(rows, 1);
  assert.equal(result.me.completed, 3);
  assert.equal(result.me.medianDays, 1);
  assert.equal(result.me.onTimeRate, 67);
  assert.equal(result.me.highPriority, 1);
  assert.equal(result.team.people, 2);
  assert.equal(result.team.completed, 1.5);
  assert.equal(result.rank.completed, 83);
  assert.equal(result.rank.speed, 83);
  assert.equal(result.distribution.find((b) => b.label === '1–3 days').count, 3);
  assert.ok(!JSON.stringify(result).includes('"id":2'), 'peers are never exposed individually');
});

test('a user with no completions still gets a valid, empty picture', () => {
  const result = buildPerformance([task(2, '2026-10-01', '2026-10-02')], 9);
  assert.equal(result.me.completed, 0);
  assert.equal(result.me.medianDays, null);
  assert.equal(result.rank.completed, 25);
});

async function client(t) {
  process.env.JWT_SECRET = 'notes-test-only';
  const app = express(); app.use(express.json()); app.use(notesRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const token = jwt.sign({ id: 10, role: 'person', org_id: 1 }, process.env.JWT_SECRET);
  return (path, method = 'GET', body) => fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
}

test('notes are always scoped to the caller and organization, and stale saves are refused', async (t) => {
  const calls = [];
  t.mock.method(db, 'execute', async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT u.id, u.role FROM users u')) return [[{ id: 10, role: 'person' }]];
    if (sql.startsWith('UPDATE user_notes SET title')) return [{ affectedRows: 0 }];
    return [[]];
  });
  const send = await client(t);
  assert.equal((await send('/?q=plan')).status, 200);
  const list = calls.find((c) => c.sql.includes('FROM user_notes WHERE user_id'));
  assert.deepEqual(list.params, [10, 1, '%plan%', '%plan%']);
  assert.equal((await send('/5', 'PUT', { title: 'A', body: 'B', version: 2 })).status, 409);
  const update = calls.find((c) => c.sql.startsWith('UPDATE user_notes SET title'));
  assert.deepEqual(update.params.slice(3), [5, 10, 1, 2]);
  assert.equal((await send('/', 'POST', { title: ' ', body: '  ' })).status, 422);
});
