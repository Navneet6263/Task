import { localDate } from '../../services/localDate';

export const STATUSES = [['TODO', 'To do'], ['IN_PROGRESS', 'In progress'], ['PENDING', 'Pending'], ['DONE', 'Done']];
export const STATUS_LABEL = Object.fromEntries(STATUSES);
export const STATUS_DOT = { TODO: 'bg-muted', IN_PROGRESS: 'bg-info', PENDING: 'bg-warn', DONE: 'bg-accent' };
export const PRIORITY_TONE = { HIGH: 'danger', MEDIUM: 'warn', LOW: 'ok' };
export const STATUS_TONE = { TODO: 'neutral', IN_PROGRESS: 'info', PENDING: 'warn', DONE: 'ok' };

const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return localDate(d); };

// How a due date reads and which tone it gets: overdue red, today amber.
export function dueInfo(task) {
  const due = task.due_date ? String(task.due_date).slice(0, 10) : '';
  if (!due) return { text: 'No due date', tone: 'muted' };
  const today = localDate();
  const label = new Date(`${due}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (task.status !== 'DONE' && due < today) return { text: `Overdue · ${label}`, tone: 'danger' };
  if (due === today) return { text: 'Due today', tone: 'warn' };
  if (due === addDays(1)) return { text: 'Due tomorrow', tone: 'info' };
  return { text: `Due ${label}`, tone: 'muted' };
}
export const DUE_TEXT = { danger: 'text-danger', warn: 'text-warn', info: 'text-info', muted: 'text-muted' };

// Agenda buckets by due date; completed tasks go last.
export function bucketOf(task) {
  if (task.status === 'DONE') return 'done';
  const due = task.due_date ? String(task.due_date).slice(0, 10) : '';
  if (!due) return 'none';
  const today = localDate();
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  if (due === addDays(1)) return 'tomorrow';
  if (due <= addDays(7)) return 'week';
  return 'later';
}
export const BUCKETS = [
  ['overdue', 'Overdue', 'text-danger'], ['today', 'Today', 'text-warn'], ['tomorrow', 'Tomorrow', 'text-info'],
  ['week', 'Next 7 days', 'text-ink'], ['later', 'Later', 'text-ink'], ['none', 'No due date', 'text-muted'], ['done', 'Completed', 'text-accent'],
];

export const initials = (name) => {
  if (!name) return '?';
  const parts = String(name).split(' ').filter(Boolean);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};
