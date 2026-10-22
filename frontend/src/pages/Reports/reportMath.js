import { isOverdue } from './reportColumns';

const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

// Headline numbers for the overview, computed from the task rows of the period.
export function overview(rows) {
  const done = rows.filter((r) => r.status === 'DONE');
  const measured = done.filter((r) => r.completed_at && r.due_date);
  const onTime = measured.filter((r) => r.completed_at.slice(0, 10) <= r.due_date);
  const count = (key, value) => rows.filter((r) => r[key] === value).length;
  return {
    total: rows.length,
    done: done.length,
    completion: pct(done.length, rows.length),
    overdue: rows.filter(isOverdue).length,
    blocked: rows.filter((r) => r.status !== 'DONE' && r.blocked_reason).length,
    onTime: pct(onTime.length, measured.length),
    measured: measured.length,
    status: { todo: count('status', 'TODO'), inProgress: count('status', 'IN_PROGRESS'), pending: count('status', 'PENDING'), done: done.length },
    priority: { HIGH: count('priority', 'HIGH'), MEDIUM: count('priority', 'MEDIUM'), LOW: count('priority', 'LOW') },
  };
}

// Monday of the week containing a YYYY-MM-DD date.
const weekStart = (key) => {
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Created vs completed per week, oldest first, at most the last 12 weeks with activity.
export function weeklyTrend(rows) {
  const weeks = new Map();
  const bump = (key, field) => { const w = weekStart(key); const entry = weeks.get(w) || { week: w, created: 0, completed: 0 }; entry[field] += 1; weeks.set(w, entry); };
  rows.forEach((r) => {
    if (r.created_at) bump(r.created_at.slice(0, 10), 'created');
    if (r.status === 'DONE' && r.completed_at) bump(r.completed_at.slice(0, 10), 'completed');
  });
  return [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)).slice(-12);
}

export function topClients(rows, limit = 6) {
  const counts = new Map();
  rows.forEach((r) => { if (r.client_name) counts.set(r.client_name, (counts.get(r.client_name) || 0) + 1); });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, total]) => ({ name, total }));
}
