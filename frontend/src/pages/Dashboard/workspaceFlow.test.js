import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './index';
import { calendar, tasks, teams } from '../../services/api';
jest.mock('../../services/api', () => ({
  tasks: { getByTeam: jest.fn(), getClients: jest.fn(), getFormOptions: jest.fn(), getDetail: jest.fn(), update: jest.fn() },
  teams: { getAll: jest.fn(), getMembers: jest.fn() },
  calendar: { events: jest.fn() },
}));
let root, container;
const task = { id: 8, title: 'Fix login', team_id: 2, priority: 'HIGH', status: 'TODO', issue_type: 'bug', version: 3 };
const summary = { total: 219, todo: 100, done: 119, in_progress: 0, pending: 0, overdue: 1, high: 10, medium: 100, low: 109 };
const button = text => [...container.querySelectorAll('button')].find(node => node.textContent.trim() === text);
beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); localStorage.setItem('user', JSON.stringify({ id: 10, name: 'Teammate', role: 'member' }));
  jest.clearAllMocks();
  teams.getAll.mockResolvedValue({ data: [{ id: 2, name: 'Test Team' }] }); teams.getMembers.mockResolvedValue({ data: [] });
  tasks.getClients.mockResolvedValue({ data: ['Acme'] });
  calendar.events.mockResolvedValue({ data: { events: [], tasks: [] } });
  tasks.getFormOptions.mockResolvedValue({ data: { task_types: [], products: [], categories: [] } });
  tasks.getByTeam.mockResolvedValue({ data: { data: [task], summary, team_summary: summary, pagination: { total: 219, total_pages: 19 } } });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Dashboard /></MemoryRouter>));
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
test('team metrics render real server totals instead of the loaded page count', () => {
  const label = [...container.querySelectorAll('p')].find(node => node.textContent === 'Total Tasks');
  expect(label.closest('article').querySelector('h3').textContent).toBe('219');
  expect(container.textContent).toContain('219 tasks found');
});
test('stats cards keep their own colour classes and all four values', () => {
  const cards = [...container.querySelectorAll('.dashboard-metric-card')];
  expect(cards).toHaveLength(4);
  ['blue', 'amber', 'green', 'coral'].forEach((tone, index) => {
    expect(cards[index].classList.contains(`dashboard-metric-${tone}`)).toBe(true);
    expect(cards[index].classList.contains(`tone-${tone}`)).toBe(false);
  });
  expect(cards.map(card => card.querySelector('h3').textContent)).toEqual(['219', '100', '54%', '1']);
});
test('inline filters collect multiple values and make one request on Apply', async () => {
  const count = tasks.getByTeam.mock.calls.length;
  act(() => button('Filters').click());
  expect(container.querySelector('[aria-modal="true"]')).toBeNull();
  act(() => button('All Types').click());
  const option = name => [...container.querySelectorAll('label')].find(node => node.textContent.includes(name))?.querySelector('input[type="checkbox"]');
  act(() => option('Bug').click()); act(() => option('Story').click());
  expect(tasks.getByTeam).toHaveBeenCalledTimes(count);
  await act(async () => button('Show results').click());
  expect(tasks.getByTeam).toHaveBeenCalledTimes(count + 1);
  expect(tasks.getByTeam.mock.calls.at(-1)[3].issueTypes).toEqual(['bug', 'story']);
  expect(container.textContent).toContain('Type: bug, story');
});
test('board fetch requests bounded per-column data', async () => {
  await act(async () => button('board').click());
  expect(tasks.getByTeam.mock.calls.at(-1)[3].board).toBe(true);
  expect(container.textContent).toContain('Load more');
});
