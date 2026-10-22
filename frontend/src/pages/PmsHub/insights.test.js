import { headline, highlights, standing, versus } from './insights';

const base = { days: 90, me: { completed: 12, medianDays: 1.5, onTimeRate: 92, highPriority: 4 }, team: { medianDays: 3, completed: 8, onTimeRate: 70 }, rank: { completed: 75, speed: 80, onTime: 70 }, now: { open: 4, overdue: 0 } };

test('versus is positive when you are better, including when fewer days is better', () => {
  expect(versus(12, 8)).toBe(50);
  expect(versus(1.5, 3, true)).toBe(50);
  expect(versus(null, 3)).toBeNull();
});

test('headline states output, team comparison and typical time', () => {
  expect(headline(base)).toBe('You completed 12 tasks in the last 3 months, more than 75% of your teammates, and a typical task takes you 1.5 days.');
  expect(headline({ ...base, me: { ...base.me, completed: 0 } })).toMatch(/not completed any tasks/);
});

test('highlights list real strengths and practical suggestions', () => {
  const good = highlights(base);
  expect(good.strengths).toHaveLength(3);
  expect(good.tips).toHaveLength(0);
  const tough = highlights({ ...base, me: { ...base.me, onTimeRate: 50 }, rank: { completed: 20, speed: 20, onTime: 20 }, now: { open: 20, overdue: 3 } });
  expect(tough.tips[0]).toMatch(/3 overdue tasks/);
  expect(tough.tips.length).toBe(3);
});

test('standing labels stay encouraging', () => {
  expect(standing(85).label).toBe('Top performer');
  expect(standing(30).label).toBe('Room to grow');
  expect(standing(null)).toBeNull();
});
