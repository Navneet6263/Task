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

// Team 7 is in GreenCall (org 1); the same company also runs Vision India (org 9).
function companyDb(t, { person, calls = [] } = {}) {
  t.mock.method(db, 'execute', async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT id FROM teams WHERE id = ? AND org_id = ?')) return [[{ id: 7 }]];
    if (sql.startsWith('SELECT tm.id')) return [[{ id: 1 }]];
    if (sql.startsWith('SELECT id, org_id FROM teams')) return [[{ id: 7, org_id: 1 }]];
    if (sql.includes('JOIN organizations o2 ON o2.company_admin_id')) return [[{ id: 1 }, { id: 9 }]];
    if (sql.startsWith('SELECT TOP 20 u.id')) return [[
      { id: 3, name: 'Asha', org_id: 1, workspace: 'GreenCall', in_workspace: 1 },
      { id: 5, name: 'Ravi', org_id: 9, workspace: 'Vision India', in_workspace: 0 },
    ]];
    if (sql.startsWith('SELECT u.id, u.role, u.org_id')) return [person ? [person] : []];
    if (sql.startsWith('UPDATE team_members SET auto_added = 0')) return [{ affectedRows: 0 }];
    if (sql.startsWith('SELECT id FROM team_members')) return [[]];
    if (sql.startsWith('SELECT org_id FROM teams')) return [[{ org_id: 1 }]];
    if (sql.trim().startsWith('IF') || sql.startsWith('INSERT') || sql.startsWith('UPDATE') || sql.startsWith('DELETE')) return [{ affectedRows: 1 }];
    return [[]];
  });
  return calls;
}

test('Add people lists everyone from the company\'s workspaces who is not in the team, this workspace first', async (t) => {
  const calls = companyDb(t);
  const send = await client(t, { id: 10, role: 'admin', org_id: 1 });
  const response = await send('/7/candidates?q=as');
  assert.equal(response.status, 200);
  const list = await response.json();
  assert.deepEqual(list.map((p) => [p.name, p.workspace, p.other_workspace, p.in_workspace]), [['Asha', 'GreenCall', false, true], ['Ravi', 'Vision India', true, false]]);
  const search = calls.find((c) => c.sql.startsWith('SELECT TOP 20 u.id'));
  assert.match(search.sql, /NOT EXISTS \(SELECT 1 FROM team_members/);
  assert.match(search.sql, /u\.org_id IN \(\?,\?\)/, 'only this company\'s workspaces');
  assert.deepEqual(search.params, [1, 1, 1, 9, 1, 7, 'as', '%as%', '%as%', 1]);
});

test('adding someone already in the team is refused with a clear message', async (t) => {
  t.mock.method(db, 'execute', async (sql) => {
    if (sql.startsWith('SELECT tm.id')) return [[{ id: 1 }]];
    if (sql.startsWith('SELECT id, org_id FROM teams')) return [[{ id: 7, org_id: 1 }]];
    if (sql.includes('JOIN organizations o2 ON o2.company_admin_id')) return [[{ id: 1 }]];
    if (sql.startsWith('SELECT u.id, u.role, u.org_id')) return [[{ id: 3, role: 'person', org_id: 1, in_workspace: 1 }]];
    if (sql.startsWith('UPDATE team_members SET auto_added = 0')) return [{ affectedRows: 0 }];
    if (sql.startsWith('SELECT id FROM team_members')) return [[{ id: 1 }]];
    if (sql.trim().startsWith('IF')) return [{}];
    throw Error(`Unexpected query: ${sql.slice(0, 50)}`);
  });
  const send = await client(t, { id: 10, role: 'manager', org_id: 1 });
  const response = await send('/7/members', 'POST', { user_id: 3, role: 'Member' });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /already in the team/);
});

test('someone from another workspace of the company joins the team and gets access to its workspace', async (t) => {
  const calls = companyDb(t, { person: { id: 5, role: 'person', org_id: 9, in_workspace: 0 } });
  const send = await client(t, { id: 10, role: 'manager', org_id: 1 });
  assert.equal((await send('/7/members', 'POST', { user_id: 5, role: 'Member' })).status, 200);
  const grant = calls.find((c) => c.sql.includes('INSERT INTO user_org_access'));
  assert.deepEqual(grant.params, [5, 1, 5, 1, 10], 'access to GreenCall, given by the manager');
  const lookup = calls.find((c) => c.sql.startsWith('SELECT u.id, u.role, u.org_id'));
  assert.equal((lookup.sql.match(/\?/g) || []).length, lookup.params.length, 'every placeholder has its value');
  assert.deepEqual(lookup.params, [1, 1, 5, 1, 9, 1], 'workspace, workspace, person, company workspaces, workspace');
  assert.ok(calls.some((c) => c.sql.startsWith('INSERT INTO team_members') && c.params[1] === 5));
});

test('an admin of another workspace can be brought in by an admin only, never by a manager', async (t) => {
  let calls = companyDb(t, { person: { id: 6, role: 'admin', org_id: 9, in_workspace: 0 } });
  let send = await client(t, { id: 10, role: 'manager', org_id: 1 });
  const refused = await send('/7/members', 'POST', { user_id: 6 });
  assert.equal(refused.status, 403);
  assert.match((await refused.json()).error, /Ask an admin/);
  assert.equal(calls.filter((c) => c.sql.startsWith('INSERT') || c.sql.includes('INSERT INTO user_org_access')).length, 0);
  t.mock.restoreAll();
  calls = companyDb(t, { person: { id: 6, role: 'admin', org_id: 9, in_workspace: 0 } });
  send = await client(t, { id: 11, role: 'admin', org_id: 1 });
  assert.equal((await send('/7/members', 'POST', { user_id: 6 })).status, 200);
});

test('nobody outside the company can be added', async (t) => {
  const calls = companyDb(t, { person: null });
  const send = await client(t, { id: 10, role: 'manager', org_id: 1 });
  const response = await send('/7/members', 'POST', { email: 'someone@othercompany.com' });
  assert.equal(response.status, 404);
  assert.equal(calls.filter((c) => c.sql.startsWith('INSERT')).length, 0);
});

test('the company admin sees the teams of the workspace picked at the top only', async (t) => {
  let list;
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('SELECT id FROM organizations WHERE company_admin_id')) return [[{ id: 4 }, { id: 9 }]];
    if (sql.startsWith('SELECT t.*')) { list = { sql, params }; return [[]]; }
    return [[]];
  });
  process.env.JWT_SECRET = 'teams-test-only';
  const app = express(); app.use(express.json()); app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const token = jwt.sign({ id: 3, role: 'company_admin', company_admin_id: 22, org_id: 4, org_ids: [4, 9] }, process.env.JWT_SECRET);
  await fetch(`http://127.0.0.1:${server.address().port}/`, { headers: { authorization: `Bearer ${token}`, 'x-org-id': '9' } });
  assert.match(list.sql, /t\.org_id = \?/);
  assert.equal(list.params[0], 9, 'Vision India picked: only its teams');
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
    if (sql.startsWith('SELECT u.id, u.role, t.org_id FROM users u')) return [[{ id: 3, role: 'person', org_id: 1 }]];
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
    if (sql.startsWith('SELECT id, email, org_id, role FROM users')) return [[{ id: 5, email: 'asha@x.com', org_id: 1, role: 'person' }]];
    if (sql.includes('JOIN company_admins ca')) return [[{ email: 'owner@x.com' }]];
    if (sql.startsWith('SELECT id FROM company_co_admins')) return [[]];
    if (sql.startsWith('SELECT id FROM teams WHERE org_id')) return [teamsFound];
    if (sql.startsWith('SELECT u.id, u.role, t.org_id FROM users u')) return [[{ id: 5, role: 'manager', org_id: 1 }]];
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

test('organization admins cannot change the role of, or delete, the company owner or a co-admin', async (t) => {
  const writes = [];
  let target = { id: 6, email: 'owner@x.com', org_id: 1, role: 'admin' };
  let coAdmin = false;
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('SELECT id, email, org_id')) return [[target]];
    if (sql.includes('JOIN company_admins ca')) return [[{ email: 'owner@x.com' }]];
    if (sql.startsWith('SELECT id FROM company_co_admins')) return [coAdmin ? [{ id: 1 }] : []];
    if (sql.startsWith('UPDATE') || sql.startsWith('INSERT') || sql.startsWith('DELETE')) { writes.push(sql); return [{ affectedRows: 1 }]; }
    return [[]];
  });
  const send = await adminClient(t, { id: 10, role: 'admin', org_id: 1 });
  assert.equal((await send('/users/6/role', 'PUT', { role: 'person' })).status, 409, 'the owner login keeps its role');
  assert.equal((await send('/users/6', 'DELETE')).status, 409, 'the owner login is not deleted from here');
  target = { id: 7, email: 'co@x.com', org_id: 1, role: 'admin' }; coAdmin = true;
  assert.equal((await send('/users/7/role', 'PUT', { role: 'manager' })).status, 409, 'a co-admin keeps their role');
  assert.equal((await send('/users/7', 'DELETE')).status, 409, 'a co-admin is not deleted from here');
  assert.equal(writes.length, 0);
});

test('a manager brings in members from another workspace only; its managers come through an admin', async (t) => {
  const calls = companyDb(t, { person: { id: 6, role: 'manager', org_id: 9, in_workspace: 0 } });
  const send = await client(t, { id: 10, role: 'manager', org_id: 1 });
  const refused = await send('/7/members', 'POST', { user_id: 6 });
  assert.equal(refused.status, 403);
  assert.match((await refused.json()).error, /a manager in another workspace/);
  assert.equal(calls.filter((c) => c.sql.includes('INSERT INTO user_org_access') || c.sql.startsWith('INSERT INTO team_members')).length, 0);
});

test('someone who leaves their last team in a workspace they were brought into loses that workspace again', async (t) => {
  const calls = companyDb(t);
  const send = await client(t, { id: 10, role: 'manager', org_id: 1 });
  assert.equal((await send('/7/members/5', 'DELETE')).status, 200);
  const release = calls.find((c) => c.sql.startsWith('DELETE FROM user_org_access'));
  assert.match(release.sql, /via_team = 1/, 'only access that came from a team, never what an admin gave');
  assert.match(release.sql, /NOT EXISTS \(SELECT 1 FROM team_members/, 'only after their last team there');
  assert.deepEqual(release.params, [5, 1, 5, 1, 5, 1]);
});
