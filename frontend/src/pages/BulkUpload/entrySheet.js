// Turns a sheet into timesheet entries: matches its columns to the organization's timesheet form,
// then checks every row the way the form would (client in the list, date, hours, dropdown values),
// so problems are shown before anything is uploaded. Pure functions only.
import { nameKey } from './clientSheet';

export const MAX_ROWS = 200;
const key = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const EXAMPLE = /^example\b/i;

// Other headings people use for the same thing.
const ALSO = {
  client_id: ['client', 'clientname', 'customer', 'customername', 'company', 'companyname'],
  agent_firm_id: ['agent', 'agentname', 'agentfirm', 'firm', 'accountant'],
  date_worked: ['date', 'dateworked', 'workdate', 'workedon', 'dateofwork'],
  agent_id: ['doneby', 'person', 'employee', 'employeename', 'staff', 'workedby', 'user'],
  hours: ['hours', 'hrs', 'hoursworked', 'time', 'timespent', 'totalhours'],
  description: ['description', 'details', 'notes', 'remarks', 'workdone', 'comment', 'comments'],
  job_type: ['jobtype', 'job'], work_type: ['worktype'], period_type: ['periodtype', 'period'],
  period_ended: ['periodended', 'periodend', 'periodending'], registration_status: ['registrationstatus', 'registration'],
  count_type: ['counttype'], count_number: ['countnumber', 'count', 'number'],
  // Task sheets
  team: ['team', 'teamname', 'space', 'department'],
  title: ['title', 'tasktitle', 'task', 'taskname', 'subject', 'summary', 'whattodo'],
  client_name: ['client', 'clientname', 'customer', 'customername', 'company', 'companyname'],
  assigned_to: ['assignee', 'assignedto', 'assignto', 'owner', 'person', 'employee', 'employeename', 'doneby', 'staff'],
  priority: ['priority', 'urgency'], issue_type: ['type', 'issuetype', 'kind'],
  due_date: ['duedate', 'due', 'deadline', 'enddate', 'targetdate'], start_date: ['startdate', 'start'], assigned_date: ['assigneddate', 'assignedon'],
  task_type: ['tasktype'], product: ['product', 'module', 'productmodule'], category: ['category'],
};

// The fields a sheet can fill: everything on the form except the task picker.
export const uploadFields = (layout) => layout.fields.filter((f) => !f.hidden && f.key !== 'task_id');

// headings: the sheet's heading row. Returns { fieldKey: columnIndex }.
export function matchColumns(headings, fields) {
  const keys = headings.map(key);
  const used = new Set();
  const map = {};
  const take = (field, test) => {
    if (map[field.key] !== undefined) return;
    const i = keys.findIndex((k, index) => k && !used.has(index) && test(k));
    if (i >= 0) { map[field.key] = i; used.add(i); }
  };
  const names = (field) => [key(field.label), key(field.key), ...(ALSO[field.key] || [])].filter(Boolean);
  fields.forEach((field) => { const exact = names(field); take(field, (k) => exact.includes(k)); });
  fields.forEach((field) => { const label = key(field.label); if (label.length >= 4) take(field, (k) => k.length >= 4 && (k.includes(label) || label.includes(k))); });
  return map;
}

// The heading row is the one (in the first 10) that matches the most fields.
export function findHeader(rows, fields) {
  let best = { index: -1, hits: 0 };
  rows.slice(0, 10).forEach((row, index) => {
    const hits = Object.keys(matchColumns(row || [], fields)).length;
    if (hits > best.hits) best = { index, hits };
  });
  if (best.hits >= 2) return best.index;
  return Math.max(0, rows.findIndex((row) => (row || []).some(Boolean)));
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const iso = (y, m, d) => {
  const year = y < 100 ? 2000 + y : y;
  const date = new Date(Date.UTC(year, m - 1, d));
  return date.getUTCFullYear() === year && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date.toISOString().slice(0, 10) : null;
};
// 2026-11-12, 12/11/2026 (day first), 12-Nov-26, 12 November 2026, or Excel's day number.
export function parseDate(value) {
  const text = clean(value);
  if (!text) return null;
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = text.match(/^(\d{1,2})[\s/.-]+([a-z]{3,9})[\s/.,-]+(\d{2}|\d{4})$/i);
  if (m && MONTHS.includes(m[2].slice(0, 3).toLowerCase())) return iso(+m[3], MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, +m[1]);
  if (/^\d{5}(\.\d+)?$/.test(text) && +text > 20000 && +text < 80000) return new Date(Math.round((+text - 25569) * 86400000)).toISOString().slice(0, 10);
  return null;
}

// 2.5, "2.5 h", "2:30" → 2.5
export function parseHours(value) {
  const text = clean(value).toLowerCase();
  if (!text) return null;
  const clock = text.match(/^(\d{1,2}):(\d{2})(:\d{2})?$/);
  if (clock) return +clock[1] + +clock[2] / 60;
  const plain = text.match(/^(\d+(\.\d+)?)\s*(h|hr|hrs|hour|hours)?$/);
  return plain ? +plain[1] : NaN;
}

const YES = ['yes', 'y', 'true', '1', 'done', 'x', '✓'];

// A plain answer (text, dropdown, tick box, number): { value }, { problem }, or {} when empty and optional.
export function plainValue(field, raw, full = true) {
  if (!raw && field.type !== 'checkbox') return full && field.required ? { problem: `${field.label} is missing` } : {};
  if (field.type === 'dropdown') {
    const value = (field.options || []).find((o) => o.toLowerCase() === raw.toLowerCase());
    return value ? { value } : { problem: `“${raw}” is not an option for ${field.label}` };
  }
  if (field.type === 'checkbox') {
    const value = YES.includes(raw.toLowerCase());
    return !value && full && field.required ? { problem: `${field.label} must be ticked (write Yes)` } : { value };
  }
  if (field.key === 'count_number' || field.type === 'number') {
    if (!/^-?\d+(\.\d+)?$/.test(raw) || (field.key === 'count_number' && !/^\d+$/.test(raw))) return { problem: `${field.label} “${raw}” is not a number` };
  }
  return { value: raw };
}

// rows: the lines under the heading. mapping: { fieldKey: columnIndex }.
// Returns [{ line, body, problems }] for every line that has something in it.
export function buildRows(rows, mapping, { layout, config, mode = 'submit', firstLine = 2 }) {
  // The client is read first: its agent decides the Agent column.
  const fields = [...uploadFields(layout)].sort((x, y) => Number(y.key === 'client_id') - Number(x.key === 'client_id'));
  const full = mode !== 'draft';
  const clients = (config.clients || []).map((c) => ({ ...c, lower: c.name.toLowerCase(), key: nameKey(c.name) }));
  const agents = config.agents || [];
  const users = config.users || [];
  const canPickPerson = Boolean(config.permissions?.log_for_others);
  const me = users.some((u) => String(u.id) === String(config.user_id)) ? String(config.user_id) : '';
  const out = [];

  rows.forEach((row, index) => {
    if (!row || !row.some(Boolean) || row.some((cell) => EXAMPLE.test(cell))) return;
    const cell = (k) => (mapping[k] === undefined || mapping[k] === '' ? '' : clean(row[mapping[k]]));
    const body = { custom_fields: {} };
    const problems = [];
    const missing = (field) => { if (full && field.required) problems.push(`${field.label} is missing`); };

    fields.forEach((field) => {
      const raw = cell(field.key);
      if (field.key === 'client_id') {
        if (!raw) { problems.push(`${field.label} is missing`); return; }
        const found = clients.find((c) => c.lower === raw.toLowerCase()) || clients.find((c) => c.key === nameKey(raw));
        if (!found) { problems.push(`“${raw}” is not in your client list`); return; }
        body.client_id = String(found.id);
        if (found.agent_id) body.agent_firm_id = String(found.agent_id);
      } else if (field.key === 'agent_firm_id') {
        if (body.agent_firm_id) return; // the client's own agent wins
        if (!raw) { missing(field); return; }
        const found = agents.find((a) => a.name.toLowerCase() === raw.toLowerCase()) || agents.find((a) => nameKey(a.name) === nameKey(raw));
        if (found) body.agent_firm_id = String(found.id); else problems.push(`“${raw}” is not one of your agents`);
      } else if (field.key === 'agent_id') {
        if (!canPickPerson || !raw) { body.agent_id = me; if (!me) missing(field); return; }
        const found = users.find((u) => u.name.toLowerCase() === raw.toLowerCase());
        if (found) body.agent_id = String(found.id); else problems.push(`“${raw}” is not a person in your company`);
      } else if (field.key === 'hours') {
        const hours = parseHours(raw);
        if (hours === null) { if (full) problems.push(`${field.label} is missing`); return; }
        if (!(hours > 0 && hours <= 24)) { problems.push(`${field.label} must be more than 0 and at most 24`); return; }
        body.hours = String(Math.round(hours * 100) / 100);
      } else if (field.type === 'date') {
        if (!raw) { missing(field); return; }
        const date = parseDate(raw);
        if (!date) { problems.push(`${field.label} “${raw}” is not a date (use 31/12/2026)`); return; }
        if (field.key === 'date_worked' && date > config.today) { problems.push(`${field.label} cannot be in the future`); return; }
        if (field.kind === 'custom') body.custom_fields[field.key] = date; else body[field.key] = date;
      } else {
        const read = plainValue(field, raw, full);
        if (read.problem) problems.push(read.problem);
        else if (read.value !== undefined) { if (field.kind === 'custom') body.custom_fields[field.key] = read.value; else body[field.key] = read.value; }
      }
    });
    out.push({ line: firstLine + index, body, problems });
  });
  return out;
}
