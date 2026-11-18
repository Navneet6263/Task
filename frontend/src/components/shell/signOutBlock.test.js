import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import SignOutBlock, { hm } from './SignOutBlock';
import SignOutRuleCard from '../../pages/Timesheet/setup/SignOutRuleCard';

const h = {};
jest.mock('react-router-dom', () => ({ useNavigate: () => (...a) => h.navigate(...a) }));
jest.mock('../../services/api', () => ({
  timesheet: {
    signOutRule: (...a) => h.signOutRule(...a), saveSignOutRule: (...a) => h.save(...a),
    addHoliday: (...a) => h.addHoliday(...a), removeHoliday: async () => ({ data: {} }),
  },
}));
jest.mock('../../services/feedback', () => ({ notify: () => {} }));

let c, r;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; c = document.createElement('div'); document.body.append(c); r = createRoot(c); });
afterEach(() => { act(() => r.unmount()); c.remove(); });
const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text);

test('hours read as hours and minutes', () => {
  expect([hm(5.33), hm(0.5), hm(8), hm(0)]).toEqual(['5 h 20 min', '30 min', '8 h', '0 h']);
});

test('the log-out window says what is missing and opens a new timesheet entry', async () => {
  h.navigate = jest.fn();
  const onClose = jest.fn();
  await act(async () => r.render(<SignOutBlock info={{ allowed: false, required: 8, hours: 5.33, missing: 2.67, draft_hours: 2 }} onClose={onClose} />));
  const text = document.body.textContent;
  expect(text).toContain('Finish today\'s timesheet first');
  expect(text).toContain('5 h 20 min');
  expect(text).toContain('2 h 40 min');
  expect(text).toContain('Submit them and they count.');
  await act(async () => button('Add Timesheet').click());
  expect(onClose).toHaveBeenCalled();
  expect(h.navigate).toHaveBeenCalledWith('/timesheet?add=1');
});

test('an admin turns the rule on with hours, working days and holidays', async () => {
  const rule = { enabled: false, min_daily_hours: null, working_days: [1, 2, 3, 4, 5], holidays: [] };
  h.signOutRule = jest.fn(async () => ({ data: rule }));
  h.save = jest.fn(async (data) => ({ data: { ...rule, enabled: data.enabled, min_daily_hours: data.min_daily_hours } }));
  h.addHoliday = jest.fn(async () => ({ data: { ...rule, enabled: true, min_daily_hours: 8, holidays: [{ id: 1, date: '2026-12-25', name: 'Christmas' }] } }));
  await act(async () => r.render(<SignOutRuleCard />));
  expect(c.querySelector('#ts-min-hours')).toBeNull(); // off: nothing to fill
  await act(async () => c.querySelector('[role="switch"]').click());
  expect(c.querySelector('#ts-min-hours').value).toBe('8');
  // Saturday and Sunday are off by default.
  expect(button('Sat').getAttribute('aria-pressed')).toBe('false');
  expect(button('Mon').getAttribute('aria-pressed')).toBe('true');
  await act(async () => button('Save').click());
  expect(h.save).toHaveBeenCalledWith({ enabled: true, min_daily_hours: 8, working_days: [1, 2, 3, 4, 5] });

  const date = c.querySelector('input[aria-label="Holiday date"]');
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(date, '2026-12-25'); date.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => button('Add holiday').click());
  expect(h.addHoliday).toHaveBeenCalledWith({ date: '2026-12-25', name: '' });
  expect(c.textContent).toContain('Christmas');
});
