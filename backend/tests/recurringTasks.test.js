const test = require('node:test');
const assert = require('node:assert/strict');
const { nextDueDate } = require('../src/services/recurringTasks');
test('recurring dates advance daily and weekly across month boundaries', () => {
  assert.equal(nextDueDate('2026-09-30', 'DAILY'), '2026-10-01');
  assert.equal(nextDueDate('2026-12-28', 'WEEKLY'), '2027-01-04');
});
test('monthly recurrence clamps to the last valid day of the next month', () => {
  assert.equal(nextDueDate('2026-01-31', 'MONTHLY'), '2026-02-28');
  assert.equal(nextDueDate('2028-01-31', 'MONTHLY'), '2028-02-29');
  assert.throws(() => nextDueDate('bad-date', 'DAILY'), /Invalid/);
});
