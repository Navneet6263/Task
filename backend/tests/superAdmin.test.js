const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../src/config/database');
const mailer = require('../src/utils/mailer');
const { router } = require('../src/routes/superAdminAuth');
const { keyedHash } = require('../src/services/superAdminAccess');

const MASTER = String(process.env.SUPER_ADMIN_EMAIL || 'superadmin@navtask.com').toLowerCase();

async function server(t) {
  process.env.JWT_SECRET = 'sa-test-only';
  const app = express(); app.use(express.json()); app.use(router);
  const srv = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => srv.once('listening', resolve));
  t.after(() => new Promise((resolve) => { srv.closeAllConnections(); srv.close(resolve); }));
  return (path, method = 'GET', body, token) => fetch(`http://127.0.0.1:${srv.address().port}${path}`, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function client(t, identity) {
  const send = await server(t);
  const token = jwt.sign({ role: 'super_admin', mfa: true, ...identity }, process.env.JWT_SECRET);
  return (path, method, body) => send(path, method, body, token);
}

test('account limits must be whole numbers from 1 to 100000 before anything is written', async (t) => {
  const calls = [];
  t.mock.method(db, 'execute', async (sql) => { calls.push(sql); return [[{ id: 1, name: 'A' }]]; });
  const send = await client(t, { email: MASTER, name: 'Super Admin' });
  const bad = await send('/company-admins/1/limits', 'PATCH', { max_companies: 0, max_managers_per_company: 5, max_staff_per_company: 5 });
  assert.equal(bad.status, 422);
  assert.match((await bad.json()).error, /max companies/);
  assert.equal((await send('/company-admins/1/approve', 'PATCH', { max_companies: 2.5 })).status, 422);
  assert.equal(calls.length, 0);
});

test('rejecting a company needs a reason', async (t) => {
  const calls = [];
  t.mock.method(db, 'execute', async (sql) => { calls.push(sql); return [[]]; });
  const send = await client(t, { email: MASTER });
  assert.equal((await send('/company-admins/1/reject', 'PATCH', { reason: '  ' })).status, 422);
  assert.equal(calls.length, 0);
});

test('tokens from the old email-only sign-in are refused', async (t) => {
  t.mock.method(db, 'execute', async () => [[]]);
  const send = await server(t);
  const old = jwt.sign({ email: MASTER, role: 'super_admin', is_master: true }, process.env.JWT_SECRET);
  assert.equal((await send('/dashboard', 'GET', null, old)).status, 401);
});

test('only the master account can manage helpers, and new helpers get a one-time setup link', async (t) => {
  const calls = [];
  t.mock.method(mailer, 'sendConsoleInvite', async () => {});
  t.mock.method(db, 'execute', async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT id FROM super_admin_users')) return [[{ id: 1 }]];
    if (sql.startsWith('SELECT id, is_active, name')) return [[]];
    if (sql.startsWith('INSERT INTO super_admin_users')) return [{ insertId: 7, affectedRows: 1 }];
    return [{ affectedRows: 1 }];
  });
  const helper = await client(t, { email: 'helper@navtask.com' });
  assert.equal((await helper('/sub-users', 'POST', { email: 'new@navtask.com' })).status, 403);
  assert.equal((await helper('/sub-users/4', 'DELETE')).status, 403);
  const master = await client(t, { email: MASTER });
  assert.equal((await master('/sub-users', 'POST', { email: 'not-an-email' })).status, 422);
  const added = await master('/sub-users', 'POST', { email: 'New@Navtask.com', name: 'New' });
  assert.equal(added.status, 200);
  assert.equal((await added.json()).invite_sent, true);
  const invite = calls.find((c) => c.sql.includes('invite_token_hash = ?'));
  assert.match(invite.params[0], /^[a-f0-9]{64}$/, 'only a hash of the link token is stored');
  assert.equal(mailer.sendConsoleInvite.mock.calls[0].arguments[0], 'new@navtask.com');
});

test('a helper whose access was removed is signed out on the next request', async (t) => {
  t.mock.method(db, 'execute', async (sql) => {
    if (sql.startsWith('SELECT id FROM super_admin_users')) return [[]];
    throw Error(`Unexpected query: ${sql.slice(0, 40)}`);
  });
  const send = await client(t, { email: 'gone@navtask.com' });
  const response = await send('/dashboard');
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /access was removed/);
});

test('sign-in needs the right password, then the emailed code; wrong codes run out', async (t) => {
  const hash = bcrypt.hashSync('Correct-pass-123', 4);
  const otp = { attempts: 0, consumed: null };
  let sentCode = null;
  t.mock.method(mailer, 'sendConsoleCode', async (email, code) => { sentCode = code; });
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.includes('FROM super_admin_users WHERE email = ? AND is_active')) return [[{ id: 3, email: 'helper@navtask.com', name: 'Helper', password_hash: hash, locked: 0 }]];
    if (sql.startsWith('INSERT INTO super_admin_otps')) { Object.assign(otp, { challenge: params[1], code: params[2] }); return [{ affectedRows: 1 }]; }
    if (sql.includes('FROM super_admin_otps WHERE challenge_hash')) {
      return [params[0] === otp.challenge ? [{ id: 1, email: 'helper@navtask.com', code_hash: otp.code, attempts: otp.attempts, resends: 0, consumed_at: otp.consumed, expired: 0, since_sent: 5 }] : []];
    }
    if (sql.startsWith('UPDATE super_admin_otps SET attempts')) { otp.attempts += 1; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('UPDATE super_admin_otps SET consumed_at')) { otp.consumed = new Date(); return [{ affectedRows: 1 }]; }
    return [{ affectedRows: 1 }];
  });
  const send = await server(t);
  const wrong = await send('/login/start', 'POST', { email: 'helper@navtask.com', password: 'nope' });
  assert.equal(wrong.status, 401);
  assert.equal((await wrong.json()).error, 'Email or password is incorrect.');

  const started = await (await send('/login/start', 'POST', { email: 'Helper@navtask.com', password: 'Correct-pass-123' })).json();
  assert.match(started.challenge_id, /^[a-f0-9]{64}$/);
  assert.match(sentCode, /^\d{6}$/);
  assert.equal(otp.challenge, keyedHash(`challenge:${started.challenge_id}`), 'challenge stored only as a keyed hash');
  assert.notEqual(otp.code, sentCode);
  assert.equal((await send('/login/resend', 'POST', { challenge_id: started.challenge_id })).status, 429, 'resend waits 60 seconds');

  const bad = await send('/login/verify', 'POST', { challenge_id: started.challenge_id, code: sentCode === '000000' ? '111111' : '000000' });
  assert.equal(bad.status, 401);
  assert.match((await bad.json()).error, /4 tries left/);

  const good = await (await send('/login/verify', 'POST', { challenge_id: started.challenge_id, code: sentCode })).json();
  const claims = jwt.verify(good.token, process.env.JWT_SECRET);
  assert.equal(claims.mfa, true);
  assert.ok(claims.exp - claims.iat <= 8 * 3600, 'console sessions expire');
  assert.equal((await send('/login/verify', 'POST', { challenge_id: started.challenge_id, code: sentCode })).status, 410, 'a code works once');
});

test('setup links are single-use and enforce the password rules', async (t) => {
  const token = 'a'.repeat(64);
  let saved = null;
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.includes('WHERE invite_token_hash = ?')) return [params[0] === keyedHash(`invite:${token}`) && !saved ? [{ id: 3, email: 'asha@navtask.com', name: 'Asha' }] : []];
    if (sql.startsWith('UPDATE super_admin_users SET password_hash')) { saved = params[0]; return [{ affectedRows: 1 }]; }
    return [{ affectedRows: 1 }];
  });
  const send = await server(t);
  assert.equal((await send('/setup-password', 'POST', { token, password: 'short1' })).status, 422);
  assert.equal((await send('/setup-password', 'POST', { token, password: 'asha-password-2026' })).status, 422, 'email name not allowed');
  assert.equal((await send('/setup-password', 'POST', { token, password: 'Green-console-2026' })).status, 200);
  assert.ok(saved.startsWith('$2'), 'password stored as a bcrypt hash');
  assert.equal((await send('/setup-password', 'POST', { token, password: 'Green-console-2026' })).status, 410);
});

test('master sign-in codes go to SUPER_ADMIN_OTP_EMAIL when it is set', async (t) => {
  const before = { ...process.env };
  t.after(() => { process.env.SUPER_ADMIN_PASSWORD = before.SUPER_ADMIN_PASSWORD; process.env.SUPER_ADMIN_OTP_EMAIL = before.SUPER_ADMIN_OTP_EMAIL || ''; });
  process.env.SUPER_ADMIN_PASSWORD = 'master-test-pass';
  process.env.SUPER_ADMIN_OTP_EMAIL = 'Owner.Real@Example.com';
  let to = null;
  t.mock.method(mailer, 'sendConsoleCode', async (email) => { to = email; });
  t.mock.method(db, 'execute', async () => [{ affectedRows: 1 }]);
  const send = await server(t);
  const response = await send('/login/start', 'POST', { email: MASTER, password: 'master-test-pass' });
  assert.equal(response.status, 200);
  assert.equal(to, 'owner.real@example.com');
  assert.match((await response.json()).email_hint, /@example\.com$/);
});
