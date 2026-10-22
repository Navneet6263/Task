const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const db = require('../src/config/database');
const router = require('../src/routes/communications');

async function client(t, identity = { id: 10, role: 'person', org_id: 1 }) {
  process.env.JWT_SECRET = 'comm-test-only';
  const app = express(); app.use(express.json()); app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const token = jwt.sign(identity, process.env.JWT_SECRET);
  return (path, method = 'GET', body) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function mockDb(t, handle, role = 'person') {
  const calls = [];
  t.mock.method(db, 'execute', async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT u.id, u.role FROM users u')) return [[{ id: 10, role }]];
    return handle(sql, params);
  });
  return calls;
}

const mail = { to: 'client@acme.com; Boss@Acme.com', cc: '', subject: 'Status update', text: 'Hello', task_id: 8 };

test('sending validates addresses before contacting the mail server', async (t) => {
  const send = t.mock.fn();
  t.mock.method(nodemailer, 'createTransport', () => ({ sendMail: send }));
  mockDb(t, () => { throw Error('Unexpected query'); });
  const request = await client(t);
  const response = await request('/send', 'POST', { ...mail, to: 'not-an-email' });
  assert.equal(response.status, 422);
  assert.match((await response.json()).error, /not a valid email/);
  assert.equal(send.mock.callCount(), 0);
});

test('a sent email is logged with the token organization and sender', async (t) => {
  let delivered;
  t.mock.method(nodemailer, 'createTransport', () => ({ sendMail: async (options) => { delivered = options; return { messageId: 'm1' }; } }));
  let logged;
  mockDb(t, async (sql, params) => { if (sql.startsWith('INSERT INTO communication_logs')) { logged = params; return [{}]; } throw Error('Unexpected query'); });
  const request = await client(t);
  const response = await request('/send', 'POST', { ...mail, org_id: 99 });
  assert.equal(response.status, 200);
  assert.equal(delivered.to, 'client@acme.com, boss@acme.com');
  assert.deepEqual(logged.slice(0, 3), [1, 10, 'client@acme.com, boss@acme.com']);
  assert.equal(logged[6], 8);
  assert.equal(logged[8], 'SENT');
});

test('a failed send is still logged as FAILED and reported clearly', async (t) => {
  t.mock.method(nodemailer, 'createTransport', () => ({ sendMail: async () => { throw new Error('auth failed'); } }));
  let logged;
  mockDb(t, async (sql, params) => { logged = params; return [{}]; });
  const request = await client(t);
  const response = await request('/send', 'POST', mail);
  assert.equal(response.status, 502);
  assert.equal(logged[8], 'FAILED');
  assert.equal(logged[9], 'auth failed');
});

test('employees see only their own sent history; managers see the organization', async (t) => {
  const queries = [];
  mockDb(t, async (sql, params) => { queries.push({ sql, params }); return sql.includes('COUNT(*)') ? [[{ total: 0 }]] : [[]]; });
  const request = await client(t);
  const body = await (await request('/history')).json();
  assert.equal(body.scope, 'mine');
  assert.match(queries[0].sql, /l\.org_id = \? AND l\.sent_by = \?/);
  assert.deepEqual(queries[0].params.slice(0, 2), [1, 10]);
});

test('only the author or a manager can change an organization template', async (t) => {
  mockDb(t, async (sql) => {
    if (sql.startsWith('SELECT id, created_by FROM communication_templates')) return [[{ id: 4, created_by: 77 }]];
    throw Error('Unexpected query');
  });
  const request = await client(t);
  assert.equal((await request('/templates/4', 'DELETE')).status, 403);
  assert.equal((await request('/templates/4', 'PUT', { name: 'X', subject: 'Y', body: 'Z' })).status, 403);
});

const chatRouter = require('../src/routes/chat');
test('a 1:1 screen share cannot be joined by other team members', async (t) => {
  process.env.JWT_SECRET = 'comm-test-only';
  const app = express(); app.use(express.json()); app.use(chatRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const writes = [];
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.includes('FROM team_review_sessions') && sql.includes('WHERE id = ?')) return [[{ id: 5, team_id: 2, thread_id: 9, sharer_id: 3, status: 'active' }]];
    if (sql.startsWith('SELECT tm.id') || sql.startsWith('SELECT id FROM team_members')) return [[{ id: 1 }]];
    if (sql.startsWith('SELECT thread_type, direct_user_one')) return [[{ thread_type: 'direct', direct_user_one: 3, direct_user_two: 4 }]];
    writes.push(sql); return [[]];
  });
  const token = jwt.sign({ id: 10, role: 'person', org_id: 1 }, process.env.JWT_SECRET);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/review-sessions/5/join`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /private to a 1:1/);
  assert.deepEqual(writes.map((w) => w.slice(0, 60)), []);
});
