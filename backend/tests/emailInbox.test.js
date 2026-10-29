const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../src/config/database');

process.env.JWT_SECRET = 'inbox-test-only';
const { router } = require('../src/routes/superAdminAuth');
const { seal, open } = require('../src/services/secretBox');
const { fetchEmailsAndCreateTasks } = require('../src/utils/emailToTask');

const MASTER = String(process.env.SUPER_ADMIN_EMAIL || 'superadmin@navtask.com').toLowerCase();

async function client(t) {
  const app = express(); app.use(express.json()); app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const token = jwt.sign({ role: 'super_admin', mfa: true, email: MASTER }, process.env.JWT_SECRET);
  return async (path, method = 'GET', body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  };
}

test('mailbox passwords are sealed, and a wrong key cannot open them', () => {
  const sealed = seal('app-pass-1234');
  assert.notEqual(sealed, 'app-pass-1234');
  assert.equal(open(sealed), 'app-pass-1234');
  process.env.SECRET_BOX_KEY = 'other-key';
  try { assert.throws(() => open(sealed)); } finally { delete process.env.SECRET_BOX_KEY; }
});

test('the console saves an inbox with a sealed password, never sends it back, and needs a team of that organization', async (t) => {
  let stored = null;
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('SELECT id, name, company_code FROM organizations')) return [[{ id: 8, name: 'Acme Outsourcing' }]];
    if (sql.startsWith('SELECT secret FROM org_email_inboxes')) return [stored ? [{ secret: stored.secret }] : []];
    if (sql.startsWith('SELECT id, name FROM teams WHERE id = ?')) return [params[0] === 4 ? [{ id: 4, name: 'All staff' }] : []];
    if (sql.startsWith('MERGE org_email_inboxes')) { stored = { secret: params[4], username: params[3] }; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('SELECT * FROM org_email_inboxes')) return [[{ host: 'imap.gmail.com', port: 993, username: stored.username, secret: stored.secret, team_id: 4 }]];
    return [{ affectedRows: 1 }];
  });
  const send = await client(t);
  assert.equal((await send('/organizations/8/email-inbox', 'PUT', { host: 'imap.gmail.com', username: 'tasks@x.com', password: 'p', team_id: 99 })).status, 422);
  assert.equal((await send('/organizations/8/email-inbox', 'PUT', { host: 'imap.gmail.com', username: 'tasks@x.com', team_id: 4 })).status, 422);
  const saved = await send('/organizations/8/email-inbox', 'PUT', { host: 'IMAP.gmail.com', username: 'tasks@x.com', password: 'secret-pass', team_id: 4 });
  assert.equal(saved.status, 200);
  assert.equal(open(stored.secret), 'secret-pass');
  assert.equal(saved.body.inbox.has_password, true);
  assert.ok(!JSON.stringify(saved.body).includes('secret-pass') && !JSON.stringify(saved.body).includes(stored.secret));
  const again = await send('/organizations/8/email-inbox', 'PUT', { host: 'imap.gmail.com', username: 'tasks@x.com', team_id: 4 });
  assert.equal(again.status, 200);
  assert.equal(open(stored.secret), 'secret-pass');
});

test('only organizations with "Email to task" turned on have their inbox read', async (t) => {
  const calls = [];
  t.mock.method(db, 'execute', async (sql) => { calls.push(sql); return [[]]; });
  delete process.env.TASK_INBOX_HOST;
  await fetchEmailsAndCreateTasks();
  assert.match(calls[0], /JOIN org_modules m ON m\.org_id = i\.org_id AND m\.module_key = 'email_to_task' AND m\.is_enabled = 1/);
  assert.equal(calls.length, 1);
});
