const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../src/config/database');
const router = require('../src/routes/teams');

async function client(t, identity) {
  process.env.JWT_SECRET = 'teams-test-only';
  const app = express(); app.use(express.json()); app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const token = jwt.sign(identity, process.env.JWT_SECRET);
  return (path, method = 'GET', body) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test('employees cannot rename teams, search candidates or change member roles', async (t) => {
  const calls = [];
  t.mock.method(db, 'execute', async (sql) => { calls.push(sql); return [[]]; });
  const send = await client(t, { id: 10, role: 'person', org_id: 1 });
  assert.equal((await send('/7', 'PATCH', { name: 'X' })).status, 403);
  assert.equal((await send('/7/candidates?q=a')).status, 403);
  assert.equal((await send('/7/members/3', 'PATCH', { role: 'Lead' })).status, 403);
  assert.equal(calls.length, 0);
});

test('candidate search is limited to the team organization and excludes current members', async (t) => {
  let search;
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('SELECT id FROM teams')) return [[{ id: 7 }]];
    search = { sql, params };
    return [[{ id: 3, name: 'Asha' }]];
  });
  const send = await client(t, { id: 10, role: 'admin', org_id: 1 });
  const response = await send('/7/candidates?q=as');
  assert.equal(response.status, 200);
  assert.match(search.sql, /u\.org_id = t\.org_id/);
  assert.match(search.sql, /NOT EXISTS \(SELECT 1 FROM team_members/);
  assert.deepEqual(search.params, [7, 'as', '%as%', '%as%']);
});

test('adding someone already in the team is refused with a clear message', async (t) => {
  t.mock.method(db, 'execute', async (sql) => {
    if (sql.startsWith('SELECT id FROM teams')) return [[{ id: 7 }]];
    if (sql.startsWith('SELECT tm.id')) return [[{ id: 1 }]];
    if (sql.includes('FROM users u')) return [[{ id: 3 }]];
    if (sql.startsWith('UPDATE team_members SET auto_added = 0')) return [{ affectedRows: 0 }];
    if (sql.startsWith('SELECT id FROM team_members')) return [[{ id: 1 }]];
    throw Error(`Unexpected query: ${sql.slice(0, 50)}`);
  });
  const send = await client(t, { id: 10, role: 'manager', org_id: 1 });
  const response = await send('/7/members', 'POST', { user_id: 3, role: 'Member' });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /already in the team/);
});

const adminRouter = require('../src/routes/admin');
async function adminClient(t, identity) {
  process.env.JWT_SECRET = 'teams-test-only';
  const app = express(); app.use(express.json()); app.use(adminRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const token = jwt.sign(identity, process.env.JWT_SECRET);
  return (path, method = 'GET', body) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test('org admins cannot set unknown roles, change their own role or delete themselves', async (t) => {
  const calls = [];
  t.mock.method(db, 'execute', async (sql) => { calls.push(sql); return [[{ id: 5 }]]; });
  const send = await adminClient(t, { id: 10, role: 'admin', org_id: 1 });
  assert.equal((await send('/users/5/role', 'PUT', { role: 'company_admin' })).status, 422);
  assert.equal((await send('/users/10/role', 'PUT', { role: 'person' })).status, 400);
  assert.equal((await send('/users/10', 'DELETE')).status, 400);
  assert.equal(calls.length, 0);
});

test('user search and role filter stay inside the organization', async (t) => {
  const queries = [];
  t.mock.method(db, 'execute', async (sql, params) => { queries.push({ sql, params }); return sql.includes('COUNT(*)') ? [[{ total: 0 }]] : [[]]; });
  const send = await adminClient(t, { id: 10, role: 'admin', org_id: 1 });
  assert.equal((await send('/users?q=ram&role=manager')).status, 200);
  assert.deepEqual(queries[0].params, [1, '%ram%', '%ram%', '%ram%', 'manager']);
  assert.match(queries[1].sql, /u\.org_id = \?/);
});

test('only admins choose a team leader; a member who is made leader becomes a manager and the old leader a member', async (t) => {
  const writes = [];
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('SELECT id FROM teams')) return [[{ id: 7 }]];
    if (sql.startsWith('SELECT u.id, u.role, u.org_id FROM users u')) return [[{ id: 3, role: 'person', org_id: 1 }]];
    if (sql.includes('max_managers_per_company')) return [[{ max: 10, used: 2 }]];
    if (sql.startsWith('UPDATE') || sql.startsWith('INSERT')) { writes.push({ sql, params }); return [{ affectedRows: sql.includes('is_reporting_manager = 1, auto_added = 0') ? 0 : 1 }]; }
    throw Error(`Unexpected query: ${sql.slice(0, 50)}`);
  });
  const asManager = await client(t, { id: 10, role: 'manager', org_id: 1 });
  assert.equal((await asManager('/7/leader', 'PUT', { user_id: 3 })).status, 403);
  assert.equal(writes.length, 0);

  const asAdmin = await client(t, { id: 10, role: 'admin', org_id: 1 });
  const response = await asAdmin('/7/leader', 'PUT', { user_id: 3 });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).promoted, true);
  assert.match(writes[0].sql, /UPDATE users SET role = 'manager'/);
  assert.match(writes[1].sql, /is_reporting_manager = 0/);
  assert.deepEqual(writes[1].params, [7, 3]);
  assert.match(writes[3].sql, /^INSERT INTO team_members/, 'joins the team when not in it yet');
});

test('making someone a manager can put them in charge of teams, but only teams of the same organization', async (t) => {
  const writes = [];
  let teamsFound = [{ id: 7 }];
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('SELECT id FROM users')) return [[{ id: 5 }]];
    if (sql.startsWith('SELECT id FROM teams WHERE org_id')) return [teamsFound];
    if (sql.startsWith('SELECT u.id, u.role, u.org_id FROM users u')) return [[{ id: 5, role: 'manager', org_id: 1 }]];
    if (sql.startsWith('UPDATE') || sql.startsWith('INSERT')) { writes.push({ sql, params }); return [{ affectedRows: 1 }]; }
    throw Error(`Unexpected query: ${sql.slice(0, 50)}`);
  });
  const send = await adminClient(t, { id: 10, role: 'admin', org_id: 1 });
  assert.equal((await send('/users/5/role', 'PUT', { role: 'manager', lead_team_ids: [7] })).status, 200);
  assert.ok(writes.some((w) => w.sql.startsWith('UPDATE users SET role = ?') && w.params[0] === 'manager'));
  assert.ok(writes.some((w) => w.sql.includes('is_reporting_manager = 1, auto_added = 0') && w.params[1] === 7));

  writes.length = 0; teamsFound = [];
  assert.equal((await send('/users/5/role', 'PUT', { role: 'manager', lead_team_ids: [99] })).status, 422);
  assert.equal(writes.length, 0, 'nothing changes when a team is from elsewhere');

  assert.equal((await send('/users/5/role', 'PUT', { role: 'person' })).status, 200);
  assert.ok(writes.some((w) => w.sql.includes('WHERE user_id = ? AND is_reporting_manager = 1')), 'a member leads nothing');
});
