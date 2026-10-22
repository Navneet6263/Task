import React from 'react';
import { Chip } from '../../../ui';
import { PRIORITY_TONE, STATUS_TONE, statusLabel } from '../tones';

const ISSUE_TONE = { bug: 'danger', story: 'info', feature: 'ok', enhancement: 'warn' };
const REVIEW_TONE = { READY: 'info', APPROVED: 'ok', CHANGES_REQUESTED: 'warn' };

const initials = (name) => {
  if (!name) return '?';
  const parts = String(name).split(' ').filter(Boolean);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

const dateLabel = (value) => {
  if (!value) return <span className="text-muted">—</span>;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return <span className="text-muted">—</span>;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const dateTime = (value) => {
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) return <span className="text-muted">—</span>;
  return <>
    <span className="font-medium">{parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}</span>
    <div className="text-[11px] text-muted">{parsed.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</div>
  </>;
};

const isOverdue = (task) => task.due_date && task.status !== 'DONE' && String(task.due_date).slice(0, 10) < new Date().toISOString().slice(0, 10);

// Every column the task list can show. `pinned` columns cannot be hidden or moved.
// `cell` gets the task; `nowrap` keeps short values on one line.
export const COLUMNS = [
  {
    id: 'task', label: 'Task', pinned: true,
    cell: (task) => (
      <div className="flex flex-wrap items-center gap-1.5">
        {task.manager_assigned && <Chip tone="warn">MANAGER</Chip>}
        <strong className="font-semibold">{task.title}</strong>
        {task.blocked_reason && <span title={task.blocked_reason}><Chip tone="warn">Blocked</Chip></span>}
        {task.unread_comments > 0 && <span className="grid h-4 min-w-[16px] place-items-center rounded-full bg-danger px-1 text-[9px] font-bold text-white" title="Unread comments">{task.unread_comments}</span>}
      </div>
    ),
  },
  { id: 'type', label: 'Type', nowrap: true, cell: (task) => <Chip tone={ISSUE_TONE[task.issue_type] || 'neutral'}>{(task.issue_type || 'task').toUpperCase()}</Chip> },
  {
    id: 'assignee', label: 'Assignee',
    cell: (task) => (
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">{initials(task.assigned_to_name)}</span>
        <span>{task.assigned_to_name || 'Unassigned'}</span>
      </div>
    ),
  },
  { id: 'due', label: 'Due', nowrap: true, cell: (task) => <span className={isOverdue(task) ? 'font-semibold text-danger' : ''}>{dateLabel(task.due_date)}</span> },
  { id: 'priority', label: 'Priority', nowrap: true, cell: (task) => <Chip tone={PRIORITY_TONE[task.priority] || 'warn'}>{task.priority || 'MEDIUM'}</Chip> },
  { id: 'status', label: 'Status', nowrap: true, cell: (task) => <Chip tone={STATUS_TONE[task.status] || 'neutral'}>{statusLabel(task.status)}</Chip> },
  { id: 'client', label: 'Client', cell: (task) => task.client_name || <span className="text-muted">—</span> },
  { id: 'createdBy', label: 'Created By', cell: (task) => <span className="font-medium">{task.created_by_name || task.assigned_by_name || 'System'}</span> },
  { id: 'createdAt', label: 'Created At', nowrap: true, cell: (task) => dateTime(task.created_at) },
  { id: 'startDate', label: 'Start', nowrap: true, cell: (task) => dateLabel(task.start_date) },
  { id: 'assignedDate', label: 'Assigned', nowrap: true, cell: (task) => dateLabel(task.assigned_date) },
  {
    id: 'review', label: 'Review', nowrap: true,
    cell: (task) => (task.review_status && task.review_status !== 'NONE'
      ? <Chip tone={REVIEW_TONE[task.review_status] || 'neutral'}>{task.review_status.replaceAll('_', ' ').toLowerCase()}</Chip>
      : <span className="text-muted">—</span>),
  },
  { id: 'comments', label: 'Comments', nowrap: true, align: 'right', cell: (task) => <span className="font-mono">{task.total_comments || 0}</span> },
];

export const COLUMN_BY_ID = Object.fromEntries(COLUMNS.map((column) => [column.id, column]));

const DEFAULT_VISIBLE = ['task', 'type', 'assignee', 'due', 'priority', 'status'];
export const PRESETS = {
  Default: DEFAULT_VISIBLE,
  Compact: ['task', 'assignee', 'due', 'status'],
  Detailed: ['task', 'type', 'assignee', 'due', 'priority', 'status', 'client', 'createdBy', 'createdAt', 'review', 'comments'],
};

// Layout is an ordered list of { id, visible } covering every column.
export function defaultLayout(showCreated = false) {
  const visible = new Set([...DEFAULT_VISIBLE, ...(showCreated ? ['createdBy', 'createdAt'] : [])]);
  return COLUMNS.map((column) => ({ id: column.id, visible: visible.has(column.id) }));
}

export function presetLayout(name, current) {
  const visible = new Set(PRESETS[name]);
  return current.map((entry) => ({ ...entry, visible: visible.has(entry.id) }));
}

// Keep saved order, drop unknown ids, append columns added in newer releases, and keep pinned first.
export function normalizeLayout(saved, fallback) {
  if (!Array.isArray(saved)) return fallback;
  const known = saved.filter((entry) => entry && COLUMN_BY_ID[entry.id] && typeof entry.visible === 'boolean');
  const seen = new Set(known.map((entry) => entry.id));
  const merged = [...known, ...fallback.filter((entry) => !seen.has(entry.id))];
  const pinned = merged.filter((entry) => COLUMN_BY_ID[entry.id].pinned).map((entry) => ({ ...entry, visible: true }));
  return [...pinned, ...merged.filter((entry) => !COLUMN_BY_ID[entry.id].pinned)];
}

// Move `fromId` to the position of `toId`. Pinned columns never move.
export function moveColumn(layout, fromId, toId) {
  if (fromId === toId || COLUMN_BY_ID[fromId]?.pinned || COLUMN_BY_ID[toId]?.pinned) return layout;
  const from = layout.findIndex((entry) => entry.id === fromId);
  const to = layout.findIndex((entry) => entry.id === toId);
  if (from < 0 || to < 0) return layout;
  const next = [...layout];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
