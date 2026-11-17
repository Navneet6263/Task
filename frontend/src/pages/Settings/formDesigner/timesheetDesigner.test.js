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
const choose = async (sel, text, option = text) => {
  const el = document.querySelector(sel);
  act(() => { el.focus(); el.dispatchEvent(new FocusEvent('focus')); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, text); el.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent.includes(option)).click());
};

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
  await choose('#ts-client_id', 'Riv', 'Riverside');
  act(() => type(document.querySelector('#ts-hours'), '2'));
  await act(async () => button('Submit').click());
  expect(h.create).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('This field is required.');
  act(() => type(document.querySelector('#ts-ticket'), 'T-77'));
  await act(async () => button('Submit').click());
  expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ client_id: '4', hours: '2', period_ended: '', custom_fields: { ticket: 'T-77' } }));
});

test('admins change the form from the timesheet window itself, and what they typed stays', async () => {
  h.form = async () => ({ data: { layout: original, version: 0, saved: false, can_edit: true } });
  h.saveForm = jest.fn(async (layout) => ({ data: { layout: { ...layout, version: 1 }, version: 1, saved: true } }));
  const onFormChanged = jest.fn();
  const config = { today: '2026-10-22', user_id: 10, permissions: { log_for_others: true, manage_clients: true, edit_form: true }, users: [{ id: 10, name: 'Me' }], clients: [{ id: 4, name: 'Riverside' }], form: original };
  await act(async () => r.render(<EntryFormModal config={config} onClose={() => {}} onSaved={() => {}} onFormChanged={onFormChanged} />));
  act(() => type(document.querySelector('#ts-hours'), '2'));
  expect(document.querySelector('#ts-period_ended')).toBeTruthy();
  await act(async () => button('Edit form').click());
  expect(document.body.textContent).toContain('Changes apply to everyone in the company.');
  await act(async () => document.querySelector('[aria-label="Edit Period Ended"]').click());
  await act(async () => document.querySelector('[aria-label="Hide from the form"]').click());
  await act(async () => button('Save for everyone').click());
  expect(h.saveForm.mock.calls[0][0].fields.find((f) => f.key === 'period_ended').hidden).toBe(true);
  expect(onFormChanged).toHaveBeenCalled();
  // Back on the form at once, without the hidden field, and the hours typed earlier are still there.
  expect(document.querySelector('#ts-period_ended')).toBeNull();
  expect(document.querySelector('#ts-hours').value).toBe('2');
});

test('members and managers do not get the Edit form button (admins only)', async () => {
  const config = { today: '2026-10-22', user_id: 12, permissions: { log_for_others: false, manage_clients: false }, users: [{ id: 12, name: 'Asha' }], clients: [], form: original };
  await act(async () => r.render(<EntryFormModal config={config} onClose={() => {}} onSaved={() => {}} />));
  expect(button('Edit form')).toBeUndefined();
  const manager = { ...config, permissions: { log_for_others: false, manage_clients: true, edit_form: false } };
  await act(async () => r.render(<EntryFormModal config={manager} onClose={() => {}} onSaved={() => {}} />));
  expect(button('Edit form')).toBeUndefined();
});

// Accountrust: some fields do not apply to some Job Types.
const ruledForm = { ...original, fields: [
  core('client_id', 'client', { label: 'Client', locked: true }),
  core('job_type', 'dropdown', { label: 'Job Type', options: ['Bookkeeping & VAT Return', 'Training'] }),
  core('date_worked', 'date', { label: 'Date worked', locked: true }),
  core('registration_status', 'dropdown', { label: 'Registration Status', options: ['Registered', 'Not Applicable'], skip_for: ['Training'] }),
  core('count_number', 'number', { label: 'Count number', skip_for: ['Training'] }),
  core('hours', 'hours', { label: 'Hours worked', locked: true }),
] };

test('the form designer has a Job Type table: tick a box and that field is not needed for that job type', async () => {
  h.form = async () => ({ data: { layout: { ...ruledForm, version: 2 }, version: 2, saved: true, can_edit: true } });
  h.saveForm = jest.fn(async (layout) => ({ data: { layout: { ...layout, version: 3 }, version: 3, saved: true } }));
  await act(async () => r.render(<TimesheetFormDesigner />));
  expect(c.textContent).toContain('Fields not needed for a job type');
  const box = (label) => c.querySelector(`[aria-label="${label}"]`);
  expect(box('Registration Status not needed for Training').checked).toBe(true);
  expect(box('Registration Status not needed for Bookkeeping & VAT Return').checked).toBe(false);
  // Client can be not needed (e.g. Leave); date, hours and Job Type itself are not in the table.
  expect(box('Client not needed for Training')).toBeTruthy();
  expect(box('Date worked not needed for Training')).toBeNull();
  expect(box('Hours worked not needed for Training')).toBeNull();
  await act(async () => box('Count number not needed for Bookkeeping & VAT Return').click());
  await act(async () => box('Registration Status not needed for Training').click());
  // Greyed out by default; a company can choose to hide them instead.
  expect(button('Greyed out').getAttribute('aria-pressed')).toBe('true');
  await act(async () => button('Hidden').click());
  await act(async () => button('Save timesheet form').click());
  expect(h.saveForm.mock.calls[0][0].skip_style).toBe('hide');
  const saved = h.saveForm.mock.calls[0][0].fields;
  expect(saved.find((f) => f.key === 'count_number').skip_for).toEqual(['Training', 'Bookkeeping & VAT Return']);
  expect(saved.find((f) => f.key === 'registration_status').skip_for).toBeUndefined();
});

test('choosing a Job Type greys out the fields it does not need; they are not required and go empty', async () => {
  h.create = jest.fn(async () => ({ data: { id: 5 } }));
  const config = { today: '2026-11-14', user_id: 10, permissions: { log_for_others: true }, users: [{ id: 10, name: 'Me' }], clients: [{ id: 4, name: 'Riverside' }], form: ruledForm };
  await act(async () => r.render(<EntryFormModal config={config} onClose={() => {}} onSaved={() => {}} />));
  const pick = (id, value) => act(() => { const el = document.querySelector(id); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await choose('#ts-client_id', 'Riv', 'Riverside');
  pick('#ts-registration_status', 'Registered');
  act(() => type(document.querySelector('#ts-count_number'), '12'));
  act(() => type(document.querySelector('#ts-hours'), '2'));
  pick('#ts-job_type', 'Training');
  // Greyed out, emptied, and the reason is shown.
  expect(document.querySelector('#ts-registration_status').matches(':disabled')).toBe(true);
  expect(document.querySelector('#ts-registration_status').value).toBe('');
  expect(document.querySelector('#ts-count_number').value).toBe('');
  expect(document.body.textContent).toContain('Not needed for Training.');
  await act(async () => button('Submit').click());
  expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ job_type: 'Training', registration_status: '', count_number: '', hours: '2' }));
  // Another Job Type needs them again.
  pick('#ts-job_type', 'Bookkeeping & VAT Return');
  expect(document.querySelector('#ts-registration_status').matches(':disabled')).toBe(false);
});

test('a form set to hide (Accountrust): Leave hides the client and others it does not need; sent without a client', async () => {
  h.create = jest.fn(async () => ({ data: { id: 6 } }));
  const leaveForm = { ...ruledForm, skip_style: 'hide', fields: ruledForm.fields.map((f) => {
    if (f.key === 'job_type') return { ...f, options: [...f.options, 'Leave'] };
    if (['client_id', 'registration_status', 'count_number'].includes(f.key)) return { ...f, skip_for: [...(f.skip_for || []), 'Leave'] };
    return f;
  }) };
  const config = { today: '2026-11-14', user_id: 10, permissions: { log_for_others: true }, users: [{ id: 10, name: 'Me' }], clients: [{ id: 4, name: 'Riverside' }], form: leaveForm };
  await act(async () => r.render(<EntryFormModal config={config} onClose={() => {}} onSaved={() => {}} />));
  await choose('#ts-client_id', 'Riv', 'Riverside');
  act(() => { const el = document.querySelector('#ts-job_type'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, 'Leave'); el.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(document.querySelector('#ts-client_id')).toBeNull();
  expect(document.body.textContent).toContain('Not needed for Leave, so not shown: Client, Registration Status, Count number.');
  act(() => type(document.querySelector('[aria-label="Hours worked: minutes"]'), '30'));
  act(() => type(document.querySelector('#ts-hours'), '7'));
  await act(async () => button('Submit').click());
  expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ job_type: 'Leave', client_id: '', hours: '7.5' }));
});
