import { downloadWorkbook, fileSlug } from '../../../services/excelExport';

const sum = (rows) => Math.round(rows.reduce((total, r) => total + (Number(r.hours) || 0), 0) * 100) / 100;
const groupBy = (rows, key) => rows.reduce((map, row) => { const k = key(row); (map[k] = map[k] || []).push(row); return map; }, {});
const byHours = (a, b) => b.hours - a.hours || String(a.label).localeCompare(String(b.label));

// Timesheet report as a clean Excel file: by client, by person, who worked on which client, and every entry.
export function exportTimesheetReport({ report, config, clientName, personName }) {
  const rows = report.rows;
  const form = config.form?.fields || [];
  const label = (key, fallback) => form.find((f) => f.key === key)?.label || fallback;
  const clientLabel = label('client_id', 'Client');
  const total = sum(rows);

  const clients = Object.entries(groupBy(rows, (r) => r.client_name || 'No client')).map(([name, items]) => ({
    label: name, hours: sum(items), share: total ? sum(items) / total : 0,
    entries: new Set(items.map((r) => r.entry_id)).size, people: new Set(items.map((r) => r.user_id)).size,
  })).sort(byHours);

  const people = Object.entries(groupBy(rows, (r) => r.user_name || 'Unknown')).map(([name, items]) => {
    const days = new Set(items.map((r) => String(r.work_date).slice(0, 10))).size;
    return {
      label: name, hours: sum(items), clients: new Set(items.map((r) => r.client_name)).size,
      entries: new Set(items.map((r) => r.entry_id)).size, days, per_day: days ? Math.round((sum(items) / days) * 100) / 100 : 0,
    };
  }).sort(byHours);

  // People down the side, clients across the top: who spent how long on which client.
  const clientNames = clients.map((c) => c.label);
  const matrix = people.map((p) => {
    const mine = rows.filter((r) => (r.user_name || 'Unknown') === p.label);
    return { label: p.label, ...Object.fromEntries(clientNames.map((c, i) => [`c${i}`, sum(mine.filter((r) => (r.client_name || 'No client') === c)) || null])), total: p.hours };
  });

  const extra = form.filter((f) => f.kind === 'custom' && !f.hidden);
  const entries = [...rows].sort((a, b) => String(a.work_date).localeCompare(String(b.work_date)) || String(a.user_name).localeCompare(String(b.user_name)));
  const filters = [clientName && `${clientLabel}: ${clientName}`, personName && `Person: ${personName}`].filter(Boolean).join(' · ') || `All ${clientLabel.toLowerCase()}s and people`;

  return downloadWorkbook({
    fileName: `timesheet-${fileSlug(clientName || 'all-clients')}-${report.from}-to-${report.to}`,
    title: `${config.form?.name || 'Timesheet'} report`,
    lines: [`Period: ${report.from} to ${report.to} · ${filters}`, `Submitted entries only · ${total} hours in total`, `Generated: ${new Date().toLocaleString('en-GB')}`],
    sheets: [
      { name: `By ${clientLabel}`.slice(0, 31), title: `Hours by ${clientLabel.toLowerCase()}`, rows: clients, totals: { hours: 'sum', share: 'sum', entries: 'sum' }, columns: [
        { key: 'label', label: clientLabel }, { key: 'hours', label: 'Hours', type: 'decimal' }, { key: 'share', label: 'Share of hours', type: 'percent' },
        { key: 'entries', label: 'Entries', type: 'number' }, { key: 'people', label: 'People', type: 'number' }] },
      { name: 'By person', title: 'Hours by person', rows: people, totals: { hours: 'sum', entries: 'sum', days: 'sum' }, columns: [
        { key: 'label', label: 'Person' }, { key: 'hours', label: 'Hours', type: 'decimal' }, { key: 'days', label: 'Days worked', type: 'number' },
        { key: 'per_day', label: 'Hours per day', type: 'decimal' }, { key: 'entries', label: 'Entries', type: 'number' }, { key: 'clients', label: `${clientLabel}s`, type: 'number' }] },
      { name: `Person x ${clientLabel}`.slice(0, 31), title: `Who worked how long on which ${clientLabel.toLowerCase()}`, rows: matrix,
        totals: { ...Object.fromEntries(clientNames.map((c, i) => [`c${i}`, 'sum'])), total: 'sum' },
        columns: [{ key: 'label', label: 'Person' }, ...clientNames.map((c, i) => ({ key: `c${i}`, label: c, type: 'decimal' })), { key: 'total', label: 'Total hours', type: 'decimal' }] },
      { name: 'Entries', title: 'Every time entry', rows: entries, totals: { hours: 'sum' }, columns: [
        { key: 'work_date', label: 'Date', type: 'date' }, { key: 'user_name', label: 'Person' }, { key: 'client_name', label: clientLabel },
        { key: 'task_title', label: label('task_id', 'Task'), value: (r) => (r.task_title ? `#${r.task_id} ${r.task_title}` : null) },
        { key: 'job_type', label: label('job_type', 'Job Type') }, { key: 'work_type', label: label('work_type', 'Work Type') },
        { key: 'period_type', label: label('period_type', 'Period Type') }, { key: 'period_ended', label: label('period_ended', 'Period Ended'), type: 'date' },
        { key: 'count_type', label: label('count_type', 'Count Type') }, { key: 'count_number', label: label('count_number', 'Count number'), type: 'number' },
        ...extra.map((f) => ({ key: f.key, label: f.label, ...(f.type === 'number' ? { type: 'number' } : f.type === 'date' ? { type: 'date' } : {}), value: f.type === 'checkbox' ? (r) => (r[f.key] === undefined || r[f.key] === null ? null : r[f.key] ? 'Yes' : 'No') : undefined })),
        { key: 'hours', label: 'Hours', type: 'decimal' }, { key: 'note', label: 'Note', wrap: true, width: 40 }] },
    ],
  });
}
