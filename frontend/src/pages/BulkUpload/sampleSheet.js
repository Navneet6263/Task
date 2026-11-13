import { uploadFields } from './entrySheet';
import { taskFields } from './taskSheet';
import { columnGuide } from './guide';

const HEAD = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17775A' } }, alignment: { vertical: 'middle' } };
const NOTE = { font: { italic: true, color: { argb: 'FF56665E' } } };
const unique = (list) => [...new Set(list.filter(Boolean))];
const ukDate = (iso) => iso.split('-').reverse().join('/');

// Columns of names to copy from, padded into rows.
function listsSheet(lists) {
  const filled = lists.filter(([, values]) => values.length);
  const depth = Math.max(0, ...filled.map(([, values]) => values.length));
  return { name: 'Lists', headings: filled.map(([label]) => label), rows: Array.from({ length: depth }, (_, i) => filled.map(([, values]) => values[i] ?? '')) };
}
const howTo = (kind, fields, ctx, first) => ({
  name: 'How to fill', wide: true, headings: ['Column', 'What to write', 'Must be filled?'],
  rows: [...columnGuide(kind, fields, ctx).map((c) => [c.label, c.help, c.required ? 'Yes' : 'No']),
    ['', '', ''], ['Good to know', first, ''], ['', 'Do not change the headings in the first row. Lines that start with “Example” are skipped, so you can leave the example where it is.', '']],
});

// The file a person downloads in step 2: the headings, one example line (skipped on upload because
// it starts with "Example"), a "How to fill" tab, and for tasks and entries a "Lists" tab to copy names from.
// ctx is the page's data; fields are the columns of this kind.
export function sampleSpec(kind, ctx) {
  if (kind === 'clients') {
    return { fileName: 'clients-template.xlsx', sheets: [
      { name: 'Clients', headings: ['Client Name', 'Agent'], rows: [['Example Client Ltd', ctx.agents?.[0]?.name || '']] },
      howTo('clients', [], ctx, 'One client on each line. Clients already in your list are left as they are.'),
    ] };
  }
  const agentName = (id) => (ctx.agents || []).find((a) => String(a.id) === String(id))?.name || '';

  if (kind === 'tasks') {
    const fields = taskFields(ctx);
    const team = ctx.teams[0];
    const people = unique((ctx.members?.[team?.id] || []).map((m) => m.name));
    const client = (ctx.clients || [])[0];
    const example = fields.map((f) => {
      if (f.type === 'team') return team?.name || '';
      if (f.key === 'title') return 'Example: prepare the monthly payroll';
      if (f.type === 'client') return client?.name || '';
      if (f.type === 'agent') return agentName(client?.agent_id);
      if (f.type === 'person') return people[0] || '';
      if (f.type === 'priority') return 'Medium';
      if (f.type === 'issue_type') return 'Task';
      if (f.type === 'hours') return 1;
      if (f.type === 'date') return f.key === 'due_date' ? ukDate(ctx.today) : '';
      if (f.type === 'dropdown') return f.options?.[0] || '';
      if (f.type === 'checkbox') return 'Yes';
      if (f.type === 'number') return 1;
      return '';
    });
    // Something on the line must start with "Example" so the upload skips it.
    if (!fields.some((f) => f.key === 'title')) example[0] = `Example: ${example[0]}`;
    return { fileName: 'tasks-template.xlsx', sheets: [
      { name: 'Tasks', headings: fields.map((f) => f.label), rows: [example] },
      howTo('tasks', fields, ctx, 'One task on each line. You can upload up to 200 tasks at a time.'),
      listsSheet([['Teams', ctx.teams.map((t) => t.name)], ['People', unique(ctx.teams.flatMap((t) => (ctx.members?.[t.id] || []).map((m) => m.name)))],
        ['Clients', (ctx.clients || []).map((c) => c.name)], ['Priority', ['High', 'Medium', 'Low']], ['Type', ['Task', 'Bug', 'Story', 'Feature', 'Improvement']],
        ...fields.filter((f) => f.type === 'dropdown' && f.options?.length).map((f) => [f.label, f.options])]),
    ] };
  }

  const config = ctx.ts;
  const fields = uploadFields(config.form).filter((f) => f.key !== 'agent_id' || config.permissions?.log_for_others);
  const me = (config.users || []).find((u) => String(u.id) === String(config.user_id))?.name || '';
  const client = config.clients?.[0];
  const example = fields.map((f) => {
    if (f.key === 'client_id') return client?.name || 'Client name';
    if (f.key === 'agent_firm_id') return agentName(client?.agent_id);
    if (f.key === 'agent_id') return me;
    if (f.key === 'hours') return 2.5;
    if (f.type === 'date') return ukDate(config.today);
    if (f.type === 'dropdown') return f.options?.[0] || '';
    if (f.type === 'checkbox') return 'Yes';
    if (f.key === 'count_number' || f.type === 'number') return 1;
    return '';
  });
  const marker = fields.findIndex((f) => f.key === 'description');
  if (marker >= 0) example[marker] = 'Example line. It is skipped when you upload.';
  else example[fields.findIndex((f) => f.key === 'client_id')] = `Example: ${client?.name || 'Client name'}`;
  return { fileName: 'timesheet-template.xlsx', sheets: [
    { name: 'Timesheet', headings: fields.map((f) => f.label), rows: [example] },
    howTo('entries', fields, { ...ctx, pickOnly: true }, 'One timesheet entry on each line. You can upload up to 200 entries at a time.'),
    listsSheet([['Clients', (config.clients || []).map((c) => c.name)],
      ...(config.permissions?.log_for_others ? [['People', (config.users || []).map((u) => u.name)]] : []),
      ...fields.filter((f) => f.type === 'dropdown' && f.options?.length).map((f) => [f.label, f.options])]),
  ] };
}

export async function downloadSample(kind, ctx) {
  const { default: ExcelJS } = await import('exceljs/dist/exceljs.min.js');
  const workbook = new ExcelJS.Workbook();
  const spec = sampleSpec(kind, ctx);
  spec.sheets.forEach((s, index) => {
    const ws = workbook.addWorksheet(s.name);
    ws.addRow(s.headings);
    ws.getRow(1).height = 22;
    ws.getRow(1).eachCell((cell) => Object.assign(cell, HEAD));
    s.rows.forEach((row) => ws.addRow(row));
    ws.columns.forEach((column, i) => { column.width = s.wide && i === 1 ? 90 : Math.max(18, Math.min(44, String(s.headings[i] || '').length + 8)); });
    if (s.wide) ws.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    if (index === 0) ws.getRow(2).eachCell((cell) => Object.assign(cell, NOTE));
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url; link.download = spec.fileName; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
