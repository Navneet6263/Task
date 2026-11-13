import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { matchAgent, planClients, readClientTab, countOf } from './clientSheet';
import { buildRows, findHeader, matchColumns, parseDate, parseHours, uploadFields } from './entrySheet';
import { sampleSpec } from './sampleSheet';
import { MemoryRouter } from 'react-router-dom';
import { buildTaskRows, taskFields } from './taskSheet';
import { columnGuide } from './guide';
import BulkUpload from '.';

const h = {};
jest.mock('../../services/api', () => ({
  clients: { importList: (...a) => h.importList(...a), createAgent: (...a) => h.createAgent(...a), list: (...a) => h.list(...a) },
  timesheet: { bulk: (...a) => h.bulk(...a), status: async () => ({ data: { enabled: h.timesheetOn !== false } }), config: async () => ({ data: h.config }) },
  tasks: { bulk: (...a) => h.taskBulk(...a) },
  teams: { getAll: async () => ({ data: h.teams }), getMembers: async (id) => ({ data: h.members[id] || [] }) },
  taskForm: { get: async () => ({ data: { layout: h.taskLayout || null } }) },
}));
jest.mock('./sheetFile', () => ({ readWorkbook: (...a) => h.readWorkbook(...a) }));
jest.mock('../../services/feedback', () => ({ notify: () => {} }));

const agents = [{ id: 2, name: 'ABR Tamwil Ltd' }, { id: 3, name: 'Ratnam & Co Ltd' }, { id: 4, name: 'Spurling Cannon Ltd' }, { id: 6, name: 'Danan Sarzin Chartered Accountants' }, { id: 7, name: 'MTP Advisory Ltd' }];
const col = (...names) => names.map((n) => [n]);

test('the agent is worked out from the tab or file name, and left open when unsure', () => {
  expect(matchAgent('Ratnam & Co', agents).id).toBe(3);
  expect(matchAgent('ABR Tamwill', agents).id).toBe(2);
  expect(matchAgent('MTP Advisory', agents).id).toBe(7);
  expect(matchAgent('Client List Spurling Cannon', agents).id).toBe(4);
  expect(matchAgent('DS Accounting', agents)).toBeNull();
  expect(matchAgent('Sheet1', agents)).toBeNull();
});

test('a client tab is read without its heading, blank lines and repeated names', () => {
  const read = readClientTab([[''], ['Client Name'], ['Response IQ Limited'], [''], ['  Cover   Media '], ['response iq limited'], ['Example Client Ltd']]);
  expect(read.items.map((i) => i.name)).toEqual(['Response IQ Limited', 'Cover Media']);
  expect(read.repeated).toBe(1);
  // No heading at all: the column with the names is found anyway.
  expect(readClientTab([['1', '23Twenty Ltd'], ['2', '247 West Limited']]).items.map((i) => i.name)).toEqual(['23Twenty Ltd', '247 West Limited']);
});

test('a client sheet is planned: tabs go under their agents, existing and look-alike names are pointed out', () => {
  const workbook = { name: 'List of clients', tabs: [
    { name: 'Ratnam & Co', rows: col('Core Talent Group Ltd', 'Zyplo Limited', 'Carters Cafe Ltd', 'Carters Cafe Limited', 'Kent Metals', 'Kent Metal') },
    { name: 'DS Accounting', rows: col('Brainz Digital Ltd', 'Whiteboard', '') },
  ] };
  const groups = planClients(workbook, { agents, clients: [{ name: 'CORE TALENT GROUP LTD', agent_id: 3 }] });
  expect(groups.map((g) => [g.label, g.choice, g.matched])).toEqual([['Ratnam & Co', '3', true], ['DS Accounting', '', false]]);
  const state = Object.fromEntries(groups[0].items.map((i) => [i.name, [i.state, i.include]]));
  expect(state).toEqual({
    'Core Talent Group Ltd': ['existing', false], 'Zyplo Limited': ['new', true], 'Carters Cafe Ltd': ['new', true],
    'Carters Cafe Limited': ['alike', false], 'Kent Metals': ['new', true], 'Kent Metal': ['alike', true],
  });
  expect(groups[0].items[0].note).toBe('Already in your list, under Ratnam & Co Ltd');
  expect(countOf(groups[0])).toEqual({ add: 4, existing: 1, alike: 2 });
  // One tab called Sheet1: the file name says whose list it is.
  const single = planClients({ name: 'Client List Spurling Cannon', tabs: [{ name: 'Sheet1', rows: col('Client Name', 'Vang') }] }, { agents, clients: [] });
  expect(single[0]).toMatchObject({ choice: '4', matched: true, label: 'Client List Spurling Cannon' });
  // An "Agent" column splits one tab by agent.
  const byColumn = planClients({ name: 'x', tabs: [{ name: 'Sheet1', rows: [['Client', 'Agent'], ['A Ltd', 'MTP Advisory'], ['B Ltd', 'Ratnam'], ['C Ltd', '']] }] }, { agents, clients: [] });
  expect(byColumn.map((g) => g.choice)).toEqual(['7', '3', 'none']);
});

const core = (key, type, label, extra = {}) => ({ key, kind: 'core', type, label, required: true, hidden: false, ...extra });
const layout = { name: 'Timesheet', fields: [
  core('task_id', 'task', 'Task', { required: false }), core('agent_firm_id', 'agent', 'Agent', { required: false }), core('client_id', 'client', 'Customer'),
  core('job_type', 'dropdown', 'Job Type', { options: ['Payroll', 'Audit'] }), core('date_worked', 'date', 'Date worked'), core('agent_id', 'person', 'Done by'),
  core('description', 'long_text', 'Description', { required: false }), core('hours', 'hours', 'Hours worked'),
  { key: 'ticket', kind: 'custom', type: 'text', label: 'Ticket number', required: false, hidden: false },
] };
const config = {
  today: '2026-11-12', user_id: 10, permissions: { log_for_others: true, manage_clients: true }, form: layout,
  users: [{ id: 10, name: 'Navneet Kumar' }, { id: 12, name: 'Asha Rao' }], agents,
  clients: [{ id: 41, name: 'KC Kicks Ltd', agent_id: 7 }, { id: 42, name: 'Zyplo Limited', agent_id: null }],
};

test('dates and hours are read the way people type them', () => {
  expect(parseDate('2026-11-05')).toBe('2026-11-05');
  expect(parseDate('05/11/2026')).toBe('2026-11-05');
  expect(parseDate('5-Nov-26')).toBe('2026-11-05');
  expect(parseDate('5 November 2026')).toBe('2026-11-05');
  expect(parseDate('46331')).toBe('2026-11-05');
  expect(parseDate('31/02/2026')).toBeNull();
  expect(parseDate('soon')).toBeNull();
  expect([parseHours('2.5'), parseHours('2:30'), parseHours('3 hrs'), parseHours('')]).toEqual([2.5, 2.5, 3, null]);
  expect(parseHours('two')).toBeNaN();
});

test('sheet columns are matched to the form by heading, and each row is checked like the form', () => {
  const fields = uploadFields(layout);
  const sheet = [['Timesheet for November'], ['Client', 'Job type', 'Date', 'Employee', 'Hrs', 'Notes', 'Ticket Number'],
    ['kc kicks limited', 'payroll', '05/11/2026', 'asha rao', '2:30', 'Monthly run', 'T-1'],
    ['Unknown Co', 'Audit', '05/11/2026', '', '2', '', ''],
    ['Zyplo Limited', 'Tax', '25/12/2026', 'Someone Else', '30', '', ''],
    ['', '', '', '', '', '', ''],
    ['Zyplo Limited', 'Audit', '04/11/2026', '', '1.5', 'Second run', '']];
  expect(fields.some((f) => f.key === 'task_id')).toBe(false);
  const header = findHeader(sheet, fields);
  expect(header).toBe(1);
  const mapping = matchColumns(sheet[header], fields);
  expect(mapping).toEqual({ client_id: 0, job_type: 1, date_worked: 2, agent_id: 3, hours: 4, description: 5, ticket: 6 });
  const rows = buildRows(sheet.slice(header + 1), mapping, { layout, config, firstLine: header + 2 });
  expect(rows.map((r) => r.line)).toEqual([3, 4, 5, 7]);
  // Ltd/Limited and capitals do not matter; the client's own agent is filled in.
  expect(rows[0]).toEqual({ line: 3, problems: [], body: { client_id: '41', agent_firm_id: '7', job_type: 'Payroll', date_worked: '2026-11-05', agent_id: '12', hours: '2.5', description: 'Monthly run', custom_fields: { ticket: 'T-1' } } });
  expect(rows[1].problems).toEqual(['“Unknown Co” is not in your client list']);
  expect(rows[2].problems).toEqual(['“Tax” is not an option for Job Type', 'Date worked cannot be in the future', '“Someone Else” is not a person in your company', 'Hours worked must be more than 0 and at most 24']);
  // No name in the Done by column: the person uploading.
  expect(rows[3].body.agent_id).toBe('10');
  // Drafts only need the client.
  expect(buildRows([['Zyplo Limited', '', '', '', '', '', '']], mapping, { layout, config, mode: 'draft' })[0].problems).toEqual([]);
  // Employees always upload under their own name, whatever the sheet says.
  const own = buildRows([sheet[2]], mapping, { layout, config: { ...config, permissions: { log_for_others: false } } });
  expect(own[0].body.agent_id).toBe('10');
});

const teams = [{ id: 7, name: 'Payroll' }, { id: 8, name: 'Audit' }];
const members = { 7: [{ id: 12, name: 'Asha Rao', email: 'asha@x.com', employee_id: 'ACT12' }, { id: 10, name: 'Navneet Kumar' }], 8: [{ id: 10, name: 'Navneet Kumar' }] };
const ctx = { today: '2026-11-12', teams, members, agents, pickOnly: false, canManageClients: true, taskLayout: null, ts: config,
  clients: [{ name: 'KC Kicks Ltd', agent_id: 7, is_active: true }, { name: 'Zyplo Limited', agent_id: null, is_active: true }] };

test('the templates have the right headings, an example line that is skipped, a how-to tab and the lists to copy from', () => {
  const entries = sampleSpec('entries', ctx);
  expect(entries.sheets.map((s) => s.name)).toEqual(['Timesheet', 'How to fill', 'Lists']);
  expect(entries.sheets[0].headings).toEqual(['Agent', 'Customer', 'Job Type', 'Date worked', 'Done by', 'Description', 'Hours worked', 'Ticket number']);
  expect(entries.sheets[2].headings).toEqual(['Clients', 'People', 'Job Type']);
  const fields = uploadFields(layout);
  const mapping = matchColumns(entries.sheets[0].headings, fields);
  expect(Object.keys(mapping)).toHaveLength(8);
  expect(buildRows(entries.sheets[0].rows.map((row) => row.map(String)), mapping, { layout, config })).toEqual([]);

  const tasks = sampleSpec('tasks', ctx);
  expect(tasks.sheets[0].headings).toEqual(['Team', 'Task title', 'Description', 'Type', 'Priority', 'Assignee', 'Agent', 'Client', 'Start date', 'Due date', 'Task type', 'Product / module', 'Category']);
  expect(tasks.sheets[1].rows.find((row) => row[0] === 'Task title')).toEqual(['Task title', 'What needs to be done, in a few words.', 'Yes']);
  const taskMap = matchColumns(tasks.sheets[0].headings, taskFields(ctx));
  expect(Object.keys(taskMap)).toHaveLength(13);
  expect(buildTaskRows(tasks.sheets[0].rows.map((row) => row.map(String)), taskMap, { fields: taskFields(ctx), ctx })).toEqual([]);

  // The client template's help tab is never read as a list of clients.
  const clients = sampleSpec('clients', ctx);
  expect(planClients({ name: 'clients-template', tabs: clients.sheets.map((s) => ({ name: s.name, rows: [s.headings, ...s.rows] })) }, { agents, clients: [] })).toEqual([]);
  expect(columnGuide('clients', [], ctx).map((column) => [column.label, column.required])).toEqual([['Client Name', true], ['Agent', false]]);
});

test('task rows: team, assignee, priority, type, dates and client are read and checked like the form', () => {
  const fields = taskFields(ctx);
  const sheet = [['Team', 'Task', 'Assignee', 'Priority', 'Type', 'Deadline', 'Client', 'Start date'],
    ['payroll', 'VAT return', 'asha rao', 'high', 'Improvement', '01/12/2026', 'kc kicks limited', ''],
    ['', 'Year end pack', 'ACT12', '', '', '', 'Brand New Co', ''],
    ['Sales', 'Wrong team', '', '', '', '', '', ''],
    ['Audit', '', 'Asha Rao', 'urgent', 'epic', '01/11/2026', '', '05/11/2026']];
  const mapping = matchColumns(sheet[0], fields);
  expect(mapping).toEqual({ team: 0, title: 1, assigned_to: 2, priority: 3, issue_type: 4, due_date: 5, client_name: 6, start_date: 7 });
  const rows = buildTaskRows(sheet.slice(1), mapping, { fields, ctx, teamId: '7' });
  // Team by name, the person by name, the client's own agent, and Ltd/Limited does not matter.
  expect(rows[0]).toEqual({ line: 2, problems: [], body: { team_id: 7, title: 'VAT return', assigned_to: 12, priority: 'HIGH', issue_type: 'enhancement', due_date: '2026-12-01', client_name: 'KC Kicks Ltd', agent_firm_id: '7', custom_fields: {} } });
  // No team on the line: the team chosen on the page. Employee code works for the person. A new client is allowed here.
  expect(rows[1]).toEqual({ line: 3, problems: [], body: { team_id: 7, title: 'Year end pack', assigned_to: 12, client_name: 'Brand New Co', custom_fields: {} } });
  expect(rows[2].problems).toEqual(['“Sales” is not one of your teams']);
  expect(rows[3].problems).toEqual(['Task title is missing', 'Type “epic” must be Task, Bug, Story, Feature or Improvement', 'Priority “urgent” must be High, Medium or Low', '“Asha Rao” is not a member of Audit', 'Due date is before the start date']);
  // Several teams and none chosen: the row says what to do.
  expect(buildTaskRows([sheet[2].map((cell, i) => (i === 0 ? '' : cell))], mapping, { fields, ctx })[0].problems).toEqual(['No team: choose the team above, or add a Team column']);
  // "Pick only from the list" refuses a client that is not in it; a due date already past is caught.
  const strict = buildTaskRows([['', 'X', '', '', '', '01/11/2026', 'Brand New Co', '']], mapping, { fields, ctx: { ...ctx, pickOnly: true }, teamId: '7' });
  expect(strict[0].problems).toEqual(['“Brand New Co” is not in your client list', 'Due date is already past']);
  // A designed form brings its own columns and required fields.
  const designed = taskFields({ ...ctx, teams: [teams[0]], taskLayout: { fields: [
    { key: 'client_name', kind: 'core', type: 'client', label: 'Customer', required: true, hidden: false }, { key: 'title', kind: 'core', type: 'text', label: 'Task title', hidden: true },
    { key: 'type_details', kind: 'core', type: 'type_details', label: 'Extra', hidden: false }, { key: 'job', kind: 'custom', type: 'dropdown', label: 'Job', required: true, hidden: false, options: ['Payroll'] }] } });
  expect(designed.map((f) => f.key)).toEqual(['client_name', 'job']);
});

let c, r;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true; localStorage.clear(); c = document.createElement('div'); document.body.append(c); r = createRoot(c);
  Object.assign(h, { teams, members, config, taskLayout: null, timesheetOn: true });
  h.list = async () => ({ data: { clients: ctx.clients, agents, pick_only: false, can_manage: true } });
});
afterEach(() => { act(() => r.unmount()); c.remove(); });
const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text) || [...document.querySelectorAll('button')].find((b) => b.textContent.includes(text));
const flush = () => act(async () => { await new Promise((res) => setTimeout(res, 0)); });
const open = async (path = '/bulk-upload') => { await act(async () => r.render(<MemoryRouter initialEntries={[path]}><BulkUpload /></MemoryRouter>)); await flush(); await flush(); };
const choose = async () => {
  const input = document.querySelector('input[type="file"]');
  Object.defineProperty(input, 'files', { configurable: true, value: [{ name: 'my-sheet.xlsx', size: 10 }] });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  await flush();
};
const pick = (el, value) => act(() => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new Event('change', { bubbles: true })); });
const step = () => document.querySelector('[aria-current="step"]').textContent;

test('the page walks through the steps: choose, read how to fill the sheet, upload, check, done', async () => {
  h.readWorkbook = async () => ({ name: 'my-sheet', tabs: [{ name: 'Tasks', rows: [['Task title', 'Assignee', 'Due date'], ['VAT return', 'Asha Rao', '01/12/2026'], ['Bad one', 'Nobody Here', '']] }] });
  h.taskBulk = jest.fn(async (rows) => ({ data: { results: rows.map((_, i) => ({ ok: true, id: 500 + i })) } }));
  await open();
  expect(step()).toBe('1Choose what to upload');
  expect([...document.querySelectorAll('[role="radio"]')].map((b) => b.querySelector('span span').textContent)).toEqual(['Tasks', 'Clients', 'Timesheet entries']);
  // No emoji anywhere on the page.
  expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  expect(document.querySelector('input[type="file"]')).toBeNull();
  await act(async () => document.querySelector('[role="radio"]').click());
  expect(step()).toBe('2Get the sheet ready');
  // Step 2 explains the template and every column in plain words.
  expect(document.body.textContent).toContain('Download the template.');
  expect(button('Download the tasks template')).toBeTruthy();
  expect(document.body.textContent).toContain('What needs to be done, in a few words.');
  expect(document.body.textContent).toContain('Already have your own sheet?');
  await choose();
  expect(step()).toBe('4Check and confirm');
  expect(document.body.textContent).toContain('my-sheet.xlsx');
  expect(document.body.textContent).toContain('Which team are these tasks for?');
  expect(document.body.textContent).toContain('No team: choose the team above');
  pick(document.querySelector('[aria-label="Team for these tasks"]'), '7');
  expect(document.body.textContent).toContain('Row 3“Nobody Here” is not a member of Payroll');
  await act(async () => button('Upload 1 task').click());
  await flush();
  expect(h.taskBulk).toHaveBeenCalledWith([{ team_id: 7, title: 'VAT return', assigned_to: 12, due_date: '2026-12-01', custom_fields: {} }]);
  expect(document.body.textContent).toContain('1 task created.');
  expect(document.body.textContent).toContain('1 row was not uploaded.');
  expect(document.querySelector('[aria-current="step"]')).toBeNull();
  await act(async () => button('Upload another sheet').click());
  expect(step()).toBe('2Get the sheet ready');
});

test('a client list goes in under its agents, and the page asks only about the list it could not place', async () => {
  h.readWorkbook = async () => ({ name: 'List of clients', tabs: [
    { name: 'ABR Tamwill', rows: col(...Array.from({ length: 60 }, (_, i) => `Abr Client ${i + 1} Ltd`)) },
    { name: 'DS Accounting', rows: col('Brainz Digital Ltd', 'Whiteboard') },
  ] });
  h.importList = jest.fn(async (names) => ({ data: { added: names.length, existing: [], invalid: 0 } }));
  h.createAgent = jest.fn(async (name) => ({ data: { id: 99, name } }));
  await open('/bulk-upload?type=clients');
  await choose();
  expect(document.body.textContent).toContain('Found 62 names');
  expect(document.body.textContent).toContain('One list needs an agent.');
  expect(document.querySelector('[aria-label="Agent for ABR Tamwill"]').value).toBe('2');
  expect(button('Add 62 clients').disabled).toBe(true);
  pick(document.querySelector('[aria-label="Agent for DS Accounting"]'), 'new');
  expect(document.querySelector('[aria-label="New agent name for DS Accounting"]').value).toBe('DS Accounting');
  await act(async () => button('Add 62 clients').click());
  await flush();
  expect(h.createAgent).toHaveBeenCalledWith('DS Accounting');
  // 60 names go in two steps of 50 and 10, so the bar moves.
  expect(h.importList.mock.calls.map(([names, agent]) => [names.length, agent])).toEqual([[50, 2], [10, 2], [2, 99]]);
  expect(document.body.textContent).toContain('62 clients added.');
});

test('timesheet entries: only the good rows are uploaded, and the rest are listed with the reason', async () => {
  h.readWorkbook = async () => ({ name: 'November', tabs: [{ name: 'Timesheet', rows: [
    ['Customer', 'Job Type', 'Date worked', 'Done by', 'Hours worked'],
    ['KC Kicks Ltd', 'Payroll', '05/11/2026', 'Asha Rao', '2'],
    ['Nobody Ltd', 'Payroll', '05/11/2026', 'Asha Rao', '2'],
    ['Zyplo Limited', 'Audit', '06/11/2026', '', '1.5'],
  ] }] });
  h.bulk = jest.fn(async (rows) => ({ data: { results: rows.map((_, i) => (i === 1 ? { ok: false, error: 'This person already has 23 hours logged on 2026-11-06.' } : { ok: true, id: 70 + i })) } }));
  await open('/bulk-upload?type=entries');
  await choose();
  expect(document.body.textContent).toContain('5 of 8 columns matched by their headings');
  expect(document.body.textContent).toContain('Row 3“Nobody Ltd” is not in your client list');
  await act(async () => button('Upload 2 entries').click());
  await flush();
  expect(h.bulk).toHaveBeenCalledWith([expect.objectContaining({ client_id: '41', agent_id: '12', hours: '2' }), expect.objectContaining({ client_id: '42', agent_id: '10', hours: '1.5' })], 'submit');
  expect(document.body.textContent).toContain('1 entry submitted.');
  expect(document.body.textContent).toContain('2 rows were not uploaded.');
  expect(document.body.textContent).toContain('Row 4This person already has 23 hours');
});

test('people see only what they can upload: no Clients for members, no Timesheet when the module is off', async () => {
  h.list = async () => ({ data: { clients: [], agents: [], pick_only: false, can_manage: false } });
  h.timesheetOn = false;
  await open();
  // One kind only: it is chosen already and the page starts on step 2.
  expect([...document.querySelectorAll('[role="radio"]')].map((b) => b.getAttribute('aria-checked'))).toEqual(['true']);
  expect(step()).toBe('2Get the sheet ready');
  expect(document.body.textContent).not.toContain('Timesheet entries');
});
