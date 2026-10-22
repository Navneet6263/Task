import { tasks } from '../../services/api';
import { downloadWorkbook } from '../../services/excelExport';
import { localDate } from '../../services/localDate';
import { STATUS_LABEL } from './taskMeta';

const MAX_ROWS = 2000;
const isOverdue = (t) => t.status !== 'DONE' && t.due_date && String(t.due_date).slice(0, 10) < localDate();

const COLUMNS = [
  { key: 'id', label: 'ID', type: 'number', width: 9 },
  { key: 'title', label: 'Task', width: 46, wrap: true },
  { key: 'team_name', label: 'Team', width: 20 },
  { key: 'status', label: 'Status', width: 14, value: (t) => STATUS_LABEL[t.status] || t.status, tone: (t) => ({ DONE: 'ok', IN_PROGRESS: 'info', PENDING: 'warn' }[t.status] || 'neutral') },
  { key: 'priority', label: 'Priority', width: 11, tone: (t) => ({ HIGH: 'danger', MEDIUM: 'warn', LOW: 'ok' }[t.priority] || 'neutral') },
  { key: 'due_date', label: 'Due date', type: 'date', width: 14, value: (t) => (t.due_date ? String(t.due_date).slice(0, 10) : null) },
  { key: 'overdue', label: 'Overdue', width: 10, value: (t) => (isOverdue(t) ? 'Yes' : ''), tone: (t) => (isOverdue(t) ? 'danger' : null) },
  { key: 'client_name', label: 'Client', width: 20 },
  { key: 'assigned_by_name', label: 'Assigned by', width: 20 },
  { key: 'created_at', label: 'Created', type: 'datetime', width: 18, value: (t) => (t.created_at ? String(t.created_at).slice(0, 19) : null) },
];

// Every task matching the current My Tasks filters (up to MAX_ROWS), as a styled Excel file.
export async function exportMyTasks({ status, extra, userName }) {
  const rows = [];
  for (let page = 1; rows.length < MAX_ROWS; page += 1) {
    const response = await tasks.getMy(page, 100, status, extra);
    rows.push(...response.data.data);
    if (page >= response.data.pagination.total_pages) break;
  }
  const filters = [status && `status ${STATUS_LABEL[status]}`, extra.focus && `focus ${extra.focus.replace('_', ' ').toLowerCase()}`,
    extra.priorities?.length && `priority ${extra.priorities.join(', ')}`, extra.search && `search "${extra.search}"`].filter(Boolean).join(' · ');
  await downloadWorkbook({
    fileName: `my-tasks-${localDate()}`,
    title: `My tasks${userName ? ` · ${userName}` : ''}`,
    lines: [`Generated: ${new Date().toLocaleString('en-GB')}`, filters ? `Filters: ${filters}` : 'All my tasks'],
    sheets: [{ name: 'My tasks', columns: COLUMNS, rows: rows.slice(0, MAX_ROWS), note: rows.length >= MAX_ROWS ? `Limited to the first ${MAX_ROWS} tasks.` : undefined }],
  });
  return rows.length;
}
