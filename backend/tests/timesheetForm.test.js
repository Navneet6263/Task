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

test('only managers and admins save the timesheet form, with version protection', async (t) => {
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
  assert.equal((await send('/form', 'PUT', { layout, version: 3 })).status, 409);
  assert.equal((await send('/form', 'PUT', { layout, version: 0 })).status, 200);
  assert.match(writes[0].sql, /INSERT INTO timesheet_form_layouts .* OUTPUT INSERTED\.org_id/);
  assert.equal(writes[0].params[0], 1, 'saved for the caller organization only');
});
