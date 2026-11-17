import { readPreference, writePreference } from './preferences';

// Tasks the person opened lately (newest first), for "Recent" in search. Kept per person and workspace.
const KEY = 'recent-tasks';
const MAX = 20;
export const RECENT_CHANGED = 'greentask:recent-changed';

export function rememberTask(task) {
  if (!task?.id) return;
  const list = [{ id: Number(task.id), title: String(task.title || ''), status: task.status || '', at: Date.now() },
    ...readPreference(KEY, []).filter((r) => Number(r.id) !== Number(task.id))].slice(0, MAX);
  writePreference(KEY, list);
  window.dispatchEvent(new Event(RECENT_CHANGED));
}

export const recentTasks = () => readPreference(KEY, []);
export const forgetTask = (id) => writePreference(KEY, recentTasks().filter((r) => Number(r.id) !== Number(id)));

// "Today", "Yesterday", "This week" or "Earlier", like Jira's Recent list.
export function whenLabel(at, now = Date.now()) {
  const day = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const days = Math.round((day(now) - day(at)) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'This week';
  return 'Earlier';
}
