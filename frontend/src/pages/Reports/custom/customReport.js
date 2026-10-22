import { isOverdue, statusText } from '../reportColumns';

// A custom report = one data source + a row dimension (+ optional split) + metrics.
// "task" rows come from the team task export; "time" rows are timesheet hours, or hours logged on tasks.
const monthOf = (value) => (value ? String(value).slice(0, 7) : 'No date');
const weekOf = (value) => {
  if (!value) return 'No date';
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const daysBetween = (a, b) => Math.max(0, (new Date(b.slice(0, 10)) - new Date(a.slice(0, 10))) / 86400000);

export const DIMENSIONS = {
  client: { label: 'Client', task: (r) => r.client_name || 'No client', time: (r) => r.client_name || 'No client' },
  person: { label: 'Person', task: (r) => r.assigned_to_name || 'Unassigned', time: (r) => r.user_name || 'Unknown' },
  status: { label: 'Status', task: (r) => statusText(r.status) },
  priority: { label: 'Priority', task: (r) => r.priority || 'MEDIUM' },
  type: { label: 'Type', task: (r) => (r.issue_type || 'task').toUpperCase() },
  team: { label: 'Team', task: (r) => r.team_name || 'No team' },
  jobType: { label: 'Job type', time: (r) => r.job_type || 'Not set' },
  workType: { label: 'Work type', time: (r) => r.work_type || 'Not set' },
  month: { label: 'Month', task: (r) => monthOf(r.created_at), time: (r) => monthOf(r.work_date) },
  week: { label: 'Week starting', task: (r) => weekOf(r.created_at), time: (r) => weekOf(r.work_date) },
};

const completed = (rows) => rows.filter((r) => r.status === 'DONE');
const timed = (rows) => completed(rows).filter((r) => r.completed_at && r.created_at);
const sum = (values) => values.reduce((a, b) => a + b, 0);
const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

export const METRICS = {
  tasks: { label: 'Tasks', source: 'task', type: 'number', calc: (rows) => rows.length },
  completed: { label: 'Completed', source: 'task', type: 'number', calc: (rows) => completed(rows).length },
  open: { label: 'Open', source: 'task', type: 'number', calc: (rows) => rows.filter((r) => r.status !== 'DONE').length },
  overdue: { label: 'Overdue', source: 'task', type: 'number', calc: (rows) => rows.filter(isOverdue).length },
  completion: { label: 'Completion %', source: 'task', type: 'percent', calc: (rows) => (rows.length ? completed(rows).length / rows.length : 0) },
  totalDays: { label: 'Days to complete (total)', source: 'task', type: 'decimal', calc: (rows) => round(sum(timed(rows).map((r) => daysBetween(r.created_at, r.completed_at))), 1) },
  avgDays: { label: 'Days to complete (avg)', source: 'task', type: 'decimal', calc: (rows) => { const t = timed(rows); return t.length ? round(sum(t.map((r) => daysBetween(r.created_at, r.completed_at))) / t.length, 1) : 0; } },
  hours: { label: 'Hours', source: 'time', type: 'decimal', calc: (rows) => round(sum(rows.map((r) => Number(r.hours) || 0))) },
  entries: { label: 'Entries', source: 'time', type: 'number', calc: (rows) => new Set(rows.map((r) => r.entry_id)).size },
  people: { label: 'People', source: 'time', type: 'number', calc: (rows) => new Set(rows.map((r) => r.user_id)).size },
  avgHours: { label: 'Hours per entry', source: 'time', type: 'decimal', calc: (rows) => { const n = new Set(rows.map((r) => r.entry_id)).size; return n ? round(sum(rows.map((r) => Number(r.hours) || 0)) / n) : 0; } },
};

export const dimensionsFor = (source) => Object.entries(DIMENSIONS).filter(([, d]) => d[source]).map(([id, d]) => ({ id, label: d.label }));
export const metricsFor = (source) => Object.entries(METRICS).filter(([, m]) => m.source === source).map(([id, m]) => ({ id, ...m }));

export const TEMPLATES = [
  { id: 'timePerClient', label: 'Time per client', needsTime: true, config: { source: 'time', rowDim: 'client', splitDim: '', metrics: ['hours', 'entries', 'people'], sort: 'metric', limit: 0 } },
  { id: 'timePerPerson', label: 'Time per person', needsTime: true, config: { source: 'time', rowDim: 'person', splitDim: 'client', metrics: ['hours'], sort: 'metric', limit: 0 } },
  { id: 'tasksPerClient', label: 'Tasks per client', config: { source: 'task', rowDim: 'client', splitDim: '', metrics: ['tasks', 'completed', 'overdue', 'completion', 'avgDays'], sort: 'metric', limit: 0 } },
  { id: 'workload', label: 'Workload by person', config: { source: 'task', rowDim: 'person', splitDim: 'status', metrics: ['tasks'], sort: 'metric', limit: 0 } },
  { id: 'throughput', label: 'Monthly throughput', config: { source: 'task', rowDim: 'month', splitDim: '', metrics: ['tasks', 'completed', 'completion'], sort: 'name', limit: 0 } },
];

// Builds the result table. With a split dimension, the first metric is spread across
// split columns and a Total column; totals are computed from raw rows, never by
// adding up percentages.
export function buildPivot(rows, { source, rowDim, splitDim, metrics, sort = 'metric', limit = 0 }) {
  const rowKey = DIMENSIONS[rowDim]?.[source];
  if (!rowKey || !metrics.length) return { groups: [], splits: [], totals: {}, splitTotals: {} };
  const splitKey = splitDim && splitDim !== rowDim ? DIMENSIONS[splitDim]?.[source] : null;
  const first = METRICS[metrics[0]];
  const buckets = new Map();
  rows.forEach((r) => { const key = rowKey(r); if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(r); });
  const splits = splitKey ? [...new Set(rows.map(splitKey))].sort() : [];

  let groups = [...buckets.entries()].map(([label, items]) => ({
    label,
    values: Object.fromEntries(metrics.map((id) => [id, METRICS[id].calc(items)])),
    split: splitKey ? Object.fromEntries(splits.map((s) => [s, first.calc(items.filter((r) => splitKey(r) === s))])) : null,
  }));
  groups.sort(sort === 'name' ? (a, b) => a.label.localeCompare(b.label) : (a, b) => (b.values[metrics[0]] - a.values[metrics[0]]) || a.label.localeCompare(b.label));
  if (limit > 0) groups = groups.slice(0, limit);

  return {
    groups,
    splits,
    totals: Object.fromEntries(metrics.map((id) => [id, METRICS[id].calc(rows)])),
    splitTotals: splitKey ? Object.fromEntries(splits.map((s) => [s, first.calc(rows.filter((r) => splitKey(r) === s))])) : {},
  };
}
