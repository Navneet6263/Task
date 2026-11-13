import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import PersonHoverCard from './PersonHoverCard';
import { endOf, nextSlot } from './MeetingModal';

const h = {};
jest.mock('../../services/api', () => ({ calendar: { create: (...a) => h.create(...a) } }));

const ashish = { id: 12, name: 'Ashish Kumar', email: 'ashish@x.com', team_role: 'Accountant', is_reporting_manager: false, current_tasks: 5, overdue_tasks: 1, done_30d: 7, avatar: null };
let c, r;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; jest.useFakeTimers(); c = document.createElement('div'); document.body.append(c); r = createRoot(c); });
afterEach(() => { act(() => r.unmount()); c.remove(); jest.useRealTimers(); });
const inBody = (text) => [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const type = (el, value) => act(() => { const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });

test('meeting times: the next half hour, and an end that can cross midnight', () => {
  expect(nextSlot(new Date(2026, 10, 14, 10, 12))).toEqual({ date: '2026-11-14', time: '10:30' });
  expect(nextSlot(new Date(2026, 10, 14, 10, 40))).toEqual({ date: '2026-11-14', time: '11:00' });
  expect(nextSlot(new Date(2026, 10, 14, 23, 45))).toEqual({ date: '2026-11-15', time: '00:00' });
  expect(endOf('2026-11-14', '10:30', 30)).toBe('2026-11-14T11:00');
  expect(endOf('2026-11-14', '23:45', 30)).toBe('2026-11-15T00:15');
});

test('resting on a face shows who they are; from there a meeting goes in the calendar with them invited', async () => {
  h.create = jest.fn(async () => ({ data: { id: 90, emailed: true } }));
  const seeWork = jest.fn();
  await act(async () => r.render(<MemoryRouter><PersonHoverCard person={ashish} actions={[{ label: 'See Ashish’s work', run: seeWork }]}><button type="button">face</button></PersonHoverCard></MemoryRouter>));
  const anchor = c.querySelector('button').parentElement;
  act(() => { anchor.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
  // Not at once: only after the pointer rests there.
  expect(document.body.textContent).not.toContain('ashish@x.com');
  act(() => { jest.advanceTimersByTime(400); });
  const card = document.body.querySelector('[role="dialog"][aria-label="About Ashish Kumar"]');
  expect(card.textContent).toContain('Accountant');
  expect(card.textContent).toContain('ashish@x.com');
  expect(card.textContent).toContain('Open5');
  expect(card.textContent).toContain('Late1');
  expect(card.textContent).toContain('Done 30 d7');
  await act(async () => inBody('Schedule a meeting with Ashish').click());
  // The small card is gone and stays gone while the meeting window is used.
  expect(document.body.querySelector('[aria-label="About Ashish Kumar"]')).toBeNull();
  const dialog = document.body.querySelector('[role="dialog"]');
  act(() => { dialog.querySelector('input').dispatchEvent(new FocusEvent('focusin', { bubbles: true })); dialog.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
  act(() => { jest.advanceTimersByTime(1000); });
  expect(document.body.querySelector('[aria-label="About Ashish Kumar"]')).toBeNull();
  expect(dialog.textContent).toContain('Schedule a meeting with Ashish');
  const field = (label) => [...dialog.querySelectorAll('label')].find((l) => l.textContent.startsWith(label)).querySelector('input, select, textarea');
  expect(field('Title').value).toBe('Meeting with Ashish');
  type(field('Date'), '2026-11-20');
  type(field('Start time'), '15:00');
  type(field('How long'), '45');
  type(field('Where or link'), 'https://teams.example/abc');
  type(field('Note for Ashish'), 'October payroll');
  await act(async () => inBody('Schedule meeting').click());
  expect(h.create).toHaveBeenCalledWith({
    title: 'Meeting with Ashish', description: 'October payroll', location: 'https://teams.example/abc', event_type: 'MEETING', all_day: false,
    start_at: '2026-11-20T15:00', end_at: '2026-11-20T15:45', reminder_minutes: 15, attendee_ids: [12],
  });
  expect(document.body.textContent).toContain('Ashish Kumar has been notified in GreenTask and will get an email invite');
});

test('no meeting button on your own face, and the extra action works', async () => {
  const seeWork = jest.fn();
  await act(async () => r.render(<MemoryRouter><PersonHoverCard person={ashish} canMeet={false} actions={[{ label: 'See Ashish’s work', run: seeWork }]}><button type="button">face</button></PersonHoverCard></MemoryRouter>));
  act(() => { c.querySelector('button').parentElement.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); });
  act(() => { jest.advanceTimersByTime(400); });
  expect(inBody('Schedule a meeting with Ashish')).toBeUndefined();
  await act(async () => inBody('See Ashish’s work').click());
  expect(seeWork).toHaveBeenCalled();
  expect(document.body.querySelector('[aria-label="About Ashish Kumar"]')).toBeNull();
});
