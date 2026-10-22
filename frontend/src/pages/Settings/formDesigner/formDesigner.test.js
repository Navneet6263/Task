import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import FormDesignerSection from '.';
import CreateTaskModal from '../../Dashboard/CreateTaskModal';
import { announceTaskFormChange } from '../../../components/taskForm/useTaskFormLayout';

const h = {};
jest.mock('../../../services/api', () => ({
  taskForm: { get: (...a) => h.get(...a), save: (...a) => h.save(...a), reset: () => Promise.resolve({ data: {} }) },
  clients: { list: () => Promise.resolve({ data: { pick_only: true, can_manage: false, clients: [{ id: 1, name: 'Riverside Motors', is_active: true }] } }) },
  tasks: { getFormOptions: () => Promise.resolve({ data: { task_types: [], products: [], categories: [] } }) },
}));

// Same shape the server sends (subset of the real client job template).
const clientJob = {
  template: 'client_job', name: 'Client job sheet',
  settings: { time_tracking: true, edit_window_days: 7, title_pattern: '{client_name} · {job_type}', submit_label: 'Submit' },
  fields: [
    { key: 'client_name', kind: 'core', type: 'client', label: 'Client', required: true, hidden: false, width: 'full', help: '' },
    { key: 'job_type', kind: 'custom', type: 'dropdown', label: 'Job Type', required: true, hidden: false, width: 'half', help: '', options: ['Payroll', 'Audit'] },
    { key: 'date_worked', kind: 'custom', type: 'date', label: 'Date worked', required: true, hidden: false, width: 'half', help: '', default: 'today' },
    { key: 'hours', kind: 'core', type: 'hours', label: 'Hours worked', required: true, hidden: false, width: 'half', help: '' },
    { key: 'title', kind: 'core', type: 'text', label: 'Task title', required: false, hidden: true, width: 'full', help: '' },
  ],
};
const templates = [{ key: 'client_job', name: 'Client job sheet', description: 'For service teams', layout: clientJob }];
let c, r;
const type = (el, v) => { const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); };
const click = async (text) => act(async () => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === text) || [...document.querySelectorAll('button')].find((x) => x.textContent.includes(text)); if (!b) throw Error(`missing ${text}`); b.click(); });
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true; localStorage.clear();
  localStorage.setItem('user', JSON.stringify({ id: 5, role: 'person', name: 'Asha' }));
  c = document.createElement('div'); document.body.append(c); r = createRoot(c);
});
afterEach(() => { act(() => r.unmount()); c.remove(); announceTaskFormChange(null); });

test('manager picks a template, renames a question, adds one and saves', async () => {
  h.get = async () => ({ data: { layout: null, version: 0, can_edit: true, templates } });
  h.save = jest.fn(async (layout) => ({ data: { layout, version: 1 } }));
  await act(async () => r.render(<FormDesignerSection />));
  expect(c.textContent).toContain('Classic form in use');
  await click('Use this template');
  expect(c.textContent).toContain('Not live yet');
  await act(async () => [...c.querySelectorAll('[aria-label^="Edit "]')].find((x) => x.textContent.includes('Job Type')).click());
  act(() => type(c.querySelector('[aria-label="Question"]'), 'Service'));
  await click('Add question');
  await click('Number');
  await click('Save and use this form');
  const saved = h.save.mock.calls[0][0];
  expect(saved.fields.find((f) => f.key === 'job_type').label).toBe('Service');
  expect(saved.fields.some((f) => f.type === 'number' && f.kind === 'custom')).toBe(true);
  expect(c.textContent).toContain('Live:');
});

test('the create task window uses the designed form and blocks missing answers', async () => {
  h.get = async () => ({ data: { layout: clientJob, version: 1, can_edit: false, templates } });
  const create = jest.fn();
  let form = { title: '', description: '', custom_fields: {}, hours: '', client_name: '', issue_type: 'task', priority: 'MEDIUM' };
  const update = (k, v) => { form = { ...form, [k]: v }; draw(); };
  const draw = () => r.render(<CreateTaskModal showTaskModal setShowTaskModal={() => {}} taskForm={form} updateTaskFormField={update} handleReferenceImageChange={() => {}}
    handleCreateTask={create} selectedTeam={{ id: 1, name: 'Ops' }} members={[{ id: 5, name: 'Asha' }]} availableTaskOptions={{ task_types: [], products: [], categories: [] }} createTaskCategories={[]} />);
  await act(async () => draw());
  await act(async () => {});
  expect(document.body.textContent).toContain('Client job sheet');
  const clientSelect = document.querySelector('#compose-client_name');
  expect(clientSelect.tagName).toBe('SELECT');
  expect(form.custom_fields.date_worked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await act(async () => document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(create).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('Client is required');
  act(() => { type(document.querySelector('#compose-client_name'), 'Riverside Motors'); });
  act(() => { type(document.querySelector('#compose-job_type'), 'Payroll'); });
  act(() => { type(document.querySelector('#compose-hours'), '2.5'); });
  await act(async () => document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(create).toHaveBeenCalled();
  expect(form).toMatchObject({ client_name: 'Riverside Motors', hours: '2.5', custom_fields: { job_type: 'Payroll' } });
});
