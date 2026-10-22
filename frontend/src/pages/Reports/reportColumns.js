// Task columns for the report preview and the Excel "Tasks" sheet. The same definition
// drives both, so what you see is what you download.
const today = () => new Date().toISOString().slice(0, 10);
export const isOverdue = (row) => row.status !== 'DONE' && row.due_date && row.due_date < today();
const STATUS_LABEL = { TODO: 'To do', IN_PROGRESS: 'In progress', PENDING: 'Pending', DONE: 'Done' };
export const statusText = (status) => STATUS_LABEL[status] || status;
const toneOfStatus = (row) => ({ DONE: 'ok', IN_PROGRESS: 'info', PENDING: 'warn' }[row.status] || 'neutral');
const toneOfPriority = (row) => ({ HIGH: 'danger', MEDIUM: 'warn', LOW: 'ok' }[row.priority] || 'neutral');

export const TASK_COLUMNS = [
  { key: 'id', label: 'ID', width: 9, type: 'number', value: (r) => r.id, default: true },
  { key: 'title', label: 'Task', width: 44, wrap: true, default: true },
  { key: 'issue_type', label: 'Type', width: 12, value: (r) => (r.issue_type || 'task').toUpperCase(), default: true },
  { key: 'status', label: 'Status', width: 14, value: (r) => statusText(r.status), tone: toneOfStatus, default: true },
  { key: 'priority', label: 'Priority', width: 11, tone: toneOfPriority, default: true },
  { key: 'assigned_to_name', label: 'Assignee', width: 22, value: (r) => r.assigned_to_name || 'Unassigned', default: true },
  { key: 'client_name', label: 'Client', width: 22, default: true },
  { key: 'due_date', label: 'Due date', width: 14, type: 'date', default: true },
  { key: 'overdue', label: 'Overdue', width: 10, value: (r) => (isOverdue(r) ? 'Yes' : ''), tone: (r) => (isOverdue(r) ? 'danger' : null), default: true },
  { key: 'created_at', label: 'Created', width: 18, type: 'datetime', default: true },
  { key: 'completed_at', label: 'Completed', width: 18, type: 'datetime' },
  { key: 'created_by_name', label: 'Created by', width: 20 },
  { key: 'start_date', label: 'Start date', width: 14, type: 'date' },
  { key: 'assigned_date', label: 'Assigned date', width: 14, type: 'date' },
  { key: 'team_name', label: 'Team', width: 18 },
  { key: 'task_type', label: 'Task type', width: 16 },
  { key: 'product', label: 'Product', width: 16 },
  { key: 'category', label: 'Category', width: 16 },
  { key: 'review_status', label: 'Review', width: 16, value: (r) => (r.review_status && r.review_status !== 'NONE' ? r.review_status.replaceAll('_', ' ').toLowerCase() : '') },
  { key: 'blocked_reason', label: 'Blocked by', width: 30, wrap: true },
  { key: 'total_comments', label: 'Comments', width: 11, type: 'number' },
  { key: 'description', label: 'Description', width: 60, wrap: true },
];
export const DEFAULT_TASK_COLUMNS = TASK_COLUMNS.filter((column) => column.default).map((column) => column.key);

export const GROUPS = [
  { id: '', label: 'No grouping' },
  { id: 'assigned_to_name', label: 'Assignee', value: (r) => r.assigned_to_name || 'Unassigned' },
  { id: 'status', label: 'Status', value: (r) => statusText(r.status) },
  { id: 'priority', label: 'Priority', value: (r) => r.priority || 'MEDIUM' },
  { id: 'client_name', label: 'Client', value: (r) => r.client_name || 'No client' },
  { id: 'issue_type', label: 'Type', value: (r) => (r.issue_type || 'task').toUpperCase() },
];

// Rows with group header markers ({ __group }) inserted, sorted by group name.
export function groupRows(rows, groupId) {
  const group = GROUPS.find((item) => item.id === groupId);
  if (!group?.value) return rows;
  const buckets = new Map();
  rows.forEach((row) => { const key = group.value(row); if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(row); });
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([key, items]) => [{ __group: `${group.label}: ${key} (${items.length})` }, ...items]);
}

export function applyTaskFilters(rows, filters) {
  const search = filters.search.trim().toLowerCase();
  return rows.filter((row) => (!filters.statuses.length || filters.statuses.includes(row.status))
    && (!filters.priorities.length || filters.priorities.includes(row.priority))
    && (!filters.types.length || filters.types.includes(row.issue_type || 'task'))
    && (!filters.overdueOnly || isOverdue(row))
    && (!search || `${row.title} ${row.client_name || ''} ${row.assigned_to_name || ''}`.toLowerCase().includes(search)));
}
