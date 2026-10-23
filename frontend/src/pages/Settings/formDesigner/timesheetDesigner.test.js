import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import TimesheetFormDesigner from './TimesheetFormDesigner';
import EntryFormModal from '../../Timesheet/entries/EntryFormModal';

const h = {};
jest.mock('../../../services/api', () => ({
  timesheet: { form: (...a) => h.form(...a), saveForm: (...a) => h.saveForm(...a), resetForm: () => Promise.resolve({ data: {} }), create: (...a) => h.create(...a), tasks: () => Promise.resolve({ data: [] }) },
}));

const core = (key, type, extra = {}) => ({ key, kind: 'core', type, label: key, required: true, hidden: false, width: 'full', help: '', ...extra });
const original = { name: 'Timesheet', version: 0, is_default: true, fields: [
  core('client_id', 'client', { label: 'Client', locked: true }),
  core('job_type', 'dropdown', { label: 'Job Type', types: ['dropdown', 'text'], options: ['Payroll'] }),
  core('date_worked', 'date', { label: 'Date worked', locked: true }),
  core('period_ended', 'date', { label: 'Period Ended' }),
  core('hours', 'hours', { label: 'Hours worked', locked: true }),
] };
let c, r;
const button = (text) => { const all = [...document.querySelectorAll('button')]; return all.find((b) => b.textContent.trim() === text) || all.find((b) => b.textContent.includes(text)); };
const type = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; c = document.createElement('div'); document.body.append(c); r = createRoot(c); });
afterEach(() => { act(() => r.unmount()); c.remove(); });

test('managers rename a field, make one optional, add a question and save', async () => {
  h.form = async () => ({ data: { layout: original, version: 0, saved: false, can_edit: true } });
  h.saveForm = jest.fn(async (layout) => ({ data: { layout: { ...layout, version: 1 }, version: 1, saved: true } }));
  await act(async () => r.render(<TimesheetFormDesigner />));
  expect(c.textContent).toContain('Original form in use');

  await act(async () => c.querySelector('[aria-label="Edit Client"]').click());
  act(() => type(c.querySelector('[aria-label="Question"]'), 'Customer'));
  expect(c.querySelector('[aria-label="Hide from the form"]')).toBeNull();

  await act(async () => c.querySelector('[aria-label="Edit Period Ended"]').click());
  await act(async () => c.querySelector('[role="switch"][aria-label="Required"]').click());

  await act(async () => button('Add question').click());
  await act(async () => [...c.querySelectorAll('button')].find((b) => b.textContent.includes('Checkbox')).click());
  await act(async () => button('Save timesheet form').click());

  const saved = h.saveForm.mock.calls[0][0];
  expect(saved.fields.find((f) => f.key === 'client_id').label).toBe('Customer');
  expect(saved.fields.find((f) => f.key === 'period_ended').required).toBe(false);
  expect(saved.fields.some((f) => f.kind === 'custom' && f.type === 'checkbox')).toBe(true);
  expect(c.textContent).toContain('Customised form in use');
});

test('the timesheet form follows the saved layout: labels, optional fields, hidden fields and extra questions', async () => {
  h.create = jest.fn(async () => ({ data: { id: 5 } }));
  const form = { ...original, fields: [
    ...original.fields.map((f) => (f.key === 'period_ended' ? { ...f, required: false } : f.key === 'job_type' ? { ...f, hidden: true } : f.key === 'client_id' ? { ...f, label: 'Customer' } : f)),
    { key: 'ticket', kind: 'custom', type: 'text', label: 'Ticket number', required: true, hidden: false, help: '' },
  ] };
  const config = { today: '2026-10-22', user_id: 10, permissions: { log_for_others: true }, users: [{ id: 10, name: 'Me' }], clients: [{ id: 4, name: 'Riverside' }], form };
  await act(async () => r.render(<EntryFormModal config={config} onClose={() => {}} onSaved={() => {}} />));
  expect(document.body.textContent).toContain('Customer');
  expect(document.body.textContent).toContain('Ticket number');
  expect(document.querySelector('#ts-job_type')).toBeNull();
  await act(async () => { document.querySelector('#ts-client_id').value = '4'; document.querySelector('#ts-client_id').dispatchEvent(new Event('change', { bubbles: true })); });
  act(() => type(document.querySelector('#ts-hours'), '2'));
  await act(async () => button('Submit').click());
  expect(h.create).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('This field is required.');
  act(() => type(document.querySelector('#ts-ticket'), 'T-77'));
  await act(async () => button('Submit').click());
  expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ client_id: '4', hours: '2', period_ended: '', custom_fields: { ticket: 'T-77' } }));
});
