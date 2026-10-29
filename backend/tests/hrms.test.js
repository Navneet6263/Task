const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../src/config/database');

process.env.JWT_SECRET = 'hrms-test-only';
const authRouter = require('../src/routes/auth');
const usersRouter = require('../src/routes/users');
const hrmsRouter = require('../src/routes/hrms');
const { syncAllTasksMembership, isPlaceholderEmail, temporaryPassword } = require('../src/services/employeeAccounts');

async function client(t, router, identity) {
  const app = express(); app.use(express.json()); app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const token = identity ? jwt.sign(identity, process.env.JWT_SECRET) : null;
  return async (path, method = 'GET', body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  };
}

const hash = bcrypt.hashSync('KMPT-4827', 4);
const employee = { id: 31, name: 'Asha', email: 'act05.8@no-email.invalid', password: hash, role: 'person', org_id: 8, login_code: 'ACT05', must_change_password: true };

test('employees sign in with their code only where the module is on, and are asked for a password and email', async (t) => {
  let lookup;
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.includes('FROM users u') && sql.includes("module_key = 'hrms_login'")) { lookup = { sql, params }; return [[employee]]; }
    if (sql.includes('user_org_access')) return [[]];
    return [[]];
  });
  const send = await client(t, authRouter);
  const ok = await send('/login', 'POST', { employee_code: ' act05 ', password: 'KMPT-4827' });
  assert.equal(ok.status, 200);
  assert.deepEqual(lookup.params, ['ACT05']);
  assert.match(lookup.sql, /m\.is_enabled = 1/);
  assert.equal(ok.body.needs_email, true);
  assert.equal(ok.body.must_change_password, true);
  assert.equal(ok.body.email, '');
  assert.equal(jwt.verify(ok.body.token, process.env.JWT_SECRET).org_id, 8);
  const wrong = await send('/login', 'POST', { employee_code: 'ACT05', password: 'nope' });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.error, 'Wrong employee code or password');
});

test('the company code is asked for only when the same code and password fit two companies', async (t) => {
  let params;
  t.mock.method(db, 'execute', async (sql, p) => {
    if (sql.includes("module_key = 'hrms_login'")) { params = p; return [[employee, { ...employee, id: 40, org_id: 9 }].slice(0, p.length === 2 ? 1 : 2)]; }
    return [[]];
  });
  const send = await client(t, authRouter);
  const both = await send('/login', 'POST', { employee_code: 'ACT05', password: 'KMPT-4827' });
  assert.equal(both.status, 409);
  assert.equal(both.body.code, 'COMPANY_CODE_REQUIRED');
  const one = await send('/login', 'POST', { employee_code: 'ACT05', company_code: 'org-test-1ab', password: 'KMPT-4827' });
  assert.equal(one.status, 200);
  assert.deepEqual(params, ['ACT05', 'ORG-TEST-1AB']);
});

test('the first-password step works only while the account is flagged and refuses the sheet password', async (t) => {
  let flagged = true;
  const writes = [];
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('SELECT password, must_change_password')) return [[{ password: hash, must_change_password: flagged }]];
    if (sql.startsWith('UPDATE users')) { writes.push({ sql, params }); return [{ affectedRows: 1 }]; }
    return [[]];
  });
  const send = await client(t, usersRouter, { id: 31, role: 'person', org_id: 8 });
  assert.equal((await send('/me/first-password', 'POST', { password: 'short' })).status, 422);
  assert.equal((await send('/me/first-password', 'POST', { password: 'KMPT-4827' })).status, 422);
  const ok = await send('/me/first-password', 'POST', { password: 'my-own-secret' });
  assert.equal(ok.status, 200);
  assert.match(writes[0].sql, /must_change_password = 0/);
  flagged = false;
  assert.equal((await send('/me/first-password', 'POST', { password: 'another-secret' })).status, 409);
});

test('a wrong email code counts against the limit and never changes the email', async (t) => {
  const writes = [];
  t.mock.method(db, 'execute', async (sql) => {
    if (sql.startsWith('SELECT email, code_hash')) return [[{ email: 'asha@example.com', code_hash: 'ab'.repeat(32), attempts: 3, expired: 0 }]];
    writes.push(sql);
    return [{ affectedRows: 1 }];
  });
  const send = await client(t, usersRouter, { id: 31, role: 'person', org_id: 8 });
  const wrong = await send('/me/email/verify', 'POST', { code: '123456' });
  assert.equal(wrong.status, 401);
  assert.match(wrong.body.error, /1 try left/);
  assert.deepEqual(writes, ['UPDATE user_email_otps SET attempts = attempts + 1 WHERE user_id = ?']);
});

function importDb(t, { role = 'admin', module = true, existing = [] } = {}) {
  const calls = [];
  let nextId = 100;
  t.mock.method(db, 'execute', async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT u.id, u.role FROM users u')) return [[{ id: 10, role }]];
    if (sql.startsWith('SELECT is_enabled FROM org_modules')) return [[{ is_enabled: module }]];
    if (sql.startsWith('SELECT id, email, login_code, role FROM users')) return [existing];
    if (sql.startsWith('INSERT INTO users')) return [{ affectedRows: 1, insertId: nextId++ }];
    if (sql.startsWith('INSERT INTO teams')) return [{ affectedRows: 1, insertId: 77 }];
    if (sql.startsWith('SELECT')) return [[]];
    return [{ affectedRows: 1 }];
  });
  return calls;
}

const sheet = [
  { code: 'ACT01', name: 'Kavya', role: 'admin', department: 'Director' },
  { code: 'act03', name: 'Dev', role: 'manager', department: 'Accounts', manager_code: 'ACT01', email: 'Dev@Gmail.com' },
  { code: 'ACT20', name: 'Asha', department: 'Accounts', manager_code: 'ACT03', mobile: '98765' },
  { code: 'ACT20', name: 'Asha again' },
  { code: '', name: 'No code' },
];

test('import needs an admin and the module', async (t) => {
  importDb(t, { role: 'manager' });
  let send = await client(t, hrmsRouter, { id: 10, role: 'manager', org_id: 8 });
  assert.equal((await send('/import', 'POST', { rows: sheet })).status, 403);
  t.mock.restoreAll();
  importDb(t, { module: false });
  send = await client(t, hrmsRouter, { id: 10, role: 'admin', org_id: 8 });
  const off = await send('/import', 'POST', { rows: sheet });
  assert.equal(off.status, 403);
  assert.equal(off.body.code, 'MODULE_OFF');
});

test('import creates accounts with one-time passwords, updates by code, links managers and builds one team', async (t) => {
  const calls = importDb(t, { existing: [{ id: 5, email: 'owner@acme.test', login_code: 'ACT01', role: 'admin' }, { id: 6, email: 'act09.8@no-email.invalid', login_code: 'ACT09', role: 'person' }] });
  const send = await client(t, hrmsRouter, { id: 10, role: 'admin', org_id: 8 });
  const result = await send('/import', 'POST', { rows: sheet, teams: 'one', deactivate_missing: true });
  assert.equal(result.status, 200);
  assert.equal(result.body.created, 2);
  assert.equal(result.body.updated, 1);
  assert.deepEqual(result.body.skipped.map((s) => s.reason), ['Same employee code appears twice', 'Employee code is empty']);
  assert.deepEqual(result.body.passwords.map((p) => p.code), ['ACT03', 'ACT20']);
  result.body.passwords.forEach((p) => assert.match(p.password, /^[A-Z]{4}-\d{4}$/));
  assert.deepEqual(result.body.teams_created, ['All staff']);
  assert.equal(result.body.deactivated, 1);

  const inserts = calls.filter((c) => c.sql.startsWith('INSERT INTO users'));
  assert.equal(inserts[0].params[1], 'dev@gmail.com');
  assert.equal(result.body.passwords[0].email, 'dev@gmail.com');
  assert.ok(isPlaceholderEmail(inserts[1].params[1]));
  assert.ok(inserts.every((c) => c.params[2].startsWith('$2')));
  assert.deepEqual(result.body.email_skipped, []);
  assert.match(inserts[0].sql, /must_change_password/);
  const managerLinks = calls.filter((c) => c.sql.startsWith('UPDATE users SET reports_to')).map((c) => c.params);
  assert.deepEqual(managerLinks, [[null, 5], [5, 100], [100, 101]]);
  assert.equal(calls.filter((c) => c.sql.startsWith('INSERT IGNORE INTO team_members')).length, 3);
  const removed = calls.find((c) => c.sql.startsWith('UPDATE users SET is_deleted = 1'));
  assert.deepEqual(removed.params, [6, 8]);
});

test('show all tasks adds everyone to every team when on, and removes only those memberships when off', async (t) => {
  let on = true;
  const calls = [];
  t.mock.method(db, 'execute', async (sql, params) => {
    calls.push(sql);
    if (sql.startsWith('SELECT is_enabled FROM org_modules')) return [[{ is_enabled: true }]];
    if (sql.startsWith('SELECT show_all_tasks')) return [[{ show_all_tasks: on }]];
    return [{ affectedRows: 4 }];
  });
  assert.deepEqual(await syncAllTasksMembership(8), { added: 4, removed: 0 });
  assert.match(calls.at(-1), /INSERT INTO team_members \(team_id, user_id, role, auto_added\)/);
  on = false;
  assert.deepEqual(await syncAllTasksMembership(8), { added: 0, removed: 4 });
  assert.match(calls.at(-2), /UPDATE tm SET auto_added = 0[\s\S]*assigned_to = tm\.user_id/);
  assert.match(calls.at(-1), /DELETE tm FROM team_members tm[\s\S]*tm\.auto_added = 1/);
});

test('temporary passwords are easy to read out', () => {
  for (let i = 0; i < 50; i += 1) assert.match(temporaryPassword(), /^[A-HJKMNP-Z]{4}-\d{4}$/);
});

const { router: saRouter } = require('../src/routes/superAdminAuth');
const MASTER = String(process.env.SUPER_ADMIN_EMAIL || 'superadmin@navtask.com').toLowerCase();

test('the platform console downloads one login sheet: new one-time passwords only for people not signed in yet', async (t) => {
  const calls = [];
  t.mock.method(db, 'execute', async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT id, name, company_code FROM organizations')) return [[{ id: 8, name: 'Acme Outsourcing', company_code: 'ORG-TEST-1AB' }]];
    if (sql.startsWith('SELECT is_enabled FROM org_modules')) return [[{ is_enabled: true }]];
    if (sql.includes('FROM users u LEFT JOIN users m')) return [[
      { id: 31, name: 'Asha', email: 'act20.8@no-email.invalid', login_code: 'ACT20', role: 'person', must_change_password: 1 },
      { id: 32, name: 'Dev', email: 'dev@gmail.com', login_code: 'ACT03', role: 'manager', must_change_password: 0 },
      { id: 5, name: 'Owner', email: 'owner@x.com', login_code: null, role: 'admin', must_change_password: 0 },
    ]];
    return [{ affectedRows: 1 }];
  });
  const send = await client(t, saRouter, { role: 'super_admin', mfa: true, email: MASTER });
  const sheet = await send('/organizations/8/employees/login-sheet', 'POST', {});
  assert.equal(sheet.status, 200);
  assert.deepEqual(sheet.body.people.map((p) => [p.code, p.email, Boolean(p.password), p.signed_in]), [['ACT20', '', true, false], ['ACT03', 'dev@gmail.com', false, true]]);
  const writes = calls.filter((c) => c.sql.startsWith('UPDATE users SET password'));
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].params.slice(1), [31, 8]);
  assert.ok(calls.some((c) => c.sql.startsWith('INSERT INTO super_admin_logs') && c.params[2] === 'LOGIN_SHEET'));
});

test('turning on "show all tasks" in the console switches it on for the company straight away', async (t) => {
  const calls = [];
  t.mock.method(db, 'execute', async (sql) => {
    calls.push(sql);
    if (sql.startsWith('SELECT id, name FROM organizations')) return [[{ id: 8, name: 'Acme Outsourcing' }]];
    if (sql.startsWith('SELECT is_enabled FROM org_modules')) return [[{ is_enabled: true }]];
    if (sql.startsWith('SELECT show_all_tasks')) return [[{ show_all_tasks: true }]];
    return [{ affectedRows: 1 }];
  });
  const send = await client(t, saRouter, { role: 'super_admin', mfa: true, email: MASTER });
  assert.equal((await send('/organizations/8/modules/all_tasks', 'PATCH', { enabled: true })).status, 200);
  assert.ok(calls.some((sql) => sql.startsWith('MERGE org_task_settings')));
  assert.ok(calls.some((sql) => sql.startsWith('INSERT INTO team_members')));
});
