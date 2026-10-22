// Pure performance maths for the PMS Hub. Input rows are completed tasks:
// { assigned_to, created_at, start_date, assigned_date, due_date, completed_at, priority }.
const DAY = 86400000;
// Dates arrive as 'YYYY-MM-DD[THH:mm:ss]' wall-clock text; read the calendar day directly (no timezone shift).
const dayStart = (value) => {
  const match = value ? String(value).match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
};

// Working start = start date, else assigned date, else created date. Same-day work counts as 0.5 days.
function daysTaken(task) {
  const start = dayStart(task.start_date) ?? dayStart(task.assigned_date) ?? dayStart(task.created_at);
  const end = dayStart(task.completed_at);
  if (start === null || end === null) return null;
  return Math.max(0.5, (end - start) / DAY);
}

const onTime = (task) => (task.due_date && task.completed_at ? dayStart(task.completed_at) <= dayStart(task.due_date) : null);
const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const round1 = (value) => (value === null || value === undefined ? null : Math.round(value * 10) / 10);

function personStats(tasks) {
  const days = tasks.map(daysTaken).filter((d) => d !== null);
  const measured = tasks.map(onTime).filter((v) => v !== null);
  return {
    completed: tasks.length,
    medianDays: round1(median(days)),
    avgDays: round1(days.length ? days.reduce((a, b) => a + b, 0) / days.length : null),
    onTimeRate: measured.length ? Math.round((measured.filter(Boolean).length / measured.length) * 100) : null,
    measured: measured.length,
    highPriority: tasks.filter((t) => t.priority === 'HIGH').length,
  };
}

// Share of peers you are ahead of (0–100). For days, fewer is better.
function percentile(mine, peers, lowerIsBetter = false) {
  const values = peers.filter((v) => v !== null && v !== undefined);
  if (mine === null || mine === undefined || values.length < 2) return null;
  const behind = values.filter((v) => (lowerIsBetter ? v > mine : v < mine)).length;
  const tied = values.filter((v) => v === mine).length;
  return Math.round(((behind + tied / 2) / values.length) * 100);
}

const weekKey = (value) => {
  const day = new Date(dayStart(value));
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
};

// Whole picture for one user against everyone in their teams (peers are anonymous).
function buildPerformance(rows, userId, { weeks = 12 } = {}) {
  const byUser = new Map();
  rows.forEach((row) => { const id = Number(row.assigned_to); if (!byUser.has(id)) byUser.set(id, []); byUser.get(id).push(row); });
  const mineRows = byUser.get(Number(userId)) || [];
  const me = personStats(mineRows);
  const peers = [...byUser.entries()].map(([id, tasks]) => ({ id, ...personStats(tasks) }));
  if (!byUser.has(Number(userId))) peers.push({ id: Number(userId), ...personStats([]) });
  const others = peers.filter((p) => p.id !== Number(userId));
  const avg = (key) => { const v = others.map((p) => p[key]).filter((x) => x !== null); return v.length ? round1(v.reduce((a, b) => a + b, 0) / v.length) : null; };

  const trend = new Map();
  const peerCount = Math.max(1, others.length);
  rows.forEach((row) => {
    const key = weekKey(row.completed_at);
    const entry = trend.get(key) || { week: key, mine: 0, team: 0 };
    if (Number(row.assigned_to) === Number(userId)) entry.mine += 1; else entry.team += 1;
    trend.set(key, entry);
  });
  const weekly = [...trend.values()].sort((a, b) => a.week.localeCompare(b.week)).slice(-weeks)
    .map((w) => ({ week: w.week, mine: w.mine, teamAverage: round1(w.team / peerCount) }));

  const buckets = [['Same day', 0, 0.5], ['1–3 days', 0.5, 3], ['4–7 days', 3, 7], ['1–2 weeks', 7, 14], ['Over 2 weeks', 14, Infinity]];
  const days = mineRows.map(daysTaken).filter((d) => d !== null);
  return {
    me,
    team: { people: others.length, completed: avg('completed'), medianDays: avg('medianDays'), onTimeRate: avg('onTimeRate') },
    rank: {
      completed: percentile(me.completed, peers.map((p) => p.completed)),
      speed: percentile(me.medianDays, peers.map((p) => p.medianDays), true),
      onTime: percentile(me.onTimeRate, peers.map((p) => p.onTimeRate)),
    },
    weekly,
    distribution: buckets.map(([label, min, max]) => ({ label, count: days.filter((d) => (min === 0 ? d <= max : d > min && d <= max)).length })),
  };
}

module.exports = { daysTaken, onTime, median, percentile, personStats, buildPerformance };
