const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../src/config/database');
const sheet = require('../src/services/sheetToTask');

test('only Google Sheets links are read, as their CSV export, so the server never fetches other addresses', () => {
  assert.equal(sheet.sheetCsvUrl('https://docs.google.com/spreadsheets/d/AbC-12_x/edit#gid=42'),
    'https://docs.google.com/spreadsheets/d/AbC-12_x/export?format=csv&gid=42');
  assert.equal(sheet.sheetCsvUrl('https://docs.google.com/spreadsheets/d/e/2PACX-1v/pubhtml'),
    'https://docs.google.com/spreadsheets/d/e/2PACX-1v/pub?output=csv');
  assert.throws(() => sheet.sheetCsvUrl('http://docs.google.com/spreadsheets/d/x/edit'), /Only Google Sheets/);
  assert.throws(() => sheet.sheetCsvUrl('https://169.254.169.254/latest'), /Only Google Sheets/);
  assert.throws(() => sheet.sheetCsvUrl('not a link'), /full link/);
});

test('CSV keeps commas, quotes and line breaks inside cells, and rows keep their sheet numbers', () => {
  const rows = sheet.parseCsv('﻿Task,Notes\r\n"Payroll, Oct","He said ""now""\nplease"\n\nGST,\n');
  assert.deepEqual(rows[1], ['Payroll, Oct', 'He said "now"\nplease']);
  const table = sheet.tableOf(rows);
  assert.deepEqual(table.headers, ['Task', 'Notes']);
  assert.deepEqual(table.rows.map((r) => r.number), [2, 4]);
});

test('dates are read day first, as typed in India, and nonsense is refused', () => {
  assert.equal(sheet.parseDate('05/11/2026'), '2026-11-05');
  assert.equal(sheet.parseDate('5-11-26'), '2026-11-05');
  assert.equal(sheet.parseDate('2026-11-05'), '2026-11-05');
  assert.equal(sheet.parseDate('5 Nov 2026'), '2026-11-05');
  assert.equal(sheet.parseDate('05-Nov-2026'), '2026-11-05');
  assert.equal(sheet.parseDate('31/02/2026'), undefined);
  assert.equal(sheet.parseDate('tomorrow'), undefined);
  assert.equal(sheet.parseDate(''), null);
  assert.equal(sheet.parsePriority('Urgent'), 'HIGH');
  assert.equal(sheet.parsePriority('normal'), 'MEDIUM');
  assert.equal(sheet.parsePriority('whenever'), undefined);
});

test('columns are guessed by name and each person decides which fields a row must have', () => {
  assert.deepEqual(sheet.suggestMapping(['Sr No', 'Task Name', 'Client', 'Deadline', 'Remarks']),
    { title: 'Task Name', description: 'Remarks', due_date: 'Deadline', client_name: 'Client' });
  const mapping = { title: 'Task', due_date: 'Due', client_name: 'Client' };
  const ok = sheet.rowToTask({ Task: 'GST filing', Due: '10/11/2026', Client: '' }, mapping, []);
  assert.deepEqual(ok, { task: { title: 'GST filing', due_date: '2026-11-10' }, problems: [] });
  const strict = sheet.rowToTask({ Task: 'GST filing', Due: '', Client: '' }, mapping, ['due_date', 'client_name']);
  assert.deepEqual(strict.problems, ['Due date is empty', 'Client is empty']);
  assert.throws(() => sheet.readSettings({ mapping: { description: 'Notes' } }), /task title/);
  assert.deepEqual(sheet.readSettings({ mapping: { title: 'Task', due_date: 'Due' }, required: ['due_date', 'client_name', 'title'] }).required, ['due_date']);
});

test('a row makes one task only: moved rows and edited rows are not new, rows added at the end are', () => {
  const mapping = { title: 'Task' };
  const row = (number, Task) => ({ number, values: { Task } });
  const first = [row(2, 'A'), row(3, 'B')];
  const recorded = first.map((r) => ({ row_number: r.number, row_hash: sheet.hashOf(r.values, mapping) }));
  const later = [row(2, 'New on top'), row(3, 'A'), row(4, 'B-edited'), row(5, 'C')];
  // "A" moved down (done), "New on top" took row 2 whose old content still exists (new), row 4 is new too.
  const { fresh } = sheet.newRows(later, mapping, recorded);
  assert.deepEqual(fresh.map((r) => r.values.Task), ['New on top', 'B-edited', 'C']);
  const edited = sheet.newRows([row(2, 'A'), row(3, 'B changed')], mapping, recorded);
  assert.deepEqual(edited.fresh, []);
  assert.deepEqual(edited.edited.map((r) => r.values.Task), ['B changed']);
});

test('the sheet routes stay closed until the platform team turns the module on', async (t) => {
  process.env.JWT_SECRET = 'sheet-test-only';
  let enabled = false;
  t.mock.method(db, 'execute', async (sql) => {
    if (sql.startsWith('SELECT is_enabled FROM org_modules')) return [[{ is_enabled: enabled }]];
    if (sql.includes('FROM task_sheet_links l LEFT JOIN teams')) return [[]];
    return [[]];
  });
  const app = express(); app.use(express.json()); app.use(require('../src/routes/taskSheets'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const token = jwt.sign({ id: 10, role: 'person', org_id: 1 }, process.env.JWT_SECRET);
  const call = (path, method = 'GET', body) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.deepEqual((await (await call('/status')).json()).enabled, false);
  assert.equal((await call('/')).status, 403);
  assert.equal((await call('/preview', 'POST', { url: 'https://docs.google.com/spreadsheets/d/x/edit' })).status, 403);
  enabled = true;
  assert.equal((await call('/')).status, 200);
  assert.equal((await call('/preview', 'POST', { url: 'https://example.com/a.csv' })).status, 422);
});
