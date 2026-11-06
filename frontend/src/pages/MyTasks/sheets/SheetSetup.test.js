import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import SheetSetup from './SheetSetup';

const h = {};
jest.mock('../../../services/api', () => ({
  taskSheets: { preview: (...a) => h.preview(...a), create: (...a) => h.create(...a), update: (...a) => h.update(...a) },
  teams: { getAll: () => Promise.resolve({ data: [{ id: 7, name: 'Payroll' }] }) },
}));

const fields = [
  { key: 'title', label: 'Task title', always: true }, { key: 'due_date', label: 'Due date' }, { key: 'client_name', label: 'Client' },
];
let c, r;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; c = document.createElement('div'); document.body.append(c); r = createRoot(c); });
afterEach(() => { act(() => r.unmount()); c.remove(); });
const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent === text);
const type = (el, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); };

test('link a sheet: read it, match its own columns, choose what must be filled, and start from new rows', async () => {
  h.preview = jest.fn(async () => ({ data: { headers: ['Kaam', 'Deadline', 'Party'], rows: 3, sample: [{ number: 2, values: { Kaam: 'GST', Deadline: '05/11/2026', Party: 'Acme' } }], suggested: { due_date: 'Deadline' } } }));
  h.create = jest.fn(async () => ({ data: { id: 1, result: { created: 0 } } }));
  const onSaved = jest.fn();
  await act(async () => r.render(<SheetSetup fields={fields} onClose={() => {}} onSaved={onSaved} />));
  act(() => type(document.querySelector('[role="dialog"] input'), 'https://docs.google.com/spreadsheets/d/abc/edit'));
  await act(async () => button('Read sheet').click());
  expect(h.preview).toHaveBeenCalledWith('https://docs.google.com/spreadsheets/d/abc/edit');
  expect(button('Next').disabled).toBe(true);

  const pick = async (label, value) => act(async () => { const el = document.querySelector(`[aria-label="Column for ${label}"]`); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await pick('Task title', 'Kaam');
  await pick('Client', 'Party');
  expect(document.body.textContent).toContain('GST');
  await act(async () => document.querySelector('[aria-label="Client must be filled"]').click());
  await act(async () => button('Next').click());
  await act(async () => button('Link sheet').click());
  expect(h.create).toHaveBeenCalledWith(expect.objectContaining({
    team_id: 7, include_existing: false, mapping: { due_date: 'Deadline', title: 'Kaam', client_name: 'Party' }, required: ['client_name'],
  }));
  expect(onSaved).toHaveBeenCalled();
});
