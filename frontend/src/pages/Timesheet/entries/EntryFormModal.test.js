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
  form: { name: 'Timesheet', fields: [
    ['task_id', 'task', false], ['client_id', 'client', true], ['job_type', 'dropdown', true], ['date_worked', 'date', true],
    ['agent_id', 'person', true], ['description', 'long_text', false], ['hours', 'hours', true],
  ].map(([key, type, required]) => ({ key, kind: 'core', type, label: key, required, hidden: false, ...(type === 'dropdown' ? { options: ['Payroll'] } : {}) })) },
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

const names = () => [...document.querySelectorAll('#ts-agent_id option')].map((o) => o.textContent);

test('an employee always sees their own name in Done by and cannot change it', async () => {
  const employee = { ...config, role: 'person', user_id: 12, team_ids: [12], permissions: { log_for_others: false, manage_clients: false } };
  await act(async () => r.render(<EntryFormModal config={employee} onClose={() => {}} onSaved={() => {}} />));
  const select = document.querySelector('#ts-agent_id');
  expect(select.value).toBe('12');
  expect(select.selectedOptions[0].textContent).toBe('Asha');
  expect(select.disabled).toBe(true);
  expect(document.body.textContent).toContain('Your entries are logged under your own name.');
  expect(document.body.textContent).not.toContain('Show everyone');
});

test('a manager picks Done by from their own team, with everyone one click away', async () => {
  const manager = { ...config, role: 'manager', team_ids: [10, 12], users: [...config.users, { id: 13, name: 'Other Team' }] };
  await act(async () => r.render(<EntryFormModal config={manager} onClose={() => {}} onSaved={() => {}} />));
  expect(names()).toEqual(['Select', 'Manager', 'Asha']);
  expect(document.body.textContent).toContain('Showing your team (2 people).');
  await act(async () => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Show everyone').click());
  expect(names()).toEqual(['Select', 'Manager', 'Asha', 'Other Team']);
});

test('picking an agent shows only its clients, and picking a client fills in its agent', async () => {
  const withAgents = {
    ...config,
    agents: [{ id: 3, name: 'ABR Accountants' }, { id: 4, name: 'Alpha Accountants' }],
    clients: [{ id: 4, name: 'ABC One Ltd', agent_id: 3 }, { id: 5, name: 'Northwind', agent_id: 4 }, { id: 6, name: 'Walk-in', agent_id: null }],
    form: { ...config.form, fields: [{ key: 'agent_firm_id', kind: 'core', type: 'agent', label: 'Agent', required: false, hidden: false }, ...config.form.fields] },
  };
  await act(async () => r.render(<EntryFormModal config={withAgents} onClose={() => {}} onSaved={() => {}} />));
  const pick = async (id, value) => act(async () => { const el = document.querySelector(id); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await pick('#ts-agent_firm_id', '3');
  expect([...document.querySelectorAll('#ts-client_id option')].map((o) => o.textContent)).toEqual(['-Select-', 'ABC One Ltd']);
  await pick('#ts-agent_firm_id', '');
  await pick('#ts-client_id', '5');
  expect(document.querySelector('#ts-agent_firm_id').value).toBe('4');
});
