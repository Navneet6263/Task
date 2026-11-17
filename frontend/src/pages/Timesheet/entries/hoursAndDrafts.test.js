import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import EntryFormModal from './EntryFormModal';
import { splitHours, toHours } from './HoursInput';
import { parseHours } from '../../BulkUpload/entrySheet';

const h = {};
jest.mock('../../../services/api', () => ({
  timesheet: { tasks: async () => ({ data: [] }), update: (...a) => h.update(...a), submit: (...a) => h.submit(...a) },
}));

const config = {
  today: '2026-11-17', user_id: 12, permissions: { log_for_others: false, manage_clients: false },
  users: [{ id: 12, name: 'Asha' }], clients: [{ id: 4, name: 'Riverside' }],
  form: { name: 'Timesheet', fields: [['client_id', 'client', true], ['job_type', 'dropdown', true], ['date_worked', 'date', true], ['hours', 'hours', true]]
    .map(([key, type, required]) => ({ key, kind: 'core', type, label: key, required, hidden: false, ...(type === 'dropdown' ? { options: ['Payroll'] } : {}) })) },
};
let c, r;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; c = document.createElement('div'); document.body.append(c); r = createRoot(c); });
afterEach(() => { act(() => r.unmount()); c.remove(); });
const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text);

test('time can be given in hours and minutes; it is stored as hours with 2 decimals', () => {
  expect([toHours('', '20'), toHours('1', '30'), toHours('2', ''), toHours('', ''), toHours('0', '0')]).toEqual(['0.33', '1.5', '2', '', '']);
  expect([splitHours('0.33'), splitHours('1.5'), splitHours('2'), splitHours('')]).toEqual([{ h: '0', m: '20' }, { h: '1', m: '30' }, { h: '2', m: '' }, { h: '', m: '' }]);
  // Sheets may say it either way too.
  expect(['0:20', '20 min', '1h 30m', '45m', '2.5', '2:30', 'soon'].map(parseHours)).toEqual([0.33, 0.33, 1.5, 0.75, 2.5, 2.5, NaN]);
});

test('an employee can open their own draft, change it, and save it again or submit it', async () => {
  h.update = jest.fn(async () => ({}));
  h.submit = jest.fn(async () => ({}));
  const onSaved = jest.fn();
  const draft = { id: 31, status: 'DRAFT', version: 2, client_id: 4, client_name: 'Riverside', job_type: '', date_worked: '2026-11-17', agent_id: 12 };
  await act(async () => r.render(<EntryFormModal config={config} entry={draft} onClose={() => {}} onSaved={onSaved} />));
  // Saving a draft again needs only the client, like a new draft.
  await act(async () => button('Save draft').click());
  expect(h.update).toHaveBeenCalledWith(31, expect.objectContaining({ version: 2 }));
  expect(h.submit).not.toHaveBeenCalled();
  // Submitting asks for everything first.
  await act(async () => button('Save and submit').click());
  expect(document.body.textContent).toContain('This field is required.');
  expect(h.update).toHaveBeenCalledTimes(1);
  act(() => { const el = document.querySelector('#ts-job_type'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, 'Payroll'); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await act(async () => button('Save and submit').click());
  expect(h.update).toHaveBeenCalledTimes(2);
  expect(h.submit).toHaveBeenCalledWith(31);
  expect(onSaved).toHaveBeenLastCalledWith(31, 'edit');
});
