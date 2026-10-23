import { buildPivot, dimensionsFor, metricsFor } from './customReport';

const logs = [
  { entry_id: 1, user_id: 3, user_name: 'Rahul', client_name: 'Acme', hours: 3.5, work_date: '2026-10-01' },
  { entry_id: 1, user_id: 4, user_name: 'Priya', client_name: 'Acme', hours: 1.5, work_date: '2026-10-02' },
  { entry_id: 2, user_id: 3, user_name: 'Rahul', client_name: 'Beta', hours: 2, work_date: '2026-10-03' },
];
const tasks = [
  { id: 1, status: 'DONE', client_name: 'Acme', created_at: '2026-10-01T10:00:00', completed_at: '2026-10-04T10:00:00' },
  { id: 2, status: 'TODO', client_name: 'Acme', created_at: '2026-10-02T10:00:00', due_date: '2000-01-01' },
  { id: 3, status: 'DONE', client_name: null, created_at: '2026-10-03T10:00:00', completed_at: '2026-10-04T10:00:00' },
];

test('time per client adds hours, counts entries and distinct people', () => {
  const result = buildPivot(logs, { source: 'time', rowDim: 'client', metrics: ['hours', 'entries', 'people'] });
  expect(result.groups.map((g) => [g.label, g.values.hours, g.values.entries, g.values.people])).toEqual([['Acme', 5, 1, 2], ['Beta', 2, 1, 1]]);
  expect(result.totals).toEqual({ hours: 7, entries: 2, people: 2 });
});

test('a split spreads the first metric across columns with matching totals', () => {
  const result = buildPivot(logs, { source: 'time', rowDim: 'person', splitDim: 'client', metrics: ['hours'] });
  expect(result.splits).toEqual(['Acme', 'Beta']);
  expect(result.groups[0]).toMatchObject({ label: 'Rahul', split: { Acme: 3.5, Beta: 2 } });
  expect(result.splitTotals).toEqual({ Acme: 5, Beta: 2 });
});

test('task metrics: completion is computed from raw rows, overdue and days to complete are right', () => {
  const result = buildPivot(tasks, { source: 'task', rowDim: 'client', metrics: ['tasks', 'completion', 'overdue', 'avgDays'], sort: 'name' });
  const acme = result.groups.find((g) => g.label === 'Acme');
  expect(acme.values).toEqual({ tasks: 2, completion: 0.5, overdue: 1, avgDays: 3 });
  expect(result.groups.find((g) => g.label === 'No client').values.avgDays).toBe(1);
  expect(result.totals.completion).toBeCloseTo(2 / 3);
});

test('dimensions and metrics are offered only for the matching source', () => {
  expect(dimensionsFor('time').map((d) => d.id)).not.toContain('status');
  expect(dimensionsFor('task').map((d) => d.id)).not.toContain('jobType');
  expect(metricsFor('time').map((m) => m.id)).toEqual(['hours', 'entries', 'people', 'avgHours', 'perDay']);
  expect(metricsFor('task').map((m) => m.id)).toContain('taskHours');
});

test('hours per working day divides by the days each person actually logged', () => {
  const result = buildPivot(logs, { source: 'time', rowDim: 'person', metrics: ['hours', 'perDay'] });
  expect(result.groups.find((g) => g.label === 'Rahul').values).toEqual({ hours: 5.5, perDay: 2.75 });
});
