const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../src/config/database');
const router = require('../src/routes/teams');
const { syncTeamShares } = require('../src/services/teamSharing');

async function client(t, identity) {
  process.env.JWT_SECRET = 'team-sharing-test-only';
  const app = express(); app.use(express.json()); app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const token = jwt.sign(identity, process.env.JWT_SECRET);
  return (path, method = 'GET', body) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test('a share adds only the viewer team\'s own members, and removes only rows it added', async (t) => {
  const calls = [];
  t.mock.method(db, 'execute', async (sql, params) => { calls.push({ sql, params }); return [{ affectedRows: 2 }]; });
  const result = await syncTeamShares(1);
  assert.deepEqual(result, { added: 2, removed: 2 });
  assert.match(calls[0].sql, /INSERT INTO team_members \(team_id, user_id, role, auto_added, shared_from_team_id\)/);
  assert.match(calls[0].sql, /vm\.auto_added = 0/, 'people who are in the viewer team only through another switch do not spread');
  assert.match(calls[1].sql, /^UPDATE tm SET auto_added = 0, shared_from_team_id = NULL/, 'people with tasks there keep their place');
  assert.match(calls[2].sql, /^DELETE tm FROM team_members tm/);
  assert.match(calls[2].sql, /tm\.shared_from_team_id IS NOT NULL/, 'never touches real or show-all members');
});

test('only admins share teams, and only with a team of the same organization', async (t) => {
  const writes = [];
  let otherOrg = 1;
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('SELECT id FROM teams WHERE id = ? AND org_id')) return [[{ id: params[0] }]];
    if (sql.startsWith('SELECT id, org_id FROM teams WHERE id IN')) return [[{ id: 7, org_id: 1 }, { id: 8, org_id: otherOrg }]];
    if (sql.includes('INSERT INTO team_shares') || sql.startsWith('INSERT INTO team_members') || sql.startsWith('UPDATE tm') || sql.startsWith('DELETE')) { writes.push({ sql, params }); return [{ affectedRows: 0 }]; }
    if (sql.includes('FROM team_shares s JOIN teams a')) return [[{ team_id: 7, viewer_team_id: 8, team_name: 'Payroll', viewer_name: 'Audit', viewer_members: 3, team_members: 4 }, { team_id: 8, viewer_team_id: 7, team_name: 'Audit', viewer_name: 'Payroll', viewer_members: 4, team_members: 3 }]];
    return [[]];
  });
  const asManager = await client(t, { id: 10, role: 'manager', org_id: 1 });
  assert.equal((await asManager('/7/sharing', 'POST', { team_id: 8 })).status, 403);
  assert.equal(writes.length, 0);

  const asAdmin = await client(t, { id: 10, role: 'admin', org_id: 1 });
  const ok = await asAdmin('/7/sharing', 'POST', { team_id: 8, both_ways: true });
  assert.equal(ok.status, 200);
  const shares = writes.filter((w) => w.sql.includes('INSERT INTO team_shares'));
  assert.deepEqual(shares.map((w) => [w.params[3], w.params[4]]), [[7, 8], [8, 7]], 'both directions');
  const body = await ok.json();
  assert.deepEqual(body.shared_with, [{ id: 8, name: 'Audit', members: 3, both_ways: true }]);

  otherOrg = 2; writes.length = 0;
  assert.equal((await asAdmin('/7/sharing', 'POST', { team_id: 8 })).status, 422);
  assert.equal(writes.filter((w) => w.sql.includes('INSERT INTO team_shares')).length, 0);
});

test('an admin can create a team with its leader and members; people from elsewhere are refused', async (t) => {
  const inserts = [];
  let found = [{ id: 3 }, { id: 4 }];
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('SELECT id FROM users WHERE org_id')) return [found];
    if (sql.startsWith('INSERT INTO teams')) { inserts.push({ sql, params }); return [{ insertId: 50 }]; }
    if (sql.startsWith('SELECT u.id, u.role, u.org_id FROM users u')) return [[{ id: 3, role: 'manager', org_id: 1 }]];
    if (sql.startsWith('INSERT') || sql.startsWith('UPDATE')) { inserts.push({ sql, params }); return [{ affectedRows: sql.includes('is_reporting_manager = 1') ? 1 : 0 }]; }
    return [[]];
  });
  const send = await client(t, { id: 10, role: 'admin', org_id: 1 });
  const ok = await send('/', 'POST', { name: 'Audit', leader_id: 3, member_ids: [4, 3] });
  assert.equal(ok.status, 200);
  assert.ok(!inserts.some((w) => w.sql.startsWith('INSERT INTO team_members') && w.params?.[1] === 10), 'the creator is not added when a leader is chosen');
  assert.ok(inserts.some((w) => w.sql.startsWith('INSERT INTO team_members (team_id, user_id, role) VALUES') && w.params[1] === 4));
  assert.ok(inserts.some((w) => w.sql.includes('is_reporting_manager = 1') && w.params.includes(3)));

  found = [{ id: 3 }];
  assert.equal((await send('/', 'POST', { name: 'X', member_ids: [3, 99] })).status, 422);
});
