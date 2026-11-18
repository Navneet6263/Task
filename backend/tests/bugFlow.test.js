const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../src/config/database');
const ws = require('../src/websocket');
const bugFlow = require('../src/services/bugFlow');

const { actionsFor, stageOf, whyNot } = bugFlow;
const dev = { id: 21, role: 'developer', isLead: false, teamHasRoles: true };
const qa = { id: 31, role: 'qa', isLead: false, teamHasRoles: true };
const lead = { id: 40, role: null, isLead: true, teamHasRoles: true };

async function client(t, identity) {
  process.env.JWT_SECRET = 'bug-flow-test-only';
  const app = express(); app.use(express.json()); app.use(require('../src/routes/bugs'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const token = jwt.sign(identity, process.env.JWT_SECRET);
  return (path, method = 'GET', body) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

// A small fake database: one bug (task 9 in team 3, org 1) and the team's Developer / QA marks.
function fakeDb(t, { task, roles = [[21, 'developer'], [31, 'qa']], moduleOn = true, busy = 0, leader = false }) {
  const writes = [];
  t.mock.method(ws, 'broadcast', () => {});
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.includes('FROM org_modules')) return [[moduleOn ? { is_enabled: true } : undefined].filter(Boolean)];
    if (sql.startsWith('SELECT * FROM tasks WHERE id = ?')) return [[{ ...task }]];
    if (sql.includes('FROM team_members tm') && sql.includes('JOIN teams t')) return [[{ id: 1 }]]; // team access
    if (sql.includes('FROM team_work_roles')) return [roles.map(([user_id, work_role]) => ({ user_id, work_role }))];
    if (sql.includes('is_reporting_manager FROM team_members')) return [[{ is_reporting_manager: leader }]];
    if (sql.includes('AS busy')) return [[{ busy }]];
    if (sql.includes('AS waiting')) return [[]];
    if (sql.startsWith('SELECT name FROM users')) return [[{ name: `User ${params[0]}` }]];
    if (sql.startsWith('UPDATE tasks SET bug_stage')) { writes.push({ sql, params }); return [{ affectedRows: 1 }]; }
    if (sql.startsWith('INSERT INTO') || sql.startsWith('DELETE')) { writes.push({ sql, params }); return [{ affectedRows: 1 }]; }
    return [[]];
  });
  return writes;
}
const bug = (extra) => ({ id: 9, team_id: 3, org_id: 1, issue_type: 'bug', title: 'Pay fails', status: 'TODO', version: 4, reported_by: 31, ...extra });

test('old bugs get a stage from their status; new ones keep the stage saved', () => {
  assert.equal(stageOf({ status: 'DONE' }), 'done');
  assert.equal(stageOf({ status: 'IN_PROGRESS', assigned_to: 5 }), 'fixing');
  assert.equal(stageOf({ status: 'TODO' }), 'ready');
  assert.equal(stageOf({ status: 'PENDING', fixed_at: '2026-11-17' }), 'qa');
  assert.equal(stageOf({ status: 'TODO', bug_stage: 'new' }), 'new');
});

test('developers pick and fix, QA checks, and nobody passes their own fix', () => {
  assert.deepEqual(actionsFor(bug({ bug_stage: 'new' }), qa), ['ready']);
  assert.deepEqual(actionsFor(bug({ bug_stage: 'new' }), dev), []);
  assert.deepEqual(actionsFor(bug({ bug_stage: 'ready' }), dev), ['pick']);
  assert.deepEqual(actionsFor(bug({ bug_stage: 'ready' }), qa), []);
  assert.deepEqual(actionsFor(bug({ bug_stage: 'fixing', assigned_to: 21 }), dev), ['release', 'fixed']);
  assert.deepEqual(actionsFor(bug({ bug_stage: 'fixing', assigned_to: 22 }), dev), []);
  assert.deepEqual(actionsFor(bug({ bug_stage: 'qa', assigned_to: 21 }), qa), ['pass', 'fail']);
  assert.deepEqual(actionsFor(bug({ bug_stage: 'done', assigned_to: 21 }), qa), ['fail']);
  // Someone who is both developer and QA still cannot check their own fix.
  assert.deepEqual(actionsFor(bug({ bug_stage: 'qa', assigned_to: 21 }), { ...dev, role: 'both' }), []);
  assert.equal(whyNot(bug({ bug_stage: 'qa', assigned_to: 21 }), { ...dev, role: 'both' }, 'pass'), 'You fixed this bug, so someone else has to check it.');
  assert.match(whyNot(bug({ bug_stage: 'ready' }), qa, 'pick'), /Only developers/);
  assert.match(whyNot(bug({ bug_stage: 'done' }), dev, 'pick'), /is in Done now/);
  // Leads may do every step; a company admin has no account in the team, so never picks.
  assert.deepEqual(actionsFor(bug({ bug_stage: 'fixing', assigned_to: 21 }), lead), ['fixed']);
  assert.deepEqual(actionsFor(bug({ bug_stage: 'ready' }), { ...lead, id: null }), []);
  // A team that has not marked anyone yet: everyone may do each step.
  assert.deepEqual(actionsFor(bug({ bug_stage: 'ready' }), { id: 50, role: null, isLead: false, teamHasRoles: false }), ['pick']);
});

test('Pick gives the bug to the developer and moves it to Fixing; the limit stops a fourth', async (t) => {
  const writes = fakeDb(t, { task: bug({ bug_stage: 'ready' }) });
  const send = await client(t, { id: 21, role: 'person', org_id: 1 });
  const res = await send('/9/pick', 'POST');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { stage: 'fixing', status: 'IN_PROGRESS', version: 5 });
  const update = writes.find((w) => w.sql.startsWith('UPDATE tasks SET bug_stage'));
  assert.match(update.sql, /assigned_to = \?, picked_by = \?/);
  assert.deepEqual(update.params, ['fixing', 'IN_PROGRESS', 21, 21, 9, 4]);
  assert.ok(writes.some((w) => w.sql.startsWith('INSERT INTO notifications') && w.params[0] === 31), 'the reporter hears who picked it');

  t.mock.restoreAll();
  fakeDb(t, { task: bug({ bug_stage: 'ready' }), busy: 3 });
  const full = await send('/9/pick', 'POST');
  assert.equal(full.status, 409);
  assert.match((await full.json()).error, /already have 3 bugs in Fixing/);
});

test('Mark fixed needs a note and sends the bug to QA; Fail sends it back and counts the reopen', async (t) => {
  let writes = fakeDb(t, { task: bug({ bug_stage: 'fixing', status: 'IN_PROGRESS', assigned_to: 21 }) });
  const asDev = await client(t, { id: 21, role: 'person', org_id: 1 });
  assert.equal((await asDev('/9/fixed', 'POST', {})).status, 422);
  const ok = await asDev('/9/fixed', 'POST', { note: 'Safari popup fixed' });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).status, 'PENDING');
  const update = writes.find((w) => w.sql.startsWith('UPDATE tasks SET bug_stage'));
  assert.deepEqual(update.params.slice(0, 3), ['qa', 'PENDING', 31], 'the QA who reported it checks the fix');
  assert.ok(writes.some((w) => w.sql.startsWith('INSERT INTO task_comments') && w.params[2] === 'Fixed: Safari popup fixed'));
  assert.ok(writes.some((w) => w.sql.startsWith('INSERT INTO notifications') && w.params[0] === 31));

  t.mock.restoreAll();
  writes = fakeDb(t, { task: bug({ bug_stage: 'qa', status: 'PENDING', assigned_to: 21, qa_user_id: 31 }) });
  const asQa = await client(t, { id: 31, role: 'person', org_id: 1 });
  assert.equal((await asDev('/9/pass', 'POST')).status, 409, 'the developer cannot pass their own fix');
  const back = await asQa('/9/fail', 'POST', { note: 'Still spins on Safari 16' });
  assert.equal(back.status, 200);
  const failed = writes.find((w) => w.sql.startsWith('UPDATE tasks SET bug_stage'));
  assert.match(failed.sql, /reopen_count = reopen_count \+ 1/);
  assert.ok(writes.some((w) => w.sql.startsWith('INSERT INTO notifications') && w.params[0] === 21), 'the developer hears it came back');
});

test('nothing works when the module is off, and only leads set Developer / QA', async (t) => {
  fakeDb(t, { task: bug({ bug_stage: 'ready' }), moduleOn: false });
  const asDev = await client(t, { id: 21, role: 'person', org_id: 1 });
  assert.equal((await asDev('/9/pick', 'POST')).status, 403);

  t.mock.restoreAll();
  const writes = fakeDb(t, { task: bug() });
  assert.equal((await asDev('/teams/3/roles/31', 'PUT', { work_role: 'developer' })).status, 403);
  const asManager = await client(t, { id: 40, role: 'manager', org_id: 1 });
  assert.equal((await asManager('/teams/3/roles/31', 'PUT', { work_role: 'tester' })).status, 422);
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.includes('FROM org_modules')) return [[{ is_enabled: true }]];
    if (sql.startsWith('SELECT org_id FROM teams')) return [[{ org_id: 1 }]];
    if (sql.includes('JOIN teams t')) return [[{ id: 1 }]];
    if (sql.includes('JOIN users u ON u.id = tm.user_id')) return [[{ user_id: 31 }]];
    if (sql.startsWith('DELETE') || sql.startsWith('INSERT')) { writes.push({ sql, params }); return [{ affectedRows: 1 }]; }
    return [[]];
  });
  assert.equal((await asManager('/teams/3/roles/31', 'PUT', { work_role: 'qa' })).status, 200);
  assert.deepEqual(writes.find((w) => w.sql.startsWith('INSERT INTO team_work_roles')).params, [3, 31, 'qa', 40]);
});

test('a plain edit cannot skip QA: only leads change a bug status; a new assignee moves it to Fixing', async (t) => {
  fakeDb(t, { task: bug() });
  const current = bug({ bug_stage: 'ready', status: 'TODO' });
  await assert.rejects(bugFlow.planEdit({ userId: 21, userRole: 'person' }, current, { status: 'DONE', assigned_to: null }), /buttons at the top/);
  assert.deepEqual(await bugFlow.planEdit({ userId: 40, userRole: 'manager' }, current, { status: 'DONE', assigned_to: null }), { stage: 'done', status: 'DONE' });
  assert.deepEqual(await bugFlow.planEdit({ userId: 40, userRole: 'manager' }, current, { status: 'TODO', assigned_to: 21 }), { stage: 'fixing', status: 'IN_PROGRESS' });
  assert.equal(await bugFlow.planEdit({ userId: 21, userRole: 'person' }, { ...current, issue_type: 'task' }, { status: 'DONE' }), null);
});

test('the Bugs board groups bugs by stage, most severe first, and says if this person may pick', async (t) => {
  t.mock.method(db, 'execute', async (sql) => {
    if (sql.includes('FROM org_modules')) return [[{ is_enabled: true }]];
    if (sql.includes('JOIN teams t')) return [[{ id: 1 }]];
    if (sql.startsWith('SELECT org_id FROM teams')) return [[{ org_id: 1 }]];
    if (sql.includes('FROM team_work_roles')) return [[{ user_id: 21, work_role: 'developer' }, { user_id: 31, work_role: 'qa' }]];
    if (sql.includes('is_reporting_manager FROM team_members')) return [[]];
    if (sql.includes("t.issue_type = 'bug'")) {
      return [[
        { id: 1, title: 'Old low', status: 'TODO', bug_stage: 'ready', severity: 'LOW' },
        { id: 2, title: 'Crash', status: 'TODO', bug_stage: 'ready', severity: 'CRITICAL' },
        { id: 3, title: 'Mine', status: 'IN_PROGRESS', bug_stage: 'fixing', assigned_to: 21, reopen_count: 1 },
        { id: 4, title: 'Before the module', status: 'DONE', resolved_at: '2026-11-15' },
        { id: 5, title: 'Reported', status: 'TODO', bug_stage: 'new' },
      ]];
    }
    return [[]];
  });
  const send = await client(t, { id: 21, role: 'person', org_id: 1 });
  const res = await send('/teams/3/board');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.columns.ready.map((b) => b.id), [2, 1], 'critical first');
  assert.deepEqual(body.columns.done.map((b) => b.id), [4], 'a bug from before the module is placed by its status');
  assert.deepEqual(body.counts, { new: 1, ready: 2, fixing: 1, qa: 0, done: 1 });
  assert.deepEqual(body.summary, { open: 4, critical: 1, reopened: 1 });
  assert.equal(body.me.can_pick, true);
  assert.equal(body.me.fixing, 1);
  const asQa = await client(t, { id: 31, role: 'person', org_id: 1 });
  assert.equal((await (await asQa('/teams/3/board')).json()).me.can_pick, false);
});
