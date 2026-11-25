import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import TaskReminders, { tomorrowTen, shortWhen } from './TaskReminders';

const h = {};
jest.mock('../../services/api', () => ({
  calendar: { taskEvents: (...a) => h.taskEvents(...a), members: (...a) => h.members(...a), create: (...a) => h.create(...a), update: jest.fn() },
  taskExtras: { search: async () => ({ data: [] }), meta: async () => ({ data: { prefix: 'ACC', labels: [] } }) },
}));

let c, r;
const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem('user', JSON.stringify({ id: 5, name: 'Asha' }));
  c = document.createElement('div'); document.body.append(c); r = createRoot(c);
});
afterEach(() => { act(() => r.unmount()); c.remove(); localStorage.clear(); });

const task = { id: 40, title: 'VAT return for Acme' };

test('the first suggested time is tomorrow at 10:00, and times read plainly', () => {
  expect(tomorrowTen(new Date(2026, 11, 31, 18, 5))).toBe('2027-01-01T10:00');
  expect(shortWhen({ start_at: '2026-11-24T10:00', all_day: false })).toBe('Tue, 24 Nov, 10:00');
});

test('lists this task\'s reminders, and Set reminder opens the calendar form ready for this task', async () => {
  h.taskEvents = jest.fn(async () => ({ data: [
    { id: 1, title: 'Call Acme', event_type: 'REMINDER', start_at: '2099-01-02T10:00', end_at: '2099-01-02T10:15', all_day: false, attendees: [] },
    { id: 2, title: 'Old one', event_type: 'REMINDER', start_at: '2020-01-02T10:00', end_at: '2020-01-02T10:15', all_day: false, attendees: [] },
  ] }));
  h.members = jest.fn(async () => ({ data: [{ id: 5, name: 'Asha' }, { id: 9, name: 'Ravi' }] }));
  h.create = jest.fn(async () => ({ data: { id: 3 } }));
  const onOpenChange = jest.fn();
  await act(async () => r.render(<MemoryRouter><TaskReminders task={task} onOpenChange={onOpenChange} /></MemoryRouter>));
  expect(h.taskEvents).toHaveBeenCalledWith(40);
  expect(c.textContent).toContain('Call Acme');
  expect(c.textContent).toContain('1 earlier');

  await act(async () => { button('Set reminder').click(); });
  expect(onOpenChange).toHaveBeenLastCalledWith(true);
  expect(document.body.textContent).toContain('VAT return for Acme');
  await act(async () => { button('Save').click(); });
  const payload = h.create.mock.calls[0][0];
  expect(payload).toMatchObject({ event_type: 'REMINDER', title: 'VAT return for Acme', task_id: 40, reminder_minutes: 0, start_at: tomorrowTen() });
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
  expect(h.taskEvents).toHaveBeenCalledTimes(2);
});
