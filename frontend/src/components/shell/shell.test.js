import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import CommandPalette from './CommandPalette';
import WorkTypePicker from './WorkTypePicker';
import SpaceSummary from '../../pages/Spaces/SpaceSummary';
import { resetTaskMetaCache } from '../taskExtras/taskExtrasStore';

const h = {};
jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: (...a) => h.apiGet(...a) },
  taskExtras: { meta: async () => ({ data: { prefix: 'ACC', labels: [] } }), search: (...a) => h.search(...a), apply: (...a) => h.apply(...a), setWorkType: (...a) => h.setWorkType(...a) },
  tasks: { create: (...a) => h.create(...a) },
  teams: { getAll: async () => ({ data: [{ id: 7, name: 'Payroll', member_count: 4 }, { id: 8, name: 'Audit', member_count: 2 }] }), getMembers: async () => ({ data: [{ id: 12, name: 'Asha' }] }) },
}));
jest.mock('../../services/feedback', () => ({ notify: (...a) => h.notify?.(...a) }));

let c, r, at;
function Where() { at = useLocation(); return null; }
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; resetTaskMetaCache(); localStorage.clear(); c = document.createElement('div'); document.body.append(c); r = createRoot(c); });
afterEach(() => { act(() => r.unmount()); c.remove(); });
const flush = (ms = 0) => act(async () => { await new Promise((res) => setTimeout(res, ms)); });
const type = (el, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); };
const render = (ui) => act(async () => r.render(<MemoryRouter initialEntries={['/x']}><Routes><Route path="*" element={<>{ui}<Where /></>} /></Routes></MemoryRouter>));

test('Ctrl+K finds a task by its key and opens it with Enter', async () => {
  h.search = jest.fn(async () => ({ data: [{ id: 142, title: 'VAT return', status: 'TODO' }] }));
  const onClose = jest.fn();
  await render(<CommandPalette navGroups={[{ label: 'Main', items: [{ path: '/my-tasks', label: 'My Tasks', icon: null }] }]} onClose={onClose} onCreate={() => {}} />);
  await flush();
  const input = document.querySelector('[aria-label="Search tasks, spaces and pages"]');
  act(() => type(input, 'ACC-142'));
  await flush(250);
  expect(h.search).toHaveBeenCalledWith('ACC-142');
  expect(document.body.textContent).toContain('VAT return');
  expect(document.body.textContent).toContain('ACC-142');
  await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(onClose).toHaveBeenCalled();
  expect(at.pathname + at.search).toBe('/dashboard?task=142');
});

test('the summary shows the last 7 days and where the work stands', async () => {
  h.apiGet = jest.fn(async () => ({ data: {
    counts: { total: 10, todo: 4, in_progress: 3, pending: 1, done: 2, done_7d: 2, created_7d: 5, updated_7d: 6, due_7d: 3, overdue: 1, high: 2, medium: 5, low: 1 },
    types: [{ type: 'bug', count: 3 }], workload: [{ id: 12, name: 'Asha', open: 4, overdue: 1, done_30d: 2 }],
    activity: [{ id: 1, activity: 'Task Created', task_details: 'VAT', user_name: 'Asha', created_at: new Date().toISOString() }],
  } }));
  await render(<SpaceSummary teamId={7} onGo={() => {}} />);
  await flush();
  expect(h.apiGet).toHaveBeenCalledWith('/teams/7/summary');
  ['2 completed', '6 updated', '5 created', '3 due soon', '1 overdue', 'Status overview', 'Asha', 'Bug'].forEach((t) => expect(c.textContent).toContain(t));
});

test('a new company picks its kind of work once, or skips', async () => {
  h.setWorkType = jest.fn(async () => ({ data: { labels: [{ id: 1 }] } }));
  const onDone = jest.fn();
  await render(<WorkTypePicker onDone={onDone} />);
  expect(document.body.textContent).toContain('What kind of work does your team do?');
  await act(async () => [...document.querySelectorAll('[role="radio"]')].find((b) => b.textContent.includes('Accounting')).click());
  await act(async () => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Continue').click());
  expect(h.setWorkType).toHaveBeenCalledWith('accounting');
  expect(onDone).toHaveBeenCalled();
});

test('no emoji on the space summary or the kind-of-work picker: line icons only', async () => {
  h.apiGet = jest.fn(async () => ({ data: { counts: { done_7d: 3, updated_7d: 2, created_7d: 1, due_7d: 4, overdue: 0, total: 6, todo: 2, in_progress: 1, pending: 0, done: 3, high: 1, medium: 4, low: 1 }, types: [], workload: [], activity: [] } }));
  await render(<SpaceSummary teamId={7} onGo={() => {}} />);
  await flush();
  expect(document.body.textContent).toContain('3 completed');
  expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  expect(document.body.querySelectorAll('svg').length).toBeGreaterThanOrEqual(4);
  act(() => r.unmount()); r = createRoot(c);
  await render(<WorkTypePicker onDone={() => {}} />);
  expect(document.body.textContent).toContain('Accounting');
  expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
});
