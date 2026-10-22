import { logs } from '../../services/api';
import { downloadWorkbook, fileSlug } from '../../services/excelExport';

const MAX = 3000;
const TONE = { 'Task Completed': 'ok', 'Task Created': 'ok', 'Task Assigned': 'info', 'Task Commented': 'warn', 'Overdue Alert': 'danger' };

// All log rows for the current filters (up to MAX) as a styled Excel file.
export async function exportLogs({ team, actor, activity, extra, filtersText }) {
  const rows = [];
  for (let page = 1; rows.length < MAX; page += 1) {
    const response = await logs.getByTeam(team.id, page, 100, actor, activity, extra);
    rows.push(...(response.data.data || []));
    if (page >= (response.data.pagination?.total_pages || 1)) break;
  }
  await downloadWorkbook({
    fileName: `audit-log-${fileSlug(team.name)}-${new Date().toISOString().slice(0, 10)}`,
    title: `Audit log · ${team.name}`,
    lines: [`Generated: ${new Date().toLocaleString('en-GB')}`, filtersText || 'All activity'],
    sheets: [{
      name: 'Audit log',
      columns: [
        { key: 'created_at', label: 'When', type: 'datetime', width: 19, value: (r) => (r.created_at ? String(r.created_at).slice(0, 19) : null) },
        { key: 'user_name', label: 'Who', width: 22, value: (r) => r.user_name || 'System' },
        { key: 'activity', label: 'Activity', width: 18, tone: (r) => TONE[r.activity] || 'neutral' },
        { key: 'task_details', label: 'Task', width: 40, wrap: true },
        { key: 'description', label: 'Details', width: 60, wrap: true },
        { key: 'automated_by', label: 'Source', width: 16 },
      ],
      rows: rows.slice(0, MAX),
      note: rows.length >= MAX ? `Limited to the newest ${MAX} events. Narrow the dates to export older ones.` : undefined,
    }],
  });
  return rows.length;
}
