// The organization's Timesheet form: labels, order, required/optional, hidden fields, dropdown
// options and extra questions. Pure functions only, so they are unit-tested directly.
const { CUSTOM_TYPES, cleanCustomValues } = require('./taskFormLayout');

const fail = (status, message, fields) => Object.assign(new Error(message), { status, ...(fields ? { fields } : {}) });

// Built-in fields are real columns on timesheet_entries. Client, Date worked and Hours are "locked":
// reports group by them, so they are always shown and required (they can still be renamed).
const CORE = {
  task_id: { type: 'task', label: 'Task' },
  agent_firm_id: { type: 'agent', label: 'Agent' },
  client_id: { type: 'client', label: 'Client', locked: true },
  job_type: { type: 'dropdown', label: 'Job Type', choice: true },
  work_type: { type: 'dropdown', label: 'Work Type', choice: true },
  date_worked: { type: 'date', label: 'Date worked', locked: true },
  agent_id: { type: 'person', label: 'Done by' },
  period_type: { type: 'dropdown', label: 'Period Type', choice: true },
  period_ended: { type: 'date', label: 'Period Ended' },
  registration_status: { type: 'dropdown', label: 'Registration Status', choice: true },
  description: { type: 'long_text', label: 'Description' },
  count_type: { type: 'dropdown', label: 'Count Type', choice: true },
  count_number: { type: 'number', label: 'Count number' },
  hours: { type: 'hours', label: 'Hours worked', locked: true },
};
const CORE_KEYS = Object.keys(CORE);
const CHOICE_KEYS = CORE_KEYS.filter((key) => CORE[key].choice);
const KEY_RE = /^[a-z][a-z0-9_]{1,39}$/;
const MAX_CUSTOM = 30;
const MAX_OPTIONS = 100;

const text = (value, max, label) => {
  const result = String(value ?? '').trim();
  if (result.length > max) throw fail(422, `${label} must be at most ${max} characters`);
  return result;
};
const coreField = (key, extra = {}) => ({
  key, kind: 'core', type: CORE[key].type, label: CORE[key].label, required: true, hidden: false, width: 'full', help: '',
  ...(CORE[key].choice ? { types: ['dropdown', 'text'] } : {}), ...(CORE[key].locked ? { locked: true } : {}), ...extra,
});

// The form as it works today (the client's original screen), with the organization's current dropdown options.
function defaultLayout(optionsByGroup = {}) {
  const options = (key) => (optionsByGroup[key] || []).map((o) => (typeof o === 'string' ? o : o.label)).filter(Boolean);
  return {
    name: 'Timesheet',
    fields: CORE_KEYS.map((key) => coreField(key, {
      required: !['task_id', 'agent_firm_id', 'description'].includes(key),
      ...(key === 'date_worked' ? { default: 'today' } : {}),
      ...(CORE[key].choice ? { options: options(key) } : {}),
    })),
  };
}

// Validates a layout from the designer and returns a clean copy.
function normalizeTimesheetLayout(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.fields)) throw fail(422, 'Form layout is missing');
  const seen = new Set();
  let customCount = 0;
  const fields = input.fields.map((raw, index) => {
    const key = String(raw?.key || '');
    if (!KEY_RE.test(key) || seen.has(key)) throw fail(422, `Field ${index + 1} has a missing or repeated key`);
    seen.add(key);
    const core = CORE[key];
    if (!core && raw.kind === 'core') throw fail(422, `Unknown built-in field: ${key}`);
    let type;
    if (core) type = core.choice && ['dropdown', 'text'].includes(raw.type) ? raw.type : core.type;
    else {
      type = raw.type;
      if (!CUSTOM_TYPES.includes(type)) throw fail(422, `Field "${raw.label || key}" has an unsupported type`);
      customCount += 1;
    }
    // Older layouts called the employee field "Agent"; that name now belongs to the agent firm.
    const label = (key === 'agent_id' && String(raw.label || '').trim() === 'Agent' ? 'Done by' : text(raw.label, 80, 'Field label')) || (core ? core.label : '');
    if (!label) throw fail(422, `Field ${index + 1} needs a label`);
    const locked = Boolean(core?.locked);
    const hidden = locked ? false : Boolean(raw.hidden);
    const field = {
      key, kind: core ? 'core' : 'custom', type, label,
      required: locked ? true : Boolean(raw.required) && !hidden,
      hidden, width: raw.width === 'half' ? 'half' : 'full', help: text(raw.help, 200, 'Help text'),
      ...(core?.choice ? { types: ['dropdown', 'text'] } : {}), ...(locked ? { locked: true } : {}),
    };
    if (type === 'dropdown') {
      const options = [...new Set((Array.isArray(raw.options) ? raw.options : []).map((o) => text(o, 120, 'Option')).filter(Boolean))];
      if (!options.length && !hidden) throw fail(422, `Add at least one option to "${label}"`);
      if (options.length > MAX_OPTIONS) throw fail(422, `"${label}" can have at most ${MAX_OPTIONS} options`);
      field.options = options;
    } else if (core?.choice && Array.isArray(raw.options)) {
      // Keep the list when someone switches a dropdown to free text, so switching back restores it.
      field.options = [...new Set(raw.options.map((o) => text(o, 120, 'Option')).filter(Boolean))].slice(0, MAX_OPTIONS);
    }
    if (type === 'date' && raw.default === 'today') field.default = 'today';
    if (type === 'person' && raw.default === 'me') field.default = 'me';
    return field;
  });
  if (customCount > MAX_CUSTOM) throw fail(422, `Use at most ${MAX_CUSTOM} extra questions`);
  // Built-in fields missing from an older layout come back as hidden, so new columns never break saving.
  // The Agent field is new: older layouts get it visible, just above Client.
  if (!seen.has('agent_firm_id')) {
    const at = fields.findIndex((f) => f.key === 'client_id');
    fields.splice(at < 0 ? 0 : at, 0, coreField('agent_firm_id', { required: false }));
    seen.add('agent_firm_id');
  }
  CORE_KEYS.filter((key) => !seen.has(key)).forEach((key) => fields.push(coreField(key, { hidden: !CORE[key].locked, required: Boolean(CORE[key].locked) })));
  return { name: text(input.name, 80, 'Form name') || 'Timesheet', fields };
}

const fieldOf = (layout, key) => layout.fields.find((f) => f.key === key);

// Built-in keys the person must fill for this save. Drafts only need a client.
function requiredKeys(layout, mode) {
  if (mode === 'draft') return new Set(['client_id']);
  return new Set(layout.fields.filter((f) => f.kind === 'core' && f.required && !f.hidden && f.key !== 'hours').map((f) => f.key));
}

// Dropdown answers must be one of the listed options (matched without case); returns errors by key.
function checkChoices(layout, entry, current) {
  const errors = {};
  CHOICE_KEYS.forEach((key) => {
    const field = fieldOf(layout, key);
    const value = entry[key];
    if (!field || field.type !== 'dropdown' || !value || value === current?.[key]) return;
    const match = (field.options || []).find((o) => o.toLowerCase() === String(value).toLowerCase());
    if (match) entry[key] = match;
    else errors[key] = `Pick a ${field.label} from the list.`;
  });
  return errors;
}

// Extra questions: drafts may leave required ones empty.
function cleanTimesheetCustom(layout, values, mode) {
  const relaxed = mode === 'draft' ? { ...layout, fields: layout.fields.map((f) => ({ ...f, required: false })) } : layout;
  return cleanCustomValues(relaxed, values, { partial: mode === 'draft' });
}

const visibleCoreKeys = (layout) => new Set(layout.fields.filter((f) => f.kind === 'core' && !f.hidden).map((f) => f.key));

module.exports = { CORE, CORE_KEYS, CHOICE_KEYS, defaultLayout, normalizeTimesheetLayout, requiredKeys, checkChoices, cleanTimesheetCustom, visibleCoreKeys, fieldOf };
