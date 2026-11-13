// Tasks from a sheet: the columns follow the organization's Create task form (the designed form
// when there is one, the classic form otherwise), and every row is checked the way the form would.
import { nameKey } from './clientSheet';
import { parseDate, parseHours, plainValue } from './entrySheet';

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const EXAMPLE = /^example\b/i;
const field = (key, type, label, required = false) => ({ key, kind: 'core', type, label, required });
const NOT_IN_A_SHEET = ['type_details', 'reference_image'];
const TYPES = { task: 'task', bug: 'bug', story: 'story', feature: 'feature', enhancement: 'enhancement', improvement: 'enhancement' };
const PRIORITIES = { high: 'HIGH', medium: 'MEDIUM', med: 'MEDIUM', normal: 'MEDIUM', low: 'LOW' };

// ctx: { teams, agents, taskLayout } → the columns a task sheet can have.
export function taskFields(ctx) {
  const form = ctx.taskLayout
    ? ctx.taskLayout.fields.filter((f) => !f.hidden && !NOT_IN_A_SHEET.includes(f.key))
    : [
      field('title', 'text', 'Task title', true), field('description', 'long_text', 'Description'), field('issue_type', 'issue_type', 'Type'),
      field('priority', 'priority', 'Priority'), field('assigned_to', 'person', 'Assignee'),
      ...(ctx.agents?.length ? [field('agent_firm_id', 'agent', 'Agent')] : []), field('client_name', 'client', 'Client'),
      field('start_date', 'date', 'Start date'), field('due_date', 'date', 'Due date'),
      field('task_type', 'task_option', 'Task type'), field('product', 'task_option', 'Product / module'), field('category', 'task_option', 'Category'),
    ];
  // With more than one team the sheet may say which team each task is for.
  return [...(ctx.teams.length > 1 ? [field('team', 'team', 'Team')] : []), ...form];
}

// rows: the lines under the heading. Returns [{ line, body, problems }] for every line with something in it.
export function buildTaskRows(rows, mapping, { fields, ctx, teamId = '', firstLine = 2 }) {
  const teams = ctx.teams || [];
  const clients = (ctx.clients || []).filter((c) => c.is_active !== false).map((c) => ({ ...c, lower: c.name.toLowerCase(), key: nameKey(c.name) }));
  const agents = ctx.agents || [];
  const fallback = teams.find((t) => String(t.id) === String(teamId)) || (teams.length === 1 ? teams[0] : null);
  const out = [];

  rows.forEach((row, index) => {
    if (!row || !row.some(Boolean) || row.some((cell) => EXAMPLE.test(cell))) return;
    const cell = (k) => (mapping[k] === undefined || mapping[k] === '' ? '' : clean(row[mapping[k]]));
    const body = { custom_fields: {} };
    const problems = [];
    const missing = (f) => { if (f.required) problems.push(`${f.label} is missing`); };

    const said = cell('team');
    const team = said ? teams.find((t) => t.name.toLowerCase() === said.toLowerCase()) : fallback;
    if (!team) problems.push(said ? `“${said}” is not one of your teams` : 'No team: choose the team above, or add a Team column');
    else body.team_id = team.id;
    const members = team ? ctx.members?.[team.id] || [] : [];

    // The client is read first: its agent decides the Agent column.
    [...fields].sort((x, y) => Number(y.key === 'client_name') - Number(x.key === 'client_name')).forEach((f) => {
      if (f.key === 'team') return;
      const raw = cell(f.key);
      if (f.type === 'client') {
        if (!raw) { missing(f); return; }
        const found = clients.find((c) => c.lower === raw.toLowerCase()) || clients.find((c) => c.key === nameKey(raw));
        if (!found && ctx.pickOnly) { problems.push(`“${raw}” is not in your client list`); return; }
        body.client_name = found ? found.name : raw.slice(0, 255);
        if (found?.agent_id) body.agent_firm_id = String(found.agent_id);
      } else if (f.type === 'agent') {
        if (body.agent_firm_id) return;
        if (!raw) { missing(f); return; }
        const found = agents.find((a) => a.name.toLowerCase() === raw.toLowerCase()) || agents.find((a) => nameKey(a.name) === nameKey(raw));
        if (found) body.agent_firm_id = String(found.id); else problems.push(`“${raw}” is not one of your agents`);
      } else if (f.type === 'person') {
        if (!raw) { missing(f); return; }
        if (!team) return;
        const wanted = raw.toLowerCase();
        const found = members.find((m) => String(m.name || '').toLowerCase() === wanted)
          || members.find((m) => [m.email, m.employee_id].some((v) => v && String(v).toLowerCase() === wanted));
        if (found) body.assigned_to = found.id; else problems.push(`“${raw}” is not a member of ${team.name}`);
      } else if (f.type === 'issue_type') {
        if (!raw) return;
        const type = TYPES[raw.toLowerCase()];
        if (type) body.issue_type = type; else problems.push(`${f.label} “${raw}” must be Task, Bug, Story, Feature or Improvement`);
      } else if (f.type === 'priority') {
        if (!raw) return;
        const priority = PRIORITIES[raw.toLowerCase()];
        if (priority) body.priority = priority; else problems.push(`${f.label} “${raw}” must be High, Medium or Low`);
      } else if (f.type === 'hours') {
        const hours = parseHours(raw);
        if (hours === null) { missing(f); return; }
        if (!(hours > 0 && hours <= 24)) { problems.push(`${f.label} must be more than 0 and at most 24`); return; }
        body.hours = String(Math.round(hours * 100) / 100);
      } else if (f.type === 'date') {
        if (!raw) { missing(f); return; }
        const date = parseDate(raw);
        if (!date) { problems.push(`${f.label} “${raw}” is not a date (use 31/12/2026)`); return; }
        if (f.kind === 'custom') body.custom_fields[f.key] = date; else body[f.key] = date;
      } else {
        const read = plainValue(f, raw);
        if (read.problem) problems.push(read.problem);
        else if (read.value !== undefined) {
          const value = typeof read.value === 'string' ? read.value.slice(0, f.key === 'title' ? 255 : 5000) : read.value;
          if (f.kind === 'custom') body.custom_fields[f.key] = value; else body[f.key] = value;
        }
      }
    });
    // The form's own date rules, said in plain words before the upload.
    const assigned = body.assigned_date || ctx.today;
    if (body.start_date && body.due_date && body.start_date > body.due_date) problems.push('Due date is before the start date');
    else if (body.due_date && body.due_date < assigned) problems.push(body.assigned_date ? 'Due date is before the assigned date' : 'Due date is already past');
    out.push({ line: firstLine + index, body, problems });
  });
  return out;
}
