const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../src/config/database');
const layoutRules = require('../src/services/taskFormLayout');

const { TEMPLATES, normalizeLayout, cleanCustomValues, buildTitle, isPastEditWindow } = layoutRules;
const asLayout = (key) => normalizeLayout({ template: key, name: TEMPLATES[key].name, fields: TEMPLATES[key].fields, settings: TEMPLATES[key].settings });

test('all three built-in templates are valid layouts', () => {
  for (const key of Object.keys(TEMPLATES)) assert.ok(asLayout(key).fields.length > 5, key);
  assert.equal(asLayout('client_job').settings.time_tracking, true);
});

test('the designer cannot save broken layouts', () => {
  const base = asLayout('standard');
  assert.throws(() => normalizeLayout({ ...base, fields: [...base.fields, { key: 'title', kind: 'custom', type: 'text', label: 'Again' }] }), /repeated key/);
  assert.throws(() => normalizeLayout({ ...base, fields: [...base.fields, { key: 'stage', kind: 'custom', type: 'dropdown', label: 'Stage', options: [] }] }), /at least one option/);
  assert.throws(() => normalizeLayout({ ...base, fields: [...base.fields, { key: 'x1', kind: 'custom', type: 'script', label: 'X' }] }), /unsupported type/);
  const noTitle = base.fields.map((f) => (f.key === 'title' ? { ...f, hidden: true } : f));
  assert.throws(() => normalizeLayout({ ...base, fields: noTitle, settings: { ...base.settings, title_pattern: '' } }), /title pattern/);
  assert.throws(() => normalizeLayout({ ...base, settings: { ...base.settings, edit_window_days: 0 } }), /1 to 365/);
});

test('custom values are checked against the layout', () => {
  const layout = asLayout('client_job');
  assert.throws(() => cleanCustomValues(layout, { job_type: 'Payroll' }), (e) => e.status === 422 && Boolean(e.fields.work_type));
  const full = {
    job_type: 'Payroll', work_type: 'Review', date_worked: '2026-10-15', period_type: 'Monthly', period_ended: '2026-09-30',
    registration_status: 'Registered', count_type: 'Payslips', count_number: '18', unknown_key: 'dropped',
  };
  const clean = cleanCustomValues(layout, full);
  assert.equal(clean.count_number, 18);
  assert.equal(clean.unknown_key, undefined, 'unknown keys are dropped');
  assert.throws(() => cleanCustomValues(layout, { ...full, job_type: 'Made up' }), /Pick one of the listed/);
  assert.deepEqual(cleanCustomValues(layout, { count_number: 20 }, { partial: true }), { count_number: 20 });
});

test('titles are built from the pattern and the edit window locks old tasks', () => {
  assert.equal(buildTitle('{client_name} · {job_type} · {date_worked}', { client_name: 'Riverside', job_type: 'Payroll', date_worked: '2026-10-15' }), 'Riverside · Payroll · 2026-10-15');
  assert.equal(buildTitle('{client_name} · {job_type} · {date_worked}', { client_name: 'Riverside' }), 'Riverside');
  const layout = asLayout('client_job');
  const now = Date.parse('2026-10-20T00:00:00Z');
  assert.equal(isPastEditWindow(layout, '2026-10-14T00:00:00Z', now), false);
  assert.equal(isPastEditWindow(layout, '2026-10-12T00:00:00Z', now), true);
  assert.equal(isPastEditWindow(asLayout('standard'), '2020-01-01T00:00:00Z', now), false);
});

async function client(t, router, identity) {
  process.env.JWT_SECRET = 'task-form-test-only';
  const app = express(); app.use(express.json({ limit: '2mb' })); app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const token = jwt.sign(identity, process.env.JWT_SECRET);
  return (path, method = 'GET', body) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test('only admins and managers can save the form, with version protection', async (t) => {
  const writes = [];
  let role = 'person';
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('SELECT u.id, u.role FROM users u')) return [[{ id: 5, role }]];
    if (sql.startsWith('SELECT definition, version FROM task_form_layouts')) return [[]];
    if (sql.startsWith('SELECT version FROM task_form_layouts')) return [[]];
    writes.push({ sql, params });
    return [{ affectedRows: 1 }];
  });
  const send = await client(t, require('../src/routes/taskForm'), { id: 5, role: 'person', org_id: 3 });
  const layout = asLayout('client_job');
  assert.equal((await send('/', 'PUT', { layout, version: 0 })).status, 403);
  assert.equal(writes.length, 0);
  role = 'manager';
  const info = await (await send('/')).json();
  assert.equal(info.can_edit, true);
  assert.equal(info.templates.length, 3);
  assert.equal((await send('/', 'PUT', { layout, version: 4 })).status, 409);
  const saved = await send('/', 'PUT', { layout, version: 0 });
  assert.equal(saved.status, 200);
  assert.match(writes[0].sql, /^INSERT INTO task_form_layouts/);
  assert.match(writes[0].sql, /OUTPUT INSERTED\.org_id/, 'the table has no id column, so the insert must not ask for INSERTED.id');
  assert.equal(writes[0].params[0], 3, 'saved for the caller organization only');
});

test('employees cannot log time for someone else, and locked tasks refuse new time', async (t) => {
  const layout = JSON.stringify(asLayout('client_job'));
  let created = new Date().toISOString();
  const inserts = [];
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('SELECT id, team_id, org_id, created_at FROM tasks')) return [[{ id: 9, team_id: 2, org_id: 3, created_at: created }]];
    if (sql.includes('FROM team_members')) return [[{ id: 1 }]];
    if (sql.startsWith('SELECT definition, version FROM task_form_layouts')) return [[{ definition: layout, version: 1 }]];
    if (sql.startsWith('INSERT INTO task_time_logs')) { inserts.push(params); return [{ affectedRows: 1 }]; }
    if (sql.includes('FROM task_time_logs l JOIN users u')) return [[{ id: 1, user_id: 5, user_name: 'Asha', hours: 2.5, work_date: '2026-10-15' }]];
    return [[{ id: 1 }]];
  });
  const { router } = require('../src/routes/tasks/timeLogs');
  const send = await client(t, router, { id: 5, role: 'person', org_id: 3 });
  assert.equal((await send('/9/time-logs', 'POST', { hours: 2, user_id: 77 })).status, 403);
  assert.equal((await send('/9/time-logs', 'POST', { hours: 30 })).status, 422);
  const ok = await send('/9/time-logs', 'POST', { hours: 2.5, work_date: '2026-10-15' });
  assert.equal(ok.status, 201);
  assert.deepEqual((await ok.json()).by_person, [{ user_id: 5, name: 'Asha', hours: 2.5 }]);
  assert.equal(inserts[0][2], 5, 'logged for the employee themself');
  created = '2020-01-01T00:00:00Z';
  assert.equal((await send('/9/time-logs', 'POST', { hours: 1 })).status, 423);
});

test('time report is for managers and admins, scoped to the organization, with form answers flattened', async (t) => {
  let role = 'person';
  let query = null;
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('SELECT u.id, u.role FROM users u')) return [[{ id: 5, role }]];
    if (sql.includes('FROM task_time_logs l')) {
      query = { sql, params };
      return [[{ id: 1, work_date: '2026-10-15', hours: '2.50', user_id: 5, user_name: 'Asha', entry_id: 9, client_name: 'Riverside', custom_fields: '{"job_type":"Payroll","client_name":"spoofed"}' }]];
    }
    throw Error(`Unexpected query: ${sql.slice(0, 40)}`);
  });
  const send = await client(t, require('../src/routes/taskForm'), { id: 5, role: 'person', org_id: 3 });
  assert.equal((await send('/time-report?from=2026-10-01&to=2026-10-31')).status, 403);
  role = 'manager';
  assert.equal((await send('/time-report?from=2026-10-31&to=2026-10-01')).status, 422);
  const body = await (await send('/time-report?from=2026-10-01&to=2026-10-31')).json();
  assert.deepEqual(query.params, [3, '2026-10-01', '2026-10-31']);
  assert.equal(body.rows[0].job_type, 'Payroll');
  assert.equal(body.rows[0].client_name, 'Riverside', 'task columns win over form answers');
  assert.equal(body.rows[0].hours, 2.5);
});
