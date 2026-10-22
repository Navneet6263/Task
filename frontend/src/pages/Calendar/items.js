import { todayKey } from './dates';

// One shape for everything drawn on the calendar: events from the API and tasks by due date.
export const TYPE_LABEL = { EVENT: 'Event', MEETING: 'Meeting', REMINDER: 'Reminder', TASK: 'Task due' };

// Literal class names so Tailwind keeps them.
export const TONE = {
  EVENT: { chip: 'bg-accent-soft text-accent', dot: 'bg-accent', block: 'border-accent/50 bg-accent-soft text-ink' },
  MEETING: { chip: 'bg-info-soft text-info', dot: 'bg-info', block: 'border-info/50 bg-info-soft text-ink' },
  REMINDER: { chip: 'bg-warn-soft text-warn', dot: 'bg-warn', block: 'border-warn/50 bg-warn-soft text-ink' },
  TASK: { chip: 'bg-subtle text-ink', dot: 'bg-muted', block: 'border-line bg-subtle text-ink' },
  OVERDUE: { chip: 'bg-danger-soft text-danger', dot: 'bg-danger', block: 'border-danger/50 bg-danger-soft text-ink' },
};

export function toItems({ events = [], tasks = [] }) {
  const today = todayKey();
  const eventItems = events.map((event) => ({
    key: `e${event.id}`, kind: 'event', id: event.id, title: event.title, type: event.event_type,
    start: event.start_at, end: event.end_at, allDay: event.all_day, declined: event.my_response === 'DECLINED', raw: event,
  }));
  const taskItems = tasks.map((task) => ({
    key: `t${task.id}`, kind: 'task', id: task.id, title: task.title, type: 'TASK',
    start: `${task.due_date}T00:00`, end: `${task.due_date}T23:59`, allDay: true,
    done: task.status === 'DONE', overdue: task.status !== 'DONE' && task.due_date < today, raw: task,
  }));
  return [...eventItems, ...taskItems];
}

export const toneOf = (item) => TONE[item.overdue ? 'OVERDUE' : item.type] || TONE.EVENT;

export const onDay = (item, dayKey) => item.start.slice(0, 10) <= dayKey && item.end.slice(0, 10) >= dayKey;

// All-day items first, then by start time.
export const byStart = (a, b) => (Number(b.allDay) - Number(a.allDay)) || a.start.localeCompare(b.start) || a.title.localeCompare(b.title);
