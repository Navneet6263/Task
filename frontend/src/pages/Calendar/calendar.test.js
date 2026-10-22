import { daysFor, durationMinutes, plusMinutes, shift, timeLabel, title, toKey, whenText } from './dates';
import { onDay, toItems, toneOf } from './items';

test('month view shows six full weeks starting on Sunday', () => {
  const days = daysFor('month', new Date(2026, 9, 19));
  expect(days).toHaveLength(42);
  expect(toKey(days[0])).toBe('2026-09-27');
  expect(days[0].getDay()).toBe(0);
  expect(toKey(days[41])).toBe('2026-11-07');
});

test('week and day navigation move by the right amount and titles read naturally', () => {
  const cursor = new Date(2026, 9, 19);
  expect(toKey(shift('week', cursor, 1))).toBe('2026-10-26');
  expect(toKey(shift('day', cursor, -1))).toBe('2026-10-18');
  expect(toKey(shift('month', cursor, 1))).toBe('2026-11-01');
  expect(title('week', cursor)).toBe('Oct 18 – 24, 2026');
  expect(title('month', cursor)).toBe('October 2026');
});

test('times use 12-hour labels and moving a start keeps the duration', () => {
  expect(timeLabel('2026-10-19T15:00')).toBe('3pm');
  expect(timeLabel('2026-10-19T09:30')).toBe('9:30am');
  expect(plusMinutes('2026-10-19T23:30', 60)).toBe('2026-10-20T00:30');
  expect(durationMinutes('2026-10-19T09:00', '2026-10-19T10:30')).toBe(90);
});

test('events and tasks become calendar items; overdue tasks are flagged', () => {
  const items = toItems({
    events: [{ id: 1, title: 'Standup', event_type: 'MEETING', start_at: '2026-10-19T09:30', end_at: '2026-10-19T09:45', all_day: false, my_response: 'DECLINED' }],
    tasks: [{ id: 7, title: 'Send invoice', status: 'TODO', due_date: '2000-01-01' }],
  });
  const [meeting, task] = items;
  expect(meeting.declined).toBe(true);
  expect(whenText(meeting)).toBe('Mon, Oct 19 · 9:30am – 9:45am');
  expect(task.allDay).toBe(true);
  expect(task.overdue).toBe(true);
  expect(toneOf(task).chip).toContain('danger');
  expect(onDay(meeting, '2026-10-19')).toBe(true);
  expect(onDay(meeting, '2026-10-20')).toBe(false);
});
