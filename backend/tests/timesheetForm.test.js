const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../src/config/database');
const router = require('../src/routes/timesheet');
const { defaultLayout, normalizeTimesheetLayout, requiredKeys } = require('../src/services/timesheetFormLayout');
const rules = require('../src/services/timesheetRules');

const OPTIONS = { job_type: ['Payroll'], work_type: ['Review'], period_type: ['Monthly'], registration_status: ['Registered'], count_type: ['Payslips'] };

async function client(t, identity) {
  process.env.JWT_SECRET = 'timesheet-form-test-only';
  const app = express(); app.use(express.json()); app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const token = jwt.sign(identity, process.env.JWT_SECRET);
  return (path, method = 'GET', body) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test('client, date and hours can be renamed but never hidden or made optional', () => {
  const base = defaultLayout(OPTIONS);
  const tampered = base.fields.map((f) => (['client_id', 'hours', 'date_worked'].includes(f.key) ? { ...f, hidden: true, required: false, label: f.key === 'client_id' ? 'Customer' : f.label } : f));
  const layout = normalizeTimesheetLayout({ ...base, fields: tampered });
  const client = layout.fields.find((f) => f.key === 'client_id');
  assert.deepEqual([client.label, client.hidden, client.required], ['Customer', false, true]);
  assert.equal(layout.fields.find((f) => f.key === 'hours').hidden, false);
});

test('optional and hidden fields are no longer required; a dropdown can become free text', () => {
  const base = defaultLayout(OPTIONS);
  const fields = base.fields.map((f) => {
    if (f.key === 'period_ended') return { ...f, required: false };
    if (f.key === 'registration_status') return { ...f, hidden: true };
    if (f.key === 'count_type') return { ...f, type: 'text' };
    return f;
  });
  const layout = normalizeTimesheetLayout({ ...base, fields: [...fields, { key: 'billable', kind: 'custom', type: 'checkbox', label: 'Billable' }] });
  const required = requiredKeys(layout, 'submit');
  assert.equal(required.has('period_ended'), false);
  assert.equal(required.has('registration_status'), false);
  assert.equal(layout.fields.find((f) => f.key === 'count_type').type, 'text');
  const entry = rules.validateEntry({ client_id: 5, job_type: 'Payroll', work_type: 'Review', date_worked: '2026-10-10', agent_id: 9, period_type: 'Monthly', count_type: 'anything', count_number: 3, hours: 2 }, 'submit', '2026-10-22', required);
  assert.equal(entry.period_ended, null);
  assert.throws(() => normalizeTimesheetLayout({ ...base, fields: base.fields.map((f) => (f.key === 'job_type' ? { ...f, options: [] } : f)) }), /Add at least one option/);
});

test('only admins save the timesheet form (not managers), with version protection', async (t) => {
  let role = 'person';
  const writes = [];
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('SELECT u.id, u.role FROM users u')) return [[{ id: 10, role }]];
    if (sql.startsWith('SELECT is_enabled FROM org_modules')) return [[{ is_enabled: true }]];
    if (sql.startsWith('SELECT version FROM timesheet_form_layouts')) return [[]];
    writes.push({ sql, params });
    return [{ affectedRows: 1 }];
  });
  const send = await client(t, { id: 10, role: 'person', org_id: 1 });
  const layout = defaultLayout(OPTIONS);
  assert.equal((await send('/form', 'PUT', { layout, version: 0 })).status, 403);
  assert.equal(writes.length, 0);
  role = 'manager';
  assert.equal((await send('/form', 'PUT', { layout, version: 0 })).status, 403);
  assert.equal((await send('/form', 'DELETE')).status, 403);
  assert.equal(writes.length, 0);
  role = 'admin';
  assert.equal((await send('/form', 'PUT', { layout, version: 3 })).status, 409);
  assert.equal((await send('/form', 'PUT', { layout, version: 0 })).status, 200);
  assert.match(writes[0].sql, /INSERT INTO timesheet_form_layouts .* OUTPUT INSERTED\.org_id/);
  assert.equal(writes[0].params[0], 1, 'saved for the caller organization only');
});

// Accountrust's rule: some fields do not apply to some Job Types.
const JOBS = ['Bookkeeping & VAT Return', 'Payroll/ PAYE', 'Training'];
const ruled = () => {
  const base = defaultLayout({ ...OPTIONS, job_type: JOBS, count_type: ['Bank Transactions & Invoices'] });
  return normalizeTimesheetLayout({ ...base, fields: base.fields.map((f) => {
    if (f.key === 'registration_status') return { ...f, skip_for: ['bookkeeping & vat return', 'Training', 'Not a job type'] };
    if (['count_type', 'count_number'].includes(f.key)) return { ...f, skip_for: ['Payroll/ PAYE', 'Training'] };
    if (f.key === 'client_id') return { ...f, skip_for: ['Training'] };
    if (['date_worked', 'hours'].includes(f.key)) return { ...f, skip_for: ['Training'] };
    return f;
  }) });
};

test('a field can be marked "not needed" for some Job Types; only real options are kept, never date or hours', () => {
  const layout = ruled();
  const field = (key) => layout.fields.find((f) => f.key === key);
  assert.deepEqual(field('registration_status').skip_for, ['Bookkeeping & VAT Return', 'Training']);
  assert.deepEqual(field('count_number').skip_for, ['Payroll/ PAYE', 'Training']);
  assert.deepEqual(field('client_id').skip_for, ['Training'], 'client can be not needed, e.g. for Leave');
  assert.equal(field('date_worked').skip_for, undefined, 'date and hours are always needed');
  assert.equal(field('hours').skip_for, undefined);
  const { skippedKeys } = require('../src/services/timesheetFormLayout');
  assert.deepEqual([...skippedKeys(layout, 'training')].sort(), ['client_id', 'count_number', 'count_type', 'registration_status']);
  assert.deepEqual([...skippedKeys(layout, 'Payroll/ PAYE')].sort(), ['count_number', 'count_type']);
  assert.equal(skippedKeys(layout, 'Something else').size, 0);
  // Greyed out unless the form says to hide them (Accountrust); nothing else is kept.
  assert.equal(layout.skip_style, undefined);
  assert.equal(normalizeTimesheetLayout({ ...layout, skip_style: 'hide' }).skip_style, 'hide');
  assert.equal(normalizeTimesheetLayout({ ...layout, skip_style: 'weird' }).skip_style, undefined);
  // Renaming a Job Type option away drops it from the rule instead of breaking the form.
  const renamed = normalizeTimesheetLayout({ ...layout, fields: layout.fields.map((f) => (f.key === 'job_type' ? { ...f, options: ['Bookkeeping', 'Payroll/ PAYE', 'Training'] } : f)) });
  assert.deepEqual(renamed.fields.find((f) => f.key === 'registration_status').skip_for, ['Training']);
});

test('an entry for a Job Type that does not need some fields saves without them, and they are stored empty', async (t) => {
  const layout = ruled();
  const inserts = [], noClient = [];
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('SELECT u.id, u.role FROM users u')) return [[{ id: 10, role: 'person' }]];
    if (sql.startsWith('SELECT is_enabled FROM org_modules')) return [[{ is_enabled: true }]];
    if (sql.startsWith('SELECT definition, version FROM timesheet_form_layouts')) return [[{ definition: JSON.stringify(layout), version: 3 }]];
    if (sql.startsWith('SELECT tc.id FROM timesheet_clients')) return [[{ id: 5 }]];
    if (sql.startsWith('SELECT name FROM timesheet_clients')) return [[{ name: 'Acme' }]];
    if (sql.startsWith('INSERT INTO timesheet_clients')) { noClient.push(sql); return [{ insertId: 77 }]; }
    if (sql.startsWith('SELECT id FROM timesheet_clients WHERE org_id = ? AND name = ?')) return [[{ id: 77 }]];
    if (sql.startsWith('SELECT c.agent_id')) return [[]];
    if (sql.startsWith('SELECT u.id FROM users u')) return [[{ id: 10 }]];
    if (sql.startsWith('SELECT COALESCE(SUM(hours)')) return [[{ total: 0 }]];
    if (sql.startsWith('SET XACT_ABORT ON')) { inserts.push(params); return [{ insertId: 90 + inserts.length, rows: [] }]; }
    if (sql.startsWith('INSERT INTO timesheet_audit')) return [{}];
    return [[]];
  });
  const send = await client(t, { id: 10, role: 'person', org_id: 1 });
  const base = { client_id: 5, work_type: 'Review', date_worked: '2026-10-10', period_type: 'Monthly', period_ended: '2026-09-30', hours: 2 };
  // Training: none of the three is needed; anything sent for them is dropped.
  const training = await send('/entries', 'POST', { ...base, job_type: 'Training', registration_status: 'Registered', count_type: 'Bank Transactions & Invoices', count_number: 4 });
  assert.equal(training.status, 201);
  // Insert values 8, 10 and 11 are registration status, count type and count number.
  assert.deepEqual([inserts[0][8], inserts[0][10], inserts[0][11]], [null, null, null]);
  // Training needs no client either: the entry goes under the hidden, inactive "No client" row.
  assert.equal(inserts[0][1], 77);
  assert.match(noClient[0], /is_active, source\) VALUES \(\?, \?, 0, 'none'\)/);
  // Payroll still needs the registration status, but not the counts.
  const payroll = await send('/entries', 'POST', { ...base, job_type: 'Payroll/ PAYE' });
  assert.equal(payroll.status, 422);
  assert.ok((await payroll.json()).fields.registration_status);
  assert.equal((await send('/entries', 'POST', { ...base, job_type: 'Payroll/ PAYE', registration_status: 'Registered' })).status, 201);
  // Bookkeeping needs the counts.
  const books = await send('/entries', 'POST', { ...base, job_type: 'Bookkeeping & VAT Return' });
  assert.equal(books.status, 422);
  assert.deepEqual(Object.keys((await books.json()).fields).sort(), ['count_number', 'count_type']);
});

test('"Done by" is never "not needed": the rule is dropped on save and ignored in an older saved form', () => {
  const { skippedKeys, clearSkipped } = require('../src/services/timesheetFormLayout');
  const base = defaultLayout({ ...OPTIONS, job_type: JOBS });
  const saved = normalizeTimesheetLayout({ ...base, fields: base.fields.map((f) => (f.key === 'agent_id' ? { ...f, skip_for: JOBS } : f)) });
  assert.equal(saved.fields.find((f) => f.key === 'agent_id').skip_for, undefined);
  // Accountrust's form version 18 was saved like this before the rule existed.
  const older = { ...base, fields: base.fields.map((f) => (f.key === 'agent_id' ? { ...f, skip_for: JOBS } : f)) };
  assert.equal(skippedKeys(older, 'Training').has('agent_id'), false);
  const body = { job_type: 'Training', agent_id: 21 };
  clearSkipped(older, body);
  assert.equal(body.agent_id, 21, 'the person who did the work stays on the entry');
});
