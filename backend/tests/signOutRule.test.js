const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../src/config/database');
const router = require('../src/routes/timesheet');
const { decide, weekdayOf } = require('../src/services/signOutRule');
const { todayLocal } = require('../src/services/timesheetRules');

const rule = { enabled: true, min_daily_hours: 8, working_days: [1, 2, 3, 4, 5], holidays: [] };
const MONDAY = '2026-11-16';
const SATURDAY = '2026-11-21';

async function client(t, identity) {
  process.env.JWT_SECRET = 'sign-out-rule-test-only';
  const app = express(); app.use(express.json()); app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const token = jwt.sign(identity, process.env.JWT_SECRET);
  return (path, method = 'GET', body) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test('an employee with under 8 submitted hours on a working day cannot log out; more is fine', () => {
  assert.equal(weekdayOf(MONDAY), 1);
  assert.equal(weekdayOf('2026-11-22'), 7);
  const short = decide({ rule, today: MONDAY, role: 'person', submitted: 5.33, drafts: 2 });
  assert.deepEqual([short.allowed, short.reason, short.missing, short.draft_hours], [false, 'short', 2.67, 2]);
  // Half a day of work and half a day of Leave together make the day.
  assert.equal(decide({ rule, today: MONDAY, role: 'person', submitted: 4 + 4 }).allowed, true);
  assert.equal(decide({ rule, today: MONDAY, role: 'person', submitted: 9.5 }).allowed, true);
});

test('the rule skips days off, holidays, managers, admins, and companies without it', () => {
  assert.equal(decide({ rule, today: SATURDAY, role: 'person' }).reason, 'day_off');
  assert.equal(decide({ rule, today: MONDAY, role: 'person', isHoliday: true }).reason, 'holiday');
  assert.equal(decide({ rule, today: MONDAY, role: 'manager' }).allowed, true);
  assert.equal(decide({ rule, today: MONDAY, role: 'admin' }).allowed, true);
  assert.equal(decide({ rule: { ...rule, enabled: false, min_daily_hours: null }, today: MONDAY, role: 'person' }).reason, 'not_applicable');
});

test('the check counts only submitted time of today; drafts are reported apart', async (t) => {
  const seen = [];
  const weekend = [6, 7].includes(weekdayOf(todayLocal()));
  t.mock.method(db, 'execute', async (sql, params) => {
    seen.push({ sql, params });
    if (sql.startsWith('SELECT u.id, u.role FROM users u')) return [[{ id: 10, role: 'person' }]];
    if (sql.startsWith('SELECT is_enabled FROM org_modules')) return [[{ is_enabled: true }]];
    if (sql.startsWith('SELECT min_daily_hours')) return [[{ min_daily_hours: 8, working_days: weekend ? '1,2,3,4,5,6,7' : '1,2,3,4,5' }]];
    if (sql.includes('FROM timesheet_holidays') && sql.includes('ORDER BY')) return [[]];
    if (sql.includes('FROM timesheet_holidays')) return [[]];
    if (sql.includes('FROM timesheet_time_logs l JOIN timesheet_entries e')) return [[{ submitted: 6, drafts: 1.5 }]];
    return [[]];
  });
  const send = await client(t, { id: 10, role: 'person', org_id: 8 });
  const body = await (await send('/sign-out-check')).json();
  assert.deepEqual([body.allowed, body.hours, body.missing, body.draft_hours, body.required], [false, 6, 2, 1.5, 8]);
  const sum = seen.find((c) => c.sql.includes('FROM timesheet_time_logs l JOIN timesheet_entries e'));
  assert.match(sum.sql, /e\.status <> 'DRAFT'/);
  assert.deepEqual(sum.params, [8, 10, todayLocal()]);
});

test('only admins set the rule; hours and working days are checked', async (t) => {
  const writes = [];
  let role = 'person';
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('SELECT u.id, u.role FROM users u')) return [[{ id: 10, role }]];
    if (sql.startsWith('SELECT is_enabled FROM org_modules')) return [[{ is_enabled: true }]];
    if (sql.startsWith('SELECT min_daily_hours')) return [[{ min_daily_hours: 8, working_days: '1,2,3,4,5' }]];
    if (sql.startsWith('MERGE') || sql.startsWith('INSERT') || sql.startsWith('DELETE')) { writes.push({ sql, params }); return [{ affectedRows: 1 }]; }
    return [[]];
  });
  const send = await client(t, { id: 10, role: 'person', org_id: 8 });
  assert.equal((await send('/sign-out-rule', 'PUT', { enabled: true, min_daily_hours: 8, working_days: [1, 2, 3, 4, 5] })).status, 403);
  role = 'admin';
  assert.equal((await send('/sign-out-rule', 'PUT', { enabled: true, min_daily_hours: 30, working_days: [1] })).status, 422);
  assert.equal((await send('/sign-out-rule', 'PUT', { enabled: true, min_daily_hours: 8, working_days: [] })).status, 422);
  const ok = await send('/sign-out-rule', 'PUT', { enabled: true, min_daily_hours: 8, working_days: [5, 1, 2, 3, 4, 9] });
  assert.equal(ok.status, 200);
  assert.deepEqual(writes[0].params.slice(0, 3), [8, 8, '1,2,3,4,5']);
  assert.equal((await send('/holidays', 'POST', { date: '2026-12-25', name: 'Christmas' })).status, 201);
  assert.equal((await send('/holidays', 'POST', { date: 'soon' })).status, 422);
});
