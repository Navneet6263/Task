const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../src/config/database');
const sessions = require('../src/services/sessions');

const { checkSession, issueSession } = sessions.real;
const SID = 'b'.repeat(32);
const stamp = (hash) => sessions.fingerprint(hash);

// A fake database with one session row and one account, changed per test.
function fakeDb(t, { session, user, company = null, coAdminOf = null, orgAccess = [] }) {
  const calls = [];
  t.mock.method(db, 'execute', async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('FROM auth_sessions s WHERE s.sid')) return [session ? [session] : []];
    if (sql.includes('FROM users u LEFT JOIN company_admins ca')) return [user ? [{ ...user, ...(company || {}) }] : []];
    if (sql.startsWith('SELECT org_id FROM user_org_access')) return [orgAccess.map((org_id) => ({ org_id }))];
    if (sql.startsWith('SELECT id FROM organizations WHERE company_admin_id')) return [[{ id: 4 }, { id: 9 }]];
    if (sql.includes('FROM company_co_admins c')) return [coAdminOf ? [{ id: coAdminOf }] : []];
    return [{ affectedRows: 1 }];
  });
  t.mock.method(db, 'query', async () => [{ affectedRows: 0 }]);
  sessions.real.forgetSessions();
  return calls;
}
const liveSession = (extra = {}) => ({ user_id: 5, company_admin_id: null, kind: 'user', stamp: stamp('hash-1'), live: 1, ...extra });
const person = (extra = {}) => ({ id: 5, role: 'manager', org_id: 3, is_deleted: false, user_password: 'hash-1', ...extra });

test('tokens from before sessions, or with a made-up session id, are refused', async (t) => {
  fakeDb(t, { session: liveSession(), user: person() });
  assert.deepEqual(await checkSession({ id: 5 }), { ok: false, code: 'SESSION_OLD' });
  assert.deepEqual(await checkSession({ id: 5, sid: "x' OR 1=1 --" }), { ok: false, code: 'SESSION_OLD' });
});

test('an open session gets its role and organizations from the database, not from the token', async (t) => {
  fakeDb(t, { session: liveSession(), user: person({ role: 'person' }), orgAccess: [7] });
  const result = await checkSession({ id: 5, role: 'admin', org_id: 3, sid: SID });
  assert.equal(result.ok, true);
  assert.equal(result.role, 'person', 'a demoted admin is a member at once');
  assert.deepEqual(result.orgIds.sort(), [3, 7]);
});

test('signed out, expired, removed, someone else\'s or re-passworded sessions are ended', async (t) => {
  const cases = [
    ['signed out or expired', liveSession({ live: 0 }), person()],
    ['removed account', liveSession(), person({ is_deleted: true })],
    ['password changed elsewhere', liveSession(), person({ user_password: 'hash-2' })],
    ['token of another person', liveSession({ user_id: 6 }), person()],
    ['no such session', null, person()],
  ];
  for (const [label, session, user] of cases) {
    sessions.real.forgetSessions();
    fakeDb(t, { session, user });
    const result = await checkSession({ id: 5, sid: SID });
    assert.equal(result.ok, false, label);
    t.mock.restoreAll();
  }
});

test('the company owner is checked against the company account; a removed co-admin is told so', async (t) => {
  const owner = { ca_email: 'owner@x.com', ca_password: 'ca-hash', ca_status: 'approved' };
  sessions.real.forgetSessions();
  fakeDb(t, { session: liveSession({ kind: 'owner', company_admin_id: 22, stamp: sessions.fingerprint('owner@x.com', 'ca-hash') }), user: person(), company: owner });
  const ok = await checkSession({ id: 5, company_admin_id: 22, sid: SID });
  assert.equal(ok.role, 'company_admin');
  assert.deepEqual(ok.orgIds, [4, 9]);
  t.mock.restoreAll();

  sessions.real.forgetSessions();
  fakeDb(t, { session: liveSession({ kind: 'owner', company_admin_id: 22, stamp: sessions.fingerprint('owner@x.com', 'ca-hash') }), user: person(), company: { ...owner, ca_status: 'rejected' } });
  assert.equal((await checkSession({ id: 5, company_admin_id: 22, sid: SID })).ok, false, 'a company that is no longer approved');
  t.mock.restoreAll();

  sessions.real.forgetSessions();
  fakeDb(t, { session: liveSession({ kind: 'co_admin', company_admin_id: 22 }), user: person({ role: 'admin' }), coAdminOf: null });
  assert.deepEqual(await checkSession({ id: 5, company_admin_id: 22, sid: SID }), { ok: false, code: 'CO_ADMIN_REMOVED' });
});

test('signing in records the session with its device, and the token carries only a random session id', async (t) => {
  process.env.JWT_SECRET = 'sessions-test-only';
  const calls = fakeDb(t, { session: null, user: person() });
  const token = await issueSession({ ip: '::ffff:10.1.2.3', headers: { 'user-agent': 'Chrome on Windows' } }, { id: 5, role: 'manager', org_id: 3 }, false);
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  assert.match(decoded.sid, /^[0-9a-f]{32}$/);
  assert.equal(decoded.exp - decoded.iat, 12 * 60 * 60, 'without "Keep me signed in" it lasts one working day');
  const insert = calls.find((c) => c.sql.startsWith('INSERT INTO auth_sessions'));
  assert.deepEqual(insert.params.slice(0, 8), [decoded.sid, 5, null, 'user', stamp('hash-1'), 0, '10.1.2.3', 'Chrome on Windows']);
});

test('the API refuses an ended session, uses the live role, and keeps the organization within the live list', async (t) => {
  process.env.JWT_SECRET = 'sessions-test-only';
  sessions.real.forgetSessions();
  let user = person({ role: 'person' });
  t.mock.method(sessions, 'check', checkSession);
  t.mock.method(db, 'execute', async (sql) => {
    if (sql.includes('FROM auth_sessions s WHERE s.sid')) return [[liveSession()]];
    if (sql.includes('FROM users u LEFT JOIN company_admins ca')) return [[user]];
    if (sql.startsWith('SELECT org_id FROM user_org_access')) return [[]];
    return [{ affectedRows: 1 }];
  });
  const { authenticate } = require('../src/middleware/auth');
  const app = express();
  app.get('/me', authenticate, (req, res) => res.json({ role: req.userRole, org: req.orgId, sid: req.sessionId }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const call = (token, org) => fetch(`http://127.0.0.1:${server.address().port}/me`, { headers: { authorization: `Bearer ${token}`, ...(org ? { 'x-org-id': String(org) } : {}) } });

  const token = jwt.sign({ id: 5, role: 'admin', org_id: 3, org_ids: [3, 99], sid: SID }, process.env.JWT_SECRET, { expiresIn: 60 });
  const ok = await (await call(token, 99)).json();
  assert.deepEqual(ok, { role: 'person', org: 3, sid: SID }, 'an organization only in the old token is not used');

  const old = await call(jwt.sign({ id: 5, role: 'admin', org_id: 3 }, process.env.JWT_SECRET, { expiresIn: 60 }));
  assert.equal(old.status, 401);
  assert.equal((await old.json()).error, 'Invalid token', 'open tabs go back to the sign-in page');

  sessions.real.forgetSessions();
  user = person({ is_deleted: true });
  assert.equal((await call(token)).status, 401, 'a removed person is out on their next request');
});

test('the device list never shows session ids; people end only their own sessions', async (t) => {
  process.env.JWT_SECRET = 'sessions-test-only';
  const revoked = [];
  t.mock.method(sessions, 'listSessions', async (userId) => (userId === 5
    ? [{ id: 1, sid: SID, kind: 'user', ip: '1.1.1.1', user_agent: 'A', remember: 1 }, { id: 2, sid: 'c'.repeat(32), kind: 'user', ip: '2.2.2.2', user_agent: 'B', remember: 0 }]
    : []));
  t.mock.method(sessions, 'revokeSession', async (sid, reason) => { revoked.push([sid, reason]); });
  t.mock.method(sessions, 'revokeUserSessions', async (userId, options) => { revoked.push([userId, options.exceptSid]); return 1; });
  const app = express(); app.use(express.json()); app.use(require('../src/routes/sessions'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const token = jwt.sign({ id: 5, role: 'person', org_id: 3, sid: SID }, process.env.JWT_SECRET);
  const send = (path, method = 'GET') => fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { authorization: `Bearer ${token}` } });

  const list = await (await send('/')).json();
  assert.deepEqual(list.sessions.map((s) => [s.id, s.current, s.remember, 'sid' in s]), [[1, true, true, false], [2, false, false, false]]);
  assert.equal((await send('/77', 'DELETE')).status, 404, 'not one of mine');
  assert.equal((await send('/2', 'DELETE')).status, 200);
  assert.equal((await send('/others/revoke', 'POST')).status, 200);
  assert.equal((await send('/logout', 'POST')).status, 200);
  assert.deepEqual(revoked, [['c'.repeat(32), 'signed_out_elsewhere'], [5, SID], [SID, 'signed_out']]);
});

test('changing your own password writes the password, the owner copy and this session\'s stamp in one transaction', async (t) => {
  const calls = [];
  t.mock.method(db, 'execute', async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT kind, company_admin_id FROM auth_sessions')) return [[{ kind: 'owner', company_admin_id: 22 }]];
    if (sql.startsWith('SELECT email FROM company_admins')) return [[{ email: 'owner@x.com' }]];
    return [{ affectedRows: 1 }];
  });
  await sessions.real.changeOwnPassword({ userId: 5, sessionId: SID }, 'new-hash');
  const batch = calls.find((c) => c.sql.includes('BEGIN TRAN'));
  assert.match(batch.sql, /UPDATE users SET password[\s\S]*UPDATE company_admins SET password[\s\S]*UPDATE auth_sessions SET stamp[\s\S]*COMMIT TRAN/);
  assert.deepEqual(batch.params, ['new-hash', 5, 'new-hash', 5, sessions.fingerprint('owner@x.com', 'new-hash'), SID]);
  const revoke = calls.find((c) => c.sql.includes('UPDATE auth_sessions SET revoked_at'));
  assert.deepEqual(revoke.params.slice(1), [5, SID, SID], 'every other device of this person is signed out');
});
