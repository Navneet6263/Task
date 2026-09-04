import { filterTasksLocally, paginateTasks, summarizeTasks } from './taskDataUtils';

const tasks = [
  { id: 1, title: 'Login bug', status: 'TODO', priority: 'HIGH', issue_type: 'bug', assigned_to: 4, client_name: 'Acme', created_at: '2026-08-01', due_date: '2020-01-01' },
  { id: 2, title: 'Checkout story', status: 'DONE', priority: 'MEDIUM', issue_type: 'story', assigned_to: 5, client_name: 'Beta', created_at: '2026-08-02', due_date: '2026-08-20' },
  { id: 3, title: 'Profile story', status: 'IN_PROGRESS', priority: 'HIGH', issue_type: 'story', assigned_to: 4, client_name: 'Acme', created_at: '2026-08-03', due_date: '2099-01-01' },
];

test('legacy fallback keeps multi-filters and metric counts accurate', () => {
  const filtered = filterTasksLocally(tasks, {
    statuses: ['TODO', 'IN_PROGRESS'],
    priorities: ['HIGH'],
    issueTypes: ['bug', 'story'],
    assignees: ['4'],
    clientNames: ['Acme'],
    search: '',
    createdFrom: '',
    createdTo: '',
  });
  const summary = summarizeTasks(filtered);

  expect(filtered.map((task) => task.id)).toEqual([1, 3]);
  expect(summary).toMatchObject({ total: 2, todo: 1, in_progress: 1, high: 2 });
});

test('legacy fallback paginates without changing the total', () => {
  const result = paginateTasks(tasks, 2, 2);
  expect(result.data.map((task) => task.id)).toEqual([3]);
  expect(result.pagination).toMatchObject({ total: 3, page: 2, total_pages: 2 });
});

test('My Day keeps due work assigned to the current user and ignores snoozed tasks', () => {
  const result = filterTasksLocally([
    ...tasks,
    { id: 4, title: 'Snoozed item', status: 'TODO', priority: 'LOW', issue_type: 'task', assigned_to: 4, due_date: '2020-01-01', snoozed_until: '2099-01-01' },
  ], {
    statuses: [], priorities: [], issueTypes: [], assignees: [], clientNames: [],
    search: '', createdFrom: '', createdTo: '', focus: 'MY_DAY', currentUserId: 4,
  });

  expect(result.map((task) => task.id)).toEqual([1]);
});
