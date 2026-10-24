const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../src/config/database');
const router = require('../src/routes/timesheet');
const rules = require('../src/services/timesheetRules');

const validEntry = {
  client_id: 5, job_type: 'Payroll', work_type: 'Review', date_worked: '2026-10-10', agent_id: 99, period_type: 'Monthly',
  period_ended: '2026-09-30', registration_status: 'Registered', count_type: 'Payslips', count_number: 18, hours: 2.5,
};
const optionRows = [
  ['job_type', 'Payroll'], ['work_type', 'Review'], ['period_type', 'Monthly'], ['registration_status', 'Registered'], ['count_type', 'Payslips'],
].map(([option_group, label], index) => ({ id: index + 1, option_group, label, sort_order: 1, is_active: true }));

async function client(t, identity = { id: 10, role: 'person', org_id: 1 }) {
  process.env.JWT_SECRET = 'timesheet-test-only';
  const app = express(); app.use(express.json()); app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const token = jwt.sign(identity, process.env.JWT_SECRET);
  return (path, method = 'GET', body) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function mockDb(t, handle, { role = 'person', enabled = true } = {}) {
  const calls = [];
  t.mock.method(db, 'execute', async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT u.id, u.role FROM users u')) return [[{ id: 10, role }]];
    if (sql.startsWith('SELECT is_enabled FROM org_modules')) return [[{ is_enabled: enabled }]];
    if (sql.startsWith('INSERT INTO timesheet_audit')) return [{}];
    // Client-agent lookups: a test can answer them itself; otherwise the client has no agent.
    if (sql.startsWith('SELECT name FROM timesheet_clients') || sql.startsWith('SELECT c.agent_id')) {
      try { return await handle(sql, params); } catch { return sql.startsWith('SELECT name') ? [[{ name: 'Acme' }]] : [[]]; }
    }
    return handle(sql, params);
  });
  return calls;
}

/* Rules */
test('entries lock the day after the edit window and reopen during an approved unlock', () => {
  const entry = { status: 'SUBMITTED', submitted_on: '2026-10-10', unlocked_until: null };
  assert.equal(rules.lockState(entry, 7, '2026-10-17').locked, false);
  assert.equal(rules.lockState(entry, 7, '2026-10-18').locked, true);
  assert.equal(rules.lockState({ ...entry, unlocked_until: '2026-10-20' }, 7, '2026-10-20').locked, false);
  assert.equal(rules.lockState({ ...entry, unlocked_until: '2026-10-20' }, 7, '2026-10-21').locked, true);
  assert.equal(rules.lockState({ status: 'DRAFT', submitted_on: null }, 7, '2030-01-01').locked, false);
});

test('only admins bypass the lock; employees edit only their own open entries', () => {
  const entry = { created_by: 3, agent_id: 4, status: 'SUBMITTED' };
  const open = { locked: false }, locked = { locked: true };
  assert.equal(rules.canEditEntry('admin', 1, entry, locked), true);
  assert.equal(rules.canEditEntry('manager', 2, entry, locked), false);
  assert.equal(rules.canEditEntry('manager', 2, entry, open), true);
  assert.equal(rules.canEditEntry('person', 4, entry, open), true);
  assert.equal(rules.canEditEntry('person', 9, entry, open), false);
  assert.equal(rules.canRequestUnlock('person', 3, entry, locked), true);
  assert.equal(rules.canRequestUnlock('admin', 1, entry, locked), false);
  assert.equal(rules.canViewEntry('person', 9, { ...entry, status: 'DRAFT' }), false);
});

test('submit requires every field and valid hours; drafts need only a client', () => {
  assert.equal(rules.validateEntry(validEntry, 'submit', '2026-10-19').hours, 2.5);
  assert.throws(() => rules.validateEntry({ ...validEntry, hours: 30 }, 'submit', '2026-10-19'), (e) => e.status === 422 && Boolean(e.fields.hours));
  assert.throws(() => rules.validateEntry({ ...validEntry, date_worked: '2026-10-20' }, 'submit', '2026-10-19'), (e) => Boolean(e.fields.date_worked));
  assert.throws(() => rules.validateEntry({ ...validEntry, count_number: 1.5 }, 'submit', '2026-10-19'), (e) => Boolean(e.fields.count_number));
  assert.throws(() => rules.validateEntry({ client_id: 5 }, 'submit', '2026-10-19'), (e) => Object.keys(e.fields).length >= 9);
  assert.equal(rules.validateEntry({ client_id: 5 }, 'draft', '2026-10-19').job_type, null);
});

test('report summary adds hours per person and per entry', () => {
  const rows = [
    { entry_id: 1, client_id: 5, client_name: 'A', user_id: 3, user_name: 'Rahul', hours: 3.5 },
    { entry_id: 1, client_id: 5, client_name: 'A', user_id: 4, user_name: 'Priya', hours: 1.25 },
    { entry_id: 2, client_id: 5, client_name: 'A', user_id: 3, user_name: 'Rahul', hours: 1 },
  ];
  const summary = rules.summarizeReport(rows);
  assert.equal(summary.total_hours, 5.75);
  assert.deepEqual(summary.by_person.map((p) => [p.name, p.hours]), [['Rahul', 4.5], ['Priya', 1.25]]);
  assert.equal(summary.by_client[0].entries[0].hours, 4.75);
});

/* Routes: organization isolation and roles */
test('organizations without the module are refused on every route', async (t) => {
  const calls = mockDb(t, () => { throw Error('Unexpected query'); }, { enabled: false, role: 'admin' });
  const send = await client(t, { id: 10, role: 'admin', org_id: 1 });
  for (const path of ['/config', '/entries', '/clients', '/reports?from=2026-10-01&to=2026-10-31'])
    assert.equal((await send(path)).status, 403);
  assert.equal((await send('/entries', 'POST', validEntry)).status, 403);
  assert.ok(calls.every((call) => /FROM users u|FROM org_modules/.test(call.sql)));
});

test('a user who is no longer a member of the organization is refused', async (t) => {
  t.mock.method(db, 'execute', async () => [[]]);
  const send = await client(t, { id: 10, role: 'admin', org_id: 1 });
  assert.equal((await send('/entries')).status, 403);
  const status = await (await send('/status')).json();
  assert.deepEqual(status, { enabled: false, role: null });
});

test('employees cannot add clients, change setup or open reports', async (t) => {
  mockDb(t, () => { throw Error('Unexpected query'); });
  const send = await client(t);
  assert.equal((await send('/clients', 'POST', { name: 'New client' })).status, 403);
  assert.equal((await send('/settings', 'PUT', { lock_days: 30, unlock_days: 2 })).status, 403);
  assert.equal((await send('/options', 'POST', { option_group: 'job_type', label: 'Audit' })).status, 403);
  assert.equal((await send('/reports?from=2026-10-01&to=2026-10-31')).status, 403);
  assert.equal((await send('/unlock-requests')).status, 403);
});

test('creating an entry uses the token organization and forces an employee to be their own agent', async (t) => {
  let insert;
  mockDb(t, async (sql, params) => {
    if (sql.startsWith('SELECT tc.id FROM timesheet_clients')) { assert.deepEqual(params, [5, 1]); return [[{ id: 5 }]]; }
    if (sql.startsWith('SELECT u.id FROM users u')) return [[{ id: 10 }]];
    if (sql.startsWith('SELECT id, option_group')) return [optionRows];
    if (sql.startsWith('SELECT COALESCE(SUM(hours)')) return [[{ total: 0 }]];
    if (sql.startsWith('SET XACT_ABORT ON')) { insert = params; return [{ insertId: 77, rows: [{ insertId: 77 }] }]; }
    throw Error(`Unexpected query: ${sql.slice(0, 60)}`);
  });
  const send = await client(t);
  const response = await send('/entries', 'POST', { ...validEntry, org_id: 999, created_by: 999 });
  assert.equal(response.status, 201);
  assert.equal(insert[0], 1, 'org from token');
  assert.equal(insert[5], 10, 'agent forced to the employee');
  assert.equal(insert[14], 10, 'created_by from token');
});

test('a person cannot log more than 24 hours on one day across entries', async (t) => {
  mockDb(t, async (sql) => {
    if (sql.startsWith('SELECT tc.id FROM timesheet_clients')) return [[{ id: 5 }]];
    if (sql.startsWith('SELECT u.id FROM users u')) return [[{ id: 10 }]];
    if (sql.startsWith('SELECT id, option_group')) return [optionRows];
    if (sql.startsWith('SELECT COALESCE(SUM(hours)')) return [[{ total: 22 }]];
    throw Error(`Unexpected query: ${sql.slice(0, 60)}`);
  });
  const send = await client(t);
  const response = await send('/entries', 'POST', { ...validEntry, hours: 3 });
  assert.equal(response.status, 422);
  assert.match((await response.json()).fields.hours, /24 hours/);
});

test('dropdown values outside the organization list are rejected', async (t) => {
  mockDb(t, async (sql) => {
    if (sql.startsWith('SELECT tc.id FROM timesheet_clients')) return [[{ id: 5 }]];
    if (sql.startsWith('SELECT u.id FROM users u')) return [[{ id: 10 }]];
    if (sql.startsWith('SELECT id, option_group')) return [optionRows];
    throw Error(`Unexpected query: ${sql.slice(0, 60)}`);
  });
  const send = await client(t);
  const response = await send('/entries', 'POST', { ...validEntry, job_type: 'Made up' });
  assert.equal(response.status, 422);
  assert.ok((await response.json()).fields.job_type);
});

test('entries from another organization are not found', async (t) => {
  mockDb(t, async (sql, params) => {
    if (sql.includes('FROM timesheet_entries e') && sql.includes('WHERE e.id = ?')) { assert.deepEqual(params, [42, 1]); return [[]]; }
    throw Error(`Unexpected query: ${sql.slice(0, 60)}`);
  }, { role: 'admin' });
  const send = await client(t, { id: 10, role: 'admin', org_id: 1 });
  assert.equal((await send('/entries/42')).status, 404);
});

test('"+ New client" in the timesheet adds to the one client list and refuses clients turned off there', async (t) => {
  const writes = [];
  let active = 1;
  mockDb(t, (sql, params) => {
    if (sql.startsWith('INSERT INTO org_clients')) { writes.push(sql); throw Object.assign(Error('dup'), { number: 2627 }); }
    if (sql.startsWith('SELECT name, is_active FROM org_clients')) return [[{ name: 'ABC Ltd', is_active: active }]];
    if (sql.startsWith('INSERT INTO timesheet_clients')) { writes.push(sql); return [{ affectedRows: 1 }]; }
    if (sql.startsWith('SELECT id, name FROM timesheet_clients')) return [[{ id: 140, name: 'ABC Ltd' }]];
    throw Error(`Unexpected query: ${sql.slice(0, 60)}`);
  }, { role: 'manager' });
  const send = await client(t, { id: 10, role: 'manager', org_id: 1 });
  const ok = await send('/clients', 'POST', { name: 'abc ltd' });
  assert.equal(ok.status, 200, 'already in Settings → Clients, so it is reused');
  assert.deepEqual(await ok.json(), { id: 140, name: 'ABC Ltd', is_active: true });
  assert.ok(writes[0].startsWith('INSERT INTO org_clients'), 'added to the main list first');
  active = 0;
  assert.equal((await send('/clients', 'POST', { name: 'ABC Ltd' })).status, 409);
});

test('an entry can be linked to a task the person can see, but not to someone else\'s task', async (t) => {
  let insert;
  let visible = false;
  let taskCheck;
  mockDb(t, async (sql, params) => {
    if (sql.startsWith('SELECT t.id FROM tasks t')) { taskCheck = { sql, params }; return [visible ? [{ id: 42 }] : []]; }
    if (sql.startsWith('SELECT tc.id FROM timesheet_clients')) return [[{ id: 5 }]];
    if (sql.startsWith('SELECT u.id FROM users u')) return [[{ id: 10 }]];
    if (sql.startsWith('SELECT id, option_group')) return [optionRows];
    if (sql.startsWith('SELECT COALESCE(SUM(hours)')) return [[{ total: 0 }]];
    if (sql.startsWith('SET XACT_ABORT ON')) { insert = params; return [{ insertId: 78, rows: [{ insertId: 78 }] }]; }
    throw Error(`Unexpected query: ${sql.slice(0, 60)}`);
  });
  const send = await client(t);
  const refused = await send('/entries', 'POST', { ...validEntry, task_id: 42 });
  assert.equal(refused.status, 422);
  assert.ok((await refused.json()).fields.task_id);
  assert.match(taskCheck.sql, /t\.assigned_to = \? OR EXISTS \(SELECT 1 FROM team_members/, 'employees only see their own or team tasks');
  assert.deepEqual(taskCheck.params, [42, 1, 10, 10]);
  visible = true;
  assert.equal((await send('/entries', 'POST', { ...validEntry, task_id: 42 })).status, 201);
  assert.equal(insert[15], 42, 'task saved on the entry');
});

test('the task picker lists only tasks in scope, open ones first', async (t) => {
  let list;
  mockDb(t, async (sql, params) => {
    if (sql.includes('FROM tasks t LEFT JOIN users u')) { list = { sql, params }; return [[{ id: 42, title: 'Payroll Oct', client_name: 'Riverside', status: 'TODO' }]]; }
    throw Error(`Unexpected query: ${sql.slice(0, 60)}`);
  });
  const send = await client(t);
  const rows = await (await send('/tasks?q=pay_roll')).json();
  assert.equal(rows[0].id, 42);
  assert.match(list.sql, /t\.org_id = \? AND t\.is_deleted = 0 AND \(t\.assigned_to = \?/);
  assert.equal(list.params[3], '%pay[_]roll%', 'search wildcards are escaped');
  assert.match(list.sql, /ORDER BY CASE WHEN t\.status = 'DONE'/);
});

test('a client under an agent brings that agent; another agent for it is refused', async (t) => {
  let insert;
  mockDb(t, async (sql, params) => {
    if (sql.startsWith('SELECT name FROM timesheet_clients')) return [[{ name: 'ABC One Ltd' }]];
    if (sql.startsWith('SELECT id FROM org_agents')) return [[{ id: params[0] }]];
    if (sql.startsWith('SELECT c.agent_id')) return [[{ agent_id: 3, agent_name: 'ABR Accountants' }]];
    if (sql.startsWith('SELECT tc.id FROM timesheet_clients')) return [[{ id: 5 }]];
    if (sql.startsWith('SELECT u.id FROM users u')) return [[{ id: 10 }]];
    if (sql.startsWith('SELECT id, option_group')) return [optionRows];
    if (sql.startsWith('SELECT COALESCE(SUM(hours)')) return [[{ total: 0 }]];
    if (sql.startsWith('SET XACT_ABORT ON')) { insert = params; return [{ insertId: 79, rows: [{ insertId: 79 }] }]; }
    throw Error(`Unexpected query: ${sql.slice(0, 60)}`);
  });
  const send = await client(t);
  const wrong = await send('/entries', 'POST', { ...validEntry, agent_firm_id: 4 });
  assert.equal(wrong.status, 422);
  assert.match((await wrong.json()).error, /belongs to ABR Accountants/);
  assert.equal((await send('/entries', 'POST', validEntry)).status, 201);
  assert.equal(insert[17], 3, 'agent filled in from the client');
});
