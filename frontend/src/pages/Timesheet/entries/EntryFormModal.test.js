import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import EntryFormModal from './EntryFormModal';

const h = {};
jest.mock('../../../services/api', () => ({
  timesheet: { tasks: (...a) => h.tasks(...a), create: (...a) => h.create(...a), createClient: () => Promise.resolve({ data: {} }), update: () => Promise.resolve({}) },
}));

const config = {
  today: '2026-10-22', user_id: 10, permissions: { log_for_others: true, manage_clients: false },
  options: {}, settings: { lock_days: 7 },
  users: [{ id: 10, name: 'Manager' }, { id: 12, name: 'Asha' }],
  clients: [{ id: 4, name: 'Riverside Motors' }, { id: 5, name: 'Acme' }],
};
const task = { id: 42, title: 'October payroll', client_name: 'riverside motors', status: 'TODO', assigned_to: 12, assigned_to_name: 'Asha' };
let c, r;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; c = document.createElement('div'); document.body.append(c); r = createRoot(c); });
afterEach(() => { act(() => r.unmount()); c.remove(); });

test('opening from a task picks it and fills client, agent and description', async () => {
  h.create = jest.fn(async () => ({ data: { id: 9 } }));
  await act(async () => r.render(<EntryFormModal config={config} initialTask={task} onClose={() => {}} onSaved={() => {}} />));
  expect(document.body.textContent).toContain('October payroll');
  expect(document.querySelector('#ts-client_id').value).toBe('4');
  expect(document.querySelector('#ts-agent_id').value).toBe('12');
  expect(document.querySelector('#ts-description').value).toBe('October payroll');
  await act(async () => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Save Draft').click());
  expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ task_id: '42', client_id: '4', mode: 'draft' }));
});

test('people can search their tasks and change the pick', async () => {
  h.tasks = jest.fn(async () => ({ data: [task] }));
  await act(async () => r.render(<EntryFormModal config={config} onClose={() => {}} onSaved={() => {}} />));
  await act(async () => { document.querySelector('#ts-task_id').focus(); document.querySelector('#ts-task_id').dispatchEvent(new FocusEvent('focusin', { bubbles: true })); });
  await act(async () => { await new Promise((res) => setTimeout(res, 300)); });
  expect(h.tasks).toHaveBeenCalled();
  await act(async () => document.querySelector('[role="option"]').click());
  expect(document.querySelector('#ts-client_id').value).toBe('4');
  await act(async () => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Change').click());
  expect(document.querySelector('#ts-task_id')).toBeTruthy();
});
