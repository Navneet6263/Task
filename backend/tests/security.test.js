const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../src/config/database');
const mailer = require('../src/utils/mailer');

process.env.JWT_SECRET = 'security-test-only';

async function client(t, router, identity, headers = {}) {
  const app = express();
  app.use(require('../src/middleware/safeErrors').safeErrors);
  app.use(express.json()); app.use(router);
  app.use(require('../src/middleware/errorHandler').errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const token = identity ? jwt.sign(identity, process.env.JWT_SECRET) : null;
  return async (path, method = 'GET', body, extra = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json', ...headers, ...extra },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { status: response.status, body: parsed };
  };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

test('reset links always point at our own site, never at the address the request came from', async (t) => {
  process.env.APP_FRONTEND_URL = 'https://task.greencall.in';
  const sent = [];
  t.mock.method(mailer, 'sendResetLink', async (email, url) => { sent.push({ email, url }); });
  t.mock.method(db, 'execute', async (sql) => (sql.startsWith('SELECT id FROM users WHERE email') ? [[{ id: 5 }]] : [[]]));
  const send = await client(t, require('../src/routes/auth'));
  const response = await send('/send-reset-link', 'POST', { email: 'Asha@X.com' }, { origin: 'https://evil.vercel.app' });
  assert.equal(response.status, 200);
  await settle();
  assert.equal(sent.length, 1);
  assert.match(sent[0].url, /^https:\/\/task\.greencall\.in\/forgot-password\?token=[0-9a-f]{64}&email=asha%40x\.com$/);
});

test('asking for a reset gives the same answer whether or not the email has an account', async (t) => {
  let exists = false;
  const sent = [];
  t.mock.method(mailer, 'sendResetLink', async (email) => { sent.push(email); });
  t.mock.method(mailer, 'sendResetOtp', async (email) => { sent.push(email); });
  t.mock.method(db, 'execute', async (sql) => (sql.startsWith('SELECT id FROM users WHERE email') && exists ? [[{ id: 5 }]] : [[]]));
  const send = await client(t, require('../src/routes/auth'));
  const unknown = await send('/send-reset-link', 'POST', { email: 'nobody@x.com' });
  exists = true;
  const known = await send('/send-reset-link', 'POST', { email: 'asha@x.com' });
  assert.deepEqual([unknown.status, unknown.body], [known.status, known.body]);
  exists = false;
  const otpUnknown = await send('/send-reset-otp', 'POST', { email: 'nobody@x.com' });
  assert.equal(otpUnknown.status, 200);
  await settle();
  assert.deepEqual(sent, ['asha@x.com'], 'mail goes only to a real account');
});

test('a reset code is random, ends after 5 wrong guesses, and a new password must be 8 characters', async (t) => {
  let code = null;
  const writes = [];
  t.mock.method(mailer, 'sendResetOtp', async (email, otp) => { code = otp; });
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('SELECT id FROM users WHERE email')) return [[{ id: 5 }]];
    if (sql.startsWith('SELECT id FROM company_admins')) return [[]];
    if (sql.startsWith('UPDATE')) { writes.push(sql); return [{ affectedRows: 1 }]; }
    return [[]];
  });
  const send = await client(t, require('../src/routes/auth'));
  await send('/send-reset-otp', 'POST', { email: 'asha@x.com' });
  await settle();
  assert.match(code, /^\d{6}$/);
  assert.equal((await send('/reset-password', 'POST', { email: 'asha@x.com', otp: code, password: 'short' })).status, 422);
  const wrong = String((Number(code) + 1) % 1000000).padStart(6, '0');
  for (let i = 0; i < 4; i += 1) assert.equal((await send('/reset-password', 'POST', { email: 'asha@x.com', otp: wrong, password: 'long enough 1' })).status, 400);
  const fifth = await send('/reset-password', 'POST', { email: 'asha@x.com', otp: wrong, password: 'long enough 1' });
  assert.match(fifth.body.error, /Too many wrong codes/);
  const afterwards = await send('/reset-password', 'POST', { email: 'asha@x.com', otp: code, password: 'long enough 1' });
  assert.equal(afterwards.status, 400, 'even the right code no longer works');
  assert.equal(writes.length, 0);
});

test('ten wrong passwords lock that account for a while, from any address', async (t) => {
  const hash = bcrypt.hashSync('right password', 4);
  t.mock.method(db, 'execute', async (sql) => {
    if (sql.startsWith('SELECT * FROM company_admins')) return [[]];
    if (sql.startsWith('SELECT * FROM users WHERE email')) return [[{ id: 5, email: 'lock@x.com', password: hash, role: 'person', org_id: 3 }]];
    return [[]];
  });
  const send = await client(t, require('../src/routes/auth'));
  for (let i = 0; i < 10; i += 1) assert.equal((await send('/login', 'POST', { email: 'lock@x.com', password: `wrong ${i}` })).status, 401);
  const locked = await send('/login', 'POST', { email: 'lock@x.com', password: 'right password' });
  assert.equal(locked.status, 429);
  assert.equal(locked.body.code, 'ACCOUNT_LOCKED');
  assert.equal((await send('/login', 'POST', { email: 'other@x.com', password: 'x' })).status, 401, 'other accounts are not affected');
});

test('public sign-up cannot start a company, and needs a real email and an 8-character password', async (t) => {
  const inserts = [];
  t.mock.method(db, 'execute', async (sql) => {
    if (sql.startsWith('INSERT')) { inserts.push(sql); return [{ insertId: 1 }]; }
    return [[]];
  });
  const send = await client(t, require('../src/routes/auth'));
  const company = await send('/register', 'POST', { name: 'Boss', email: 'boss@x.com', password: 'secret123', role: 'manager', company_name: 'My Co' });
  assert.equal(company.status, 403);
  assert.match(company.body.error, /Register company/);
  assert.equal((await send('/register', 'POST', { name: 'A', email: 'not-an-email', password: 'secret123', team_code: 'TM1' })).status, 422);
  assert.equal((await send('/register', 'POST', { name: 'A', email: 'a@x.com', password: 'abc', team_code: 'TM1' })).status, 422);
  assert.equal(inserts.length, 0, 'no company, no account');
});

test('nobody can delete or ask to delete a task in a team they cannot see', async (t) => {
  const writes = [];
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('SELECT id, team_id, assigned_by FROM tasks WHERE id = ?')) return [[{ id: 80, team_id: 12, assigned_by: null }]];
    if (sql.includes('FROM team_members tm')) return [[]]; // person 5 is not in team 12 (another company)
    if (sql.startsWith('UPDATE')) { writes.push(params); return [{ affectedRows: 1 }]; }
    return [[]];
  });
  const send = await client(t, require('../src/routes/tasks/part4'), { id: 5, role: 'person', org_id: 3 });
  assert.equal((await send('/80', 'DELETE')).status, 403);
  assert.equal((await send('/80/approve-delete', 'PATCH')).status, 403);
  assert.equal((await send('/80/reject-delete', 'PATCH')).status, 403);
  assert.equal(writes.length, 0);
});

test('bulk delete removes your own tasks and sends the rest to their creators, like deleting one', async (t) => {
  const writes = [];
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('SELECT id, team_id, assigned_by FROM tasks WHERE id IN')) return [[{ id: 1, team_id: 2, assigned_by: 5 }, { id: 2, team_id: 2, assigned_by: 9 }, { id: 3, team_id: 2, assigned_by: null }]];
    if (sql.includes('FROM team_members tm')) return [[{ id: 1 }]];
    if (sql.startsWith('UPDATE')) { writes.push({ sql, params }); return [{ affectedRows: 1 }]; }
    return [[]];
  });
  const send = await client(t, require('../src/routes/tasks/part4'), { id: 5, role: 'person', org_id: 3 });
  const response = await send('/bulk/delete', 'DELETE', { ids: [1, 2, 3] });
  assert.equal(response.status, 200);
  assert.deepEqual([response.body.deleted, response.body.requested], [[1, 3], [2]]);
  assert.deepEqual(writes.find((w) => w.sql.includes('is_deleted = TRUE')).params, [1, 3]);
  assert.deepEqual(writes.find((w) => w.sql.includes('delete_requested_by')).params, [5, 2]);
  assert.match(response.body.message, /2 tasks deleted\. 1 sent to its creator for approval\./);
});

test('the HRMS password reset never resets the company owner or a co-admin', async (t) => {
  const writes = [];
  let co = false;
  t.mock.method(db, 'execute', async (sql) => {
    if (sql.startsWith('SELECT u.id, u.role FROM users u')) return [[{ id: 10, role: 'admin' }]];
    if (sql.startsWith('SELECT is_enabled FROM org_modules')) return [[{ is_enabled: true }]];
    if (sql.startsWith('SELECT id, name, email, login_code, org_id FROM users')) return [[{ id: 6, name: 'Owner', email: co ? 'co@x.com' : 'owner@x.com', login_code: null, org_id: 8 }]];
    if (sql.includes('JOIN company_admins ca')) return [[{ email: 'owner@x.com' }]];
    if (sql.startsWith('SELECT id FROM company_co_admins')) return [co ? [{ id: 1 }] : []];
    if (sql.startsWith('UPDATE')) { writes.push(sql); return [{ affectedRows: 1 }]; }
    return [[]];
  });
  const send = await client(t, require('../src/routes/hrms'), { id: 10, role: 'admin', org_id: 8 });
  assert.equal((await send('/employees/6/reset-password', 'POST', {})).status, 400);
  co = true;
  assert.equal((await send('/employees/6/reset-password', 'POST', {})).status, 400);
  assert.equal(writes.length, 0);
});

test('database and crash messages never reach the browser; messages for people do', async (t) => {
  const router = express.Router();
  router.get('/sql', (req, res) => res.status(400).json({ error: "Invalid column name 'secret_col'." }));
  router.get('/crash', (req, res) => res.status(400).json({ error: "Cannot read properties of undefined (reading 'id')" }));
  router.get('/thrown', () => { throw new Error('Failed to connect to 10.0.0.5:1433'); });
  router.get('/human', (req, res) => res.status(422).json({ error: 'Pick a client from the list' }));
  t.mock.method(console, 'error', () => {});
  const send = await client(t, router);
  for (const path of ['/sql', '/crash', '/thrown']) {
    const response = await send(path);
    assert.equal(response.body.error, 'Something went wrong. Please try again.', path);
  }
  assert.equal((await send('/human')).body.error, 'Pick a client from the list');
});

test('team join codes are shown to managers and admins only', async (t) => {
  t.mock.method(db, 'execute', async () => [[{ id: 2, name: 'Accounts', team_code: 'TMABC123', org_id: 3 }]]);
  const member = await client(t, require('../src/routes/teams'), { id: 5, role: 'person', org_id: 3 });
  const manager = await client(t, require('../src/routes/teams'), { id: 6, role: 'manager', org_id: 3 });
  assert.equal((await member('/')).body[0].team_code, undefined);
  assert.equal((await manager('/')).body[0].team_code, 'TMABC123');
});

test('the same employee code in two companies: wrong passwords lock only the accounts that were tried', async (t) => {
  const right = bcrypt.hashSync('right password', 4);
  let candidates = [{ id: 301, password: right, role: 'person', org_id: 8, login_code: 'EMP9' }, { id: 302, password: bcrypt.hashSync('other', 4), role: 'person', org_id: 9, login_code: 'EMP9' }];
  t.mock.method(db, 'execute', async (sql) => {
    if (sql.includes('FROM users u') && sql.includes('hrms_login')) return [candidates];
    if (sql.startsWith('SELECT org_id FROM user_org_access')) return [[]];
    return [[]];
  });
  const send = await client(t, require('../src/routes/auth'));
  for (let i = 0; i < 10; i += 1) assert.equal((await send('/login', 'POST', { employee_code: 'EMP9', password: `guess ${i}` })).status, 401);
  // Both accounts with that code were tried, so both are locked; a right password is not even checked now.
  const locked = await send('/login', 'POST', { employee_code: 'EMP9', password: 'right password' });
  assert.equal(locked.status, 429);
  assert.match(locked.body.error, /Ask your admin/);
  // Another code is not affected.
  candidates = [{ id: 303, password: right, role: 'person', org_id: 8, login_code: 'EMP10', must_change_password: 0 }];
  assert.equal((await send('/login', 'POST', { employee_code: 'EMP10', password: 'right password' })).status, 200);
});

test('a route may keep a technical message on purpose (the platform admin\'s mail-server test)', async (t) => {
  const router = express.Router();
  router.get('/inbox', (req, res) => { res.locals.showErrorText = true; res.status(422).json({ error: 'Could not sign in: getaddrinfo ENOTFOUND imap.example.com' }); });
  const send = await client(t, router);
  assert.match((await send('/inbox')).body.error, /ENOTFOUND imap\.example\.com/);
});

test('an owner whose two password copies differ signs in with the newer one and both copies match again', async (t) => {
  const newer = bcrypt.hashSync('new password 1', 4);
  const writes = [];
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('SELECT * FROM company_admins')) return [[{ id: 22, email: 'owner@x.com', password: bcrypt.hashSync('old password', 4), status: 'approved' }]];
    if (sql.startsWith('SELECT * FROM users WHERE email')) return [[{ id: 3, email: 'owner@x.com', password: newer, role: 'admin', org_id: 4 }]];
    if (sql.startsWith('UPDATE company_admins SET password')) { writes.push(params); return [{ affectedRows: 1 }]; }
    return [[]];
  });
  t.mock.method(console, 'error', () => {});
  const send = await client(t, require('../src/routes/auth'));
  // The company bootstrap after it is not part of this test; the copy is fixed before it runs.
  await send('/login', 'POST', { email: 'owner@x.com', password: 'new password 1' });
  assert.deepEqual(writes, [[newer, 22]]);
});
