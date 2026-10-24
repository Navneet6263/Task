// Helpers for the task form designer. Layouts are plain objects; every change returns a new copy.

export const TYPE_META = {
  text: ['Short answer', 'Aa'],
  long_text: ['Paragraph', '¶'],
  number: ['Number', '#'],
  date: ['Date', '▦'],
  dropdown: ['Dropdown', '▾'],
  checkbox: ['Checkbox', '☑'],
  issue_type: ['Type chooser', '◇'],
  priority: ['Priority', '!'],
  person: ['Person', '◉'],
  client: ['Client list', '◎'],
  task_option: ['Task option list', '▾'],
  type_details: ['Bug / feature extras', '+'],
  image: ['Image upload', '▣'],
  hours: ['Hours worked', '◷'],
  task: ['Task picker', '◆'],
  agent: ['Agent list', '◈'],
};
export const CUSTOM_TYPES = [
  ['text', 'One line of text'], ['long_text', 'Several lines'], ['number', 'Counts, amounts'],
  ['date', 'A calendar date'], ['dropdown', 'Pick one from a list'], ['checkbox', 'Yes or no'],
];

export const clone = (value) => JSON.parse(JSON.stringify(value));
export const strip = (layout) => (layout ? (({ version, ...rest }) => rest)(layout) : null);
export const sameLayout = (a, b) => JSON.stringify(strip(a)) === JSON.stringify(strip(b));

export function newKey(fields) {
  const taken = new Set(fields.map((f) => f.key));
  let index = fields.length + 1;
  while (taken.has(`field_${index}`)) index += 1;
  return `field_${index}`;
}

export const patchField = (layout, key, patch) => ({ ...layout, fields: layout.fields.map((f) => (f.key === key ? { ...f, ...patch } : f)) });

// Moves `key` before or after `target` in the full field list.
export function moveTo(layout, key, target, where) {
  if (key === target) return layout;
  const moving = layout.fields.find((f) => f.key === key);
  const rest = layout.fields.filter((f) => f.key !== key);
  const index = rest.findIndex((f) => f.key === target);
  if (!moving || index < 0) return layout;
  rest.splice(where === 'after' ? index + 1 : index, 0, moving);
  return { ...layout, fields: rest };
}

// One step up or down among the visible fields.
export function moveStep(layout, key, direction) {
  const visible = layout.fields.filter((f) => !f.hidden);
  const index = visible.findIndex((f) => f.key === key);
  const neighbour = visible[index + direction];
  return neighbour ? moveTo(layout, key, neighbour.key, direction > 0 ? 'after' : 'before') : layout;
}

export function addField(layout, type, afterKey) {
  const key = newKey(layout.fields);
  const field = { key, kind: 'custom', type, label: 'Untitled question', required: false, hidden: false, width: type === 'long_text' ? 'full' : 'half', help: '', ...(type === 'dropdown' ? { options: ['Option 1'] } : {}) };
  const fields = [...layout.fields];
  const index = afterKey ? fields.findIndex((f) => f.key === afterKey) : -1;
  if (index >= 0) fields.splice(index + 1, 0, field);
  else {
    const lastVisible = fields.map((f) => !f.hidden).lastIndexOf(true);
    fields.splice(lastVisible + 1, 0, field);
  }
  return { layout: { ...layout, fields }, key };
}

export function duplicateField(layout, key) {
  const source = layout.fields.find((f) => f.key === key);
  const copyKey = newKey(layout.fields);
  const fields = [...layout.fields];
  fields.splice(fields.findIndex((f) => f.key === key) + 1, 0, { ...clone(source), key: copyKey, label: `${source.label} (copy)` });
  return { layout: { ...layout, fields }, key: copyKey };
}

export const removeField = (layout, key) => ({ ...layout, fields: layout.fields.filter((f) => f.key !== key) });

// Showing or hiding "Hours worked" turns time tracking on or off with it.
export function setTimeTracking(layout, on) {
  const next = patchField(layout, 'hours', { hidden: !on, ...(on ? {} : { required: false }) });
  return { ...next, settings: { ...next.settings, time_tracking: on } };
}

// Problems the server would reject, shown before saving.
export function layoutProblems(layout) {
  const problems = [];
  const visible = layout.fields.filter((f) => !f.hidden);
  if (!visible.length) problems.push('Show at least one field.');
  layout.fields.forEach((f) => {
    if (!String(f.label || '').trim()) problems.push('Every field needs a name.');
    if (f.type === 'dropdown' && !(f.options || []).some((o) => String(o).trim())) problems.push(`Add options to "${f.label}".`);
  });
  const title = layout.fields.find((f) => f.key === 'title');
  if (title && title.hidden && !String(layout.settings?.title_pattern || '').trim()) problems.push('The title is hidden, so set how the title is built.');
  const days = layout.settings?.edit_window_days ?? null;
  if (days !== null && days !== '' && !(Number.isInteger(Number(days)) && Number(days) >= 1 && Number(days) <= 365)) problems.push('Edit window must be 1 to 365 days.');
  return [...new Set(problems)];
}
