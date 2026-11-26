const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../src/config/database');

process.env.JWT_SECRET = 'handover-test-only';

async function client(t, identity) {
  const app = express(); app.use(express.json());
  app.use(require('../src/routes/tasks/handover'));
  app.use(require('../src/routes/tasks/sendBack'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const token = jwt.sign({ org_ids: [4, 9], ...identity }, process.env.JWT_SECRET);
  return async (path, method = 'GET', body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  };
}

// Task 40 "Quote for Acme" sits in IT (team 2, GreenCall org 4). Sales (team 7) and Finance (team 8, Vision org 9)
// belong to the same company. Rahul (21) leads Sales; Finance has no leader. Asha (10) is the IT manager.
function fakeDb(t, { task = {}, leaderOfIT = false, step = null, openSubtasks = 0, stillInTeam = true } = {}) {
  const calls = [];
  t.mock.method(db, 'execute', async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('FROM tasks t LEFT JOIN teams te ON te.id = t.team_id WHERE t.id = ?')) {
      return [[{ id: 40, title: 'Quote for Acme', team_id: 2, org_id: 4, status: 'IN_PROGRESS', issue_type: 'task', assigned_to: 10, assigned_by: 10, parent_task_id: null, version: 3, team_name: 'IT', ...task }]];
    }
    if (sql.includes('FROM team_members tm') && sql.includes('JOIN teams t ON t.id = tm.team_id')) return [[{ id: 1 }]];
    if (sql.startsWith('SELECT TOP 1 is_reporting_manager')) return [[{ is_reporting_manager: leaderOfIT ? 1 : 0 }]];
    if (sql.includes('parent_task_id = ?') && sql.includes('COUNT(*)')) return [[{ n: openSubtasks }]];
    if (sql.includes('JOIN organizations o2 ON o2.company_admin_id')) return [[{ id: 4 }, { id: 9 }]];
    if (sql.includes('OUTER APPLY')) return [[
      { id: 7, name: 'Sales', org_id: 4, workspace: 'GreenCall', leader_id: 21, leader_name: 'Rahul' },
      { id: 8, name: 'Finance', org_id: 9, workspace: 'Vision India', leader_id: null, leader_name: null },
    ]];
    if (sql.includes('FROM task_handovers h JOIN teams ft')) return [step ? [step] : []];
    if (sql.startsWith('SELECT TOP 1 id FROM team_members WHERE team_id = ? AND user_id = ?')) return [stillInTeam ? [{ id: 1 }] : []];
    if (sql.startsWith('SELECT TOP 1 u.id, u.name FROM team_members tm')) return [Number(params[0]) === 2 ? [{ id: 12, name: 'Vikas' }] : Number(params[0]) === 7 && Number(params[1]) !== 21 ? [{ id: 21, name: 'Rahul' }] : []];
    if (sql.startsWith('SELECT name FROM users WHERE id = ?')) return [[{ name: 'Asha' }]];
    if (sql.startsWith('SELECT id, name FROM users WHERE id = ?')) return [[{ id: Number(params[0]), name: Number(params[0]) === 21 ? 'Rahul' : 'Someone' }]];
    if (sql.startsWith('UPDATE tasks SET team_id')) return [{ affectedRows: 1 }];
    if (sql.startsWith('UPDATE tasks SET assigned_to')) return [{ affectedRows: 1 }];
    if (sql.includes('FROM org_modules')) return [[{ is_enabled: false }]];
    if (sql.startsWith('INSERT') || sql.startsWith('UPDATE') || sql.startsWith('DELETE')) return [{ affectedRows: 1 }];
    return [[]];
  });
  return calls;
}

test('only managers and team leaders can hand over; others are told why', async (t) => {
  fakeDb(t);
  let send = await client(t, { id: 30, role: 'person', org_id: 4 });
  assert.deepEqual((await send('/40/handover')).body, { allowed: false, reason: 'Only managers and team leaders can hand a task over.', teams: [] });
  assert.equal((await send('/40/handover', 'POST', { team_id: 7 })).status, 403);
  t.mock.restoreAll();
  fakeDb(t, { leaderOfIT: true });
  send = await client(t, { id: 30, role: 'person', org_id: 4 });
  const options = await send('/40/handover');
  assert.equal(options.body.allowed, true, 'the team leader may');
  assert.deepEqual(options.body.teams.map((x) => [x.name, x.workspace, x.leader?.name || null]), [['Sales', 'GreenCall', 'Rahul'], ['Finance', 'Vision India', null]]);
});

test('handing over moves the task to the other team\'s leader, records the step and tells them', async (t) => {
  const calls = fakeDb(t);
  const send = await client(t, { id: 10, role: 'manager', org_id: 4 });
  const done = await send('/40/handover', 'POST', { team_id: 7, note: 'Please send the price list' });
  assert.equal(done.status, 200);
  assert.equal(done.body.message, 'Handed over to Sales (Rahul).');
  const move = calls.find((c) => c.sql.startsWith('UPDATE tasks SET team_id'));
  assert.deepEqual(move.params, [7, 4, 21, 0, 0, 0, 0, 40, 2, null, null], 'to Sales, same workspace, Rahul, only while still in IT');
  assert.ok(calls.some((c) => c.sql.startsWith('DELETE FROM task_followers') && c.params[1] === 7), 'IT followers stop following');
  assert.ok(!calls.some((c) => c.sql.startsWith('DELETE FROM task_label_links')), 'same workspace keeps labels');
  assert.deepEqual(calls.find((c) => c.sql.startsWith('INSERT INTO task_handovers')).params, [40, 2, 7, 10, 21, 'Please send the price list']);
  assert.match(calls.find((c) => c.sql.startsWith('INSERT INTO task_comments')).params[2], /^Handed over from IT to Sales \(Rahul\): Please send the price list$/);
  const note = calls.find((c) => c.sql.startsWith('INSERT INTO notifications'));
  assert.equal(note.params[0], 21);
});

test('a team without a leader, a team of another company, a subtask or open subtasks are refused', async (t) => {
  let calls = fakeDb(t);
  let send = await client(t, { id: 10, role: 'manager', org_id: 4 });
  assert.match((await send('/40/handover', 'POST', { team_id: 8 })).body.error, /no team leader/);
  assert.equal((await send('/40/handover', 'POST', { team_id: 99 })).status, 422, 'not a team of this company');
  assert.equal(calls.filter((c) => c.sql.startsWith('UPDATE tasks SET team_id')).length, 0);
  t.mock.restoreAll();
  fakeDb(t, { task: { parent_task_id: 39 } });
  send = await client(t, { id: 10, role: 'manager', org_id: 4 });
  assert.match((await send('/40/handover', 'POST', { team_id: 7 })).body.error, /subtask/);
  t.mock.restoreAll();
  calls = fakeDb(t, { openSubtasks: 2 });
  send = await client(t, { id: 10, role: 'manager', org_id: 4 });
  assert.match((await send('/40/handover', 'POST', { team_id: 7 })).body.error, /open subtasks/);
});

const handedToSales = { id: 5, from_team_id: 2, from_user_id: 10, to_user_id: 21, from_team_name: 'IT', from_org_id: 4, from_user_name: 'Asha', from_user_deleted: false };

test('Send back by the leader who received it goes one step back, to the team and person it came from', async (t) => {
  const calls = fakeDb(t, { task: { team_id: 7, team_name: 'Sales', assigned_to: 21 }, step: handedToSales });
  const send = await client(t, { id: 21, role: 'manager', org_id: 4 });
  const info = await send('/40/send-back');
  assert.deepEqual(info.body, { allowed: true, to: { id: 10, name: 'Asha' }, team: { id: 2, name: 'IT' } });
  const done = await send('/40/send-back', 'POST', { reason: 'We do not quote this product' });
  assert.equal(done.status, 200);
  assert.equal(done.body.message, 'Sent back to Asha.');
  assert.deepEqual(calls.find((c) => c.sql.startsWith('UPDATE tasks SET team_id')).params, [2, 4, 10, 0, 0, 0, 0, 40, 7, 21, 21], 'only while still with Rahul');
  assert.ok(calls.some((c) => c.sql.startsWith('UPDATE task_handovers SET returned_at') && c.params[0] === 5));
  assert.match(calls.find((c) => c.sql.startsWith('INSERT INTO task_comments')).params[2], /^Sent back from Sales to IT \(Asha\): We do not quote this product$/);
});

test('Send back by someone the leader gave it to goes to that leader, inside the team', async (t) => {
  const calls = fakeDb(t, { task: { team_id: 7, team_name: 'Sales', assigned_to: 33, assigned_by: 10 }, step: handedToSales });
  const send = await client(t, { id: 33, role: 'person', org_id: 4 });
  const done = await send('/40/send-back', 'POST', { reason: 'Not my product line' });
  assert.equal(done.body.message, 'Sent back to Rahul.');
  assert.equal(calls.filter((c) => c.sql.startsWith('UPDATE tasks SET team_id')).length, 0, 'it stays in Sales');
  assert.equal(calls.find((c) => c.sql.startsWith('UPDATE tasks SET assigned_to')).params[0], 21);
});

test('My Tasks → Handed over shows what I handed over, where it is now and its status', async (t) => {
  let asked;
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.includes('FROM task_handovers h')) { asked = params; return [[{ id: 5, task_id: 40, title: 'Quote for Acme', status: 'IN_PROGRESS', current_team: 'Finance', workspace: 'Vision India', assignee: 'Meena', returned_at: null, is_deleted: 0, rn: 1 }]]; }
    return [[]];
  });
  const send = await client(t, { id: 10, role: 'manager', org_id: 4 });
  const list = await send('/handed-over');
  assert.deepEqual(asked, [10], 'only my own hand overs');
  assert.deepEqual(list.body, [{ id: 5, task_id: 40, title: 'Quote for Acme', status: 'IN_PROGRESS', current_team: 'Finance', workspace: 'Vision India', assignee: 'Meena', returned_at: null, is_deleted: false, sent_back: false }]);
});

test('if the person who handed it over has left that team, a send back reaches that team\'s leader', async (t) => {
  const calls = fakeDb(t, { task: { team_id: 7, team_name: 'Sales', assigned_to: 21 }, step: handedToSales, stillInTeam: false });
  const send = await client(t, { id: 21, role: 'manager', org_id: 4 });
  assert.deepEqual((await send('/40/send-back')).body.to, { id: 12, name: 'Vikas' });
  await send('/40/send-back', 'POST', { reason: 'We do not quote this product' });
  assert.equal(calls.find((c) => c.sql.startsWith('UPDATE tasks SET team_id')).params[2], 12);
});

test('a new leader of the receiving team can send it back across too', async (t) => {
  const calls = fakeDb(t, { task: { team_id: 7, team_name: 'Sales', assigned_to: 22 }, step: handedToSales, leaderOfIT: true });
  const send = await client(t, { id: 22, role: 'person', org_id: 4 });
  const done = await send('/40/send-back', 'POST', { reason: 'Not ours any more' });
  assert.equal(done.status, 200);
  assert.deepEqual(calls.find((c) => c.sql.startsWith('UPDATE tasks SET team_id')).params.slice(0, 3), [2, 4, 10]);
});
