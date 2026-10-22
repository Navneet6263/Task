// Organization task form layouts: which fields the "Create task" form shows, in what order,
// with what labels and rules. Pure functions only, so they are unit-tested directly.

const fail = (status, message, fields) => Object.assign(new Error(message), { status, ...(fields ? { fields } : {}) });

// Built-in fields map to real task columns. They can be relabelled, reordered, hidden and made
// required, but their type is fixed.
const CORE_FIELDS = {
  issue_type: { type: 'issue_type', label: 'Type' },
  title: { type: 'text', label: 'Task title' },
  description: { type: 'long_text', label: 'Description' },
  priority: { type: 'priority', label: 'Priority' },
  assigned_to: { type: 'person', label: 'Assignee' },
  client_name: { type: 'client', label: 'Client' },
  assigned_date: { type: 'date', label: 'Assigned date' },
  start_date: { type: 'date', label: 'Start date' },
  due_date: { type: 'date', label: 'Due date' },
  task_type: { type: 'task_option', label: 'Task type' },
  product: { type: 'task_option', label: 'Product / module' },
  category: { type: 'task_option', label: 'Category' },
  type_details: { type: 'type_details', label: 'Extra fields for bugs, features and stories' },
  reference_image: { type: 'image', label: 'Reference image' },
  hours: { type: 'hours', label: 'Hours worked' },
};
const CUSTOM_TYPES = ['text', 'long_text', 'number', 'date', 'dropdown', 'checkbox'];
const KEY_RE = /^[a-z][a-z0-9_]{1,39}$/;
const MAX_FIELDS = 40;
const MAX_OPTIONS = 50;

const core = (key, extra = {}) => ({ key, kind: 'core', label: CORE_FIELDS[key].label, type: CORE_FIELDS[key].type, required: false, hidden: false, width: 'half', help: '', ...extra });
const custom = (key, label, type, extra = {}) => ({ key, kind: 'custom', label, type, required: false, hidden: false, width: 'half', help: '', ...extra });

const TEMPLATES = {
  standard: {
    name: 'Standard task',
    description: 'The everyday task form: title, owner, dates and the usual classification fields.',
    settings: { time_tracking: false, edit_window_days: null, title_pattern: '', submit_label: 'Create task' },
    fields: [
      core('issue_type', { width: 'full' }),
      core('title', { required: true, width: 'full' }),
      core('description', { width: 'full' }),
      core('priority', { required: true }),
      core('assigned_to'),
      core('assigned_date'), core('start_date'), core('due_date', { required: true }),
      core('client_name'),
      core('task_type'), core('product'), core('category'),
      core('type_details', { width: 'full' }),
      core('reference_image', { width: 'full' }),
      core('hours', { hidden: true }),
    ],
  },
  client_job: {
    name: 'Client job sheet',
    description: 'For service teams that log work per client: job, period, counts and hours worked.',
    settings: { time_tracking: true, edit_window_days: 7, title_pattern: '{client_name} · {job_type} · {date_worked}', submit_label: 'Submit' },
    fields: [
      core('client_name', { required: true, width: 'full', restrict_new: true }),
      custom('job_type', 'Job Type', 'dropdown', { required: true, options: ['Bookkeeping', 'Payroll', 'Tax Return', 'BAS / GST', 'Audit'] }),
      custom('work_type', 'Work Type', 'dropdown', { required: true, options: ['Preparation', 'Review', 'Lodgement', 'Client query'] }),
      custom('date_worked', 'Date worked', 'date', { required: true, default: 'today' }),
      core('assigned_to', { label: 'Agent', required: true, default: 'me' }),
      custom('period_type', 'Period Type', 'dropdown', { required: true, options: ['Monthly', 'Quarterly', 'Half-yearly', 'Annually'] }),
      custom('period_ended', 'Period Ended', 'date', { required: true }),
      custom('registration_status', 'Registration Status', 'dropdown', { required: true, options: ['Registered', 'Not registered', 'Pending registration'] }),
      core('description', { width: 'full' }),
      custom('count_type', 'Count Type', 'text', { required: true }),
      custom('count_number', 'Count number', 'number', { required: true }),
      core('hours', { required: true }),
      core('issue_type', { hidden: true }), core('title', { hidden: true }), core('priority', { hidden: true }),
      core('assigned_date', { hidden: true }), core('start_date', { hidden: true }), core('due_date', { hidden: true }),
      core('task_type', { hidden: true }), core('product', { hidden: true }), core('category', { hidden: true }),
      core('type_details', { hidden: true }), core('reference_image', { hidden: true }),
    ],
  },
  project: {
    name: 'Project delivery',
    description: 'A clean, modern form for project work: scope, owner, timeline, effort and stage.',
    settings: { time_tracking: true, edit_window_days: null, title_pattern: '', submit_label: 'Create task' },
    fields: [
      core('title', { required: true, width: 'full', help: 'Start with a verb: "Design the pricing page".' }),
      core('client_name', { label: 'Client / project' }),
      custom('stage', 'Stage', 'dropdown', { options: ['Planning', 'Design', 'Build', 'Review', 'Launch'] }),
      core('assigned_to', { label: 'Owner', required: true }),
      core('priority', { required: true }),
      core('start_date'), core('due_date', { required: true }),
      custom('estimate_hours', 'Estimated hours', 'number', { help: 'Rough effort, used to compare with hours worked.' }),
      core('hours', { label: 'Hours worked so far' }),
      core('description', { label: 'Scope & definition of done', width: 'full' }),
      custom('billable', 'Billable to the client', 'checkbox'),
      core('reference_image', { width: 'full' }),
      core('issue_type', { hidden: true }), core('assigned_date', { hidden: true }), core('task_type', { hidden: true }),
      core('product', { hidden: true }), core('category', { hidden: true }), core('type_details', { hidden: true }),
    ],
  },
};

const text = (value, max, label) => {
  const result = String(value ?? '').trim();
  if (result.length > max) throw fail(422, `${label} must be at most ${max} characters`);
  return result;
};

// Validates a layout sent by the form designer and returns a clean copy.
function normalizeLayout(input) {
  if (!input || typeof input !== 'object') throw fail(422, 'Form layout is missing');
  const template = Object.keys(TEMPLATES).includes(input.template) ? input.template : 'standard';
  if (!Array.isArray(input.fields) || !input.fields.length) throw fail(422, 'Add at least one field');
  if (input.fields.length > MAX_FIELDS + Object.keys(CORE_FIELDS).length) throw fail(422, `Use at most ${MAX_FIELDS} custom fields`);
  const seen = new Set();
  let customCount = 0;
  const fields = input.fields.map((raw, index) => {
    const key = String(raw?.key || '');
    if (!KEY_RE.test(key) || seen.has(key)) throw fail(422, `Field ${index + 1} has a missing or repeated key`);
    seen.add(key);
    const isCore = Boolean(CORE_FIELDS[key]);
    if (!isCore && raw.kind === 'core') throw fail(422, `Unknown built-in field: ${key}`);
    const type = isCore ? CORE_FIELDS[key].type : raw.type;
    if (!isCore && !CUSTOM_TYPES.includes(type)) throw fail(422, `Field "${raw.label || key}" has an unsupported type`);
    if (!isCore) customCount += 1;
    const label = text(raw.label, 80, 'Field label') || (isCore ? CORE_FIELDS[key].label : '');
    if (!label) throw fail(422, `Field ${index + 1} needs a label`);
    const field = {
      key, kind: isCore ? 'core' : 'custom', type, label,
      required: Boolean(raw.required) && !raw.hidden,
      hidden: Boolean(raw.hidden),
      width: raw.width === 'full' ? 'full' : 'half',
      help: text(raw.help, 200, 'Help text'),
    };
    if (type === 'dropdown') {
      const options = [...new Set((Array.isArray(raw.options) ? raw.options : []).map((o) => text(o, 80, 'Option')).filter(Boolean))];
      if (!options.length) throw fail(422, `Add at least one option to "${label}"`);
      if (options.length > MAX_OPTIONS) throw fail(422, `"${label}" can have at most ${MAX_OPTIONS} options`);
      field.options = options;
    }
    if (type === 'date' && raw.default === 'today') field.default = 'today';
    if (type === 'person' && raw.default === 'me') field.default = 'me';
    if (type === 'client') field.restrict_new = Boolean(raw.restrict_new);
    return field;
  });
  if (customCount > MAX_FIELDS) throw fail(422, `Use at most ${MAX_FIELDS} custom fields`);
  if (!fields.some((f) => !f.hidden)) throw fail(422, 'Show at least one field');
  const s = input.settings || {};
  const days = s.edit_window_days === null || s.edit_window_days === '' || s.edit_window_days === undefined ? null : Number(s.edit_window_days);
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 365)) throw fail(422, 'Edit window must be 1 to 365 days');
  const titleField = fields.find((f) => f.key === 'title');
  const pattern = text(s.title_pattern, 200, 'Title pattern');
  if ((!titleField || titleField.hidden) && !pattern) throw fail(422, 'The title is hidden, so add a title pattern such as {client_name} · {job_type}');
  return {
    template,
    name: text(input.name, 80, 'Form name') || TEMPLATES[template].name,
    fields,
    settings: {
      time_tracking: Boolean(s.time_tracking) || fields.some((f) => f.key === 'hours' && !f.hidden),
      edit_window_days: days,
      title_pattern: pattern,
      submit_label: text(s.submit_label, 30, 'Button label') || 'Create task',
    },
  };
}

// Checks the custom-field values of one task against the layout and returns what to store.
// `partial` (editing) only checks the keys that were sent.
function cleanCustomValues(layout, values, { partial = false } = {}) {
  const input = values && typeof values === 'object' && !Array.isArray(values) ? values : {};
  const result = {};
  const errors = {};
  for (const field of layout.fields.filter((f) => f.kind === 'custom' && !f.hidden)) {
    if (partial && !(field.key in input)) continue;
    const raw = input[field.key];
    const empty = raw === undefined || raw === null || raw === '' || (field.type === 'checkbox' && raw === false && field.required);
    if (empty) {
      if (field.required) errors[field.key] = `${field.label} is required`;
      else result[field.key] = field.type === 'checkbox' ? false : null;
      continue;
    }
    if (field.type === 'number') {
      const n = Number(raw);
      if (!Number.isFinite(n) || Math.abs(n) > 1e9) errors[field.key] = `${field.label} must be a number`;
      else result[field.key] = n;
    } else if (field.type === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw)) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) errors[field.key] = `${field.label} must be a date`;
      else result[field.key] = String(raw);
    } else if (field.type === 'dropdown') {
      if (!field.options.includes(String(raw))) errors[field.key] = `Pick one of the listed ${field.label} options`;
      else result[field.key] = String(raw);
    } else if (field.type === 'checkbox') {
      result[field.key] = raw === true || raw === 'true';
    } else {
      const max = field.type === 'long_text' ? 5000 : 500;
      const value = String(raw).trim();
      if (value.length > max) errors[field.key] = `${field.label} must be at most ${max} characters`;
      else if (!value && field.required) errors[field.key] = `${field.label} is required`;
      else result[field.key] = value || null;
    }
  }
  if (Object.keys(errors).length) throw fail(422, Object.values(errors)[0], errors);
  return result;
}

// Required built-in fields that the shared task payload does not already enforce.
function missingCoreFields(layout, payload) {
  const missing = {};
  for (const field of layout.fields.filter((f) => f.kind === 'core' && f.required && !f.hidden)) {
    if (['type_details', 'reference_image', 'hours', 'issue_type', 'priority'].includes(field.key)) continue;
    const value = payload[field.key];
    if (value === undefined || value === null || String(value).trim() === '') missing[field.key] = `${field.label} is required`;
  }
  if (Object.keys(missing).length) throw fail(422, Object.values(missing)[0], missing);
}

// "{client_name} · {job_type}" → "Riverside Motors · Payroll". Unknown or empty tokens are dropped.
function buildTitle(pattern, values) {
  const title = String(pattern || '')
    .replace(/\{([a-z][a-z0-9_]*)\}/g, (_, key) => (values[key] === undefined || values[key] === null ? '' : String(values[key])))
    .replace(/(\s*·\s*){2,}/g, ' · ').replace(/^\s*·\s*|\s*·\s*$/g, '').trim();
  return title.slice(0, 255);
}

// Days after creation during which non-admins may edit a task. Null when there is no limit.
function isPastEditWindow(layout, createdAt, now = Date.now()) {
  const days = layout?.settings?.edit_window_days;
  if (!days || !createdAt) return false;
  const created = new Date(createdAt).getTime();
  return Number.isFinite(created) && now - created > days * 86400000;
}

const templateList = () => Object.entries(TEMPLATES).map(([key, t]) => ({ key, name: t.name, description: t.description, layout: { template: key, name: t.name, fields: t.fields, settings: t.settings } }));

module.exports = { CORE_FIELDS, CUSTOM_TYPES, TEMPLATES, fail, normalizeLayout, cleanCustomValues, missingCoreFields, buildTitle, isPastEditWindow, templateList };
