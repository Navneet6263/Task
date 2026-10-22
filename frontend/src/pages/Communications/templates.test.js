import { fillPlaceholders, placeholdersIn, taskTemplate } from './templates';
import { allValid } from './RecipientInput';

test('placeholders are found once each and filled everywhere they appear', () => {
  const body = 'Hi [Client Name],\nAbout [Topic]. Thanks [Client Name]';
  expect(placeholdersIn('Re: [Topic]', body)).toEqual(['[Topic]', '[Client Name]']);
  expect(fillPlaceholders(body, { '[Client Name]': 'Acme', '[Topic]': '' })).toBe('Hi Acme,\nAbout [Topic]. Thanks Acme');
});

test('a task draft uses the task details and leaves only unknown blanks', () => {
  const draft = taskTemplate({ id: 4, title: 'Fix login', issue_type: 'bug', status: 'IN_PROGRESS', priority: 'HIGH', client_name: 'Acme' });
  expect(draft.subject).toBe('Bug report update: Fix login');
  expect(draft.body).toContain('Hi Acme,');
  expect(placeholdersIn(draft.subject, draft.body)).toEqual(['[Your Name]']);
});

test('recipient validation catches bad addresses', () => {
  expect(allValid(['a@b.co', 'x.y@acme.com'])).toBe(true);
  expect(allValid(['a@b.co', 'not-an-email'])).toBe(false);
});
