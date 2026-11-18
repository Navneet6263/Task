import { ruleFields, skippedFor } from './JobTypeRules';

const field = (key, extra = {}) => ({ key, kind: 'core', label: key, hidden: false, ...extra });

test('"Done by" is never offered as "not needed", and an older rule for it is ignored', () => {
  const layout = { fields: [field('client_id', { locked: true }), field('job_type'), field('agent_id', { skip_for: ['Payroll'] }), field('count_type', { skip_for: ['Payroll'] })] };
  expect(ruleFields(layout).map((f) => f.key)).toEqual(['client_id', 'count_type']);
  expect([...skippedFor(layout, 'payroll')]).toEqual(['count_type']);
});
