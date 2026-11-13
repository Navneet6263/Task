import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import TeamSharing from './TeamSharing';

const h = {};
jest.mock('../../services/api', () => ({
  teams: { sharing: (...a) => h.sharing(...a), share: (...a) => h.share(...a), unshare: (...a) => h.unshare(...a) },
}));
jest.mock('../../services/feedback', () => ({ notify: () => {} }));

const team = { id: 7, name: 'Payroll', org_id: 1 };
const allTeams = [team, { id: 8, name: 'Audit', org_id: 1, member_count: 3 }, { id: 9, name: 'Elsewhere', org_id: 2 }];
let c, r;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; c = document.createElement('div'); document.body.append(c); r = createRoot(c); window.confirm = () => true; });
afterEach(() => { act(() => r.unmount()); c.remove(); });
const pick = async (selector, value) => act(async () => { const el = c.querySelector(selector); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new Event('change', { bubbles: true })); });
const button = (text) => [...c.querySelectorAll('button')].find((b) => b.textContent === text);

test('an admin makes two teams of the same workspace work together', async () => {
  h.sharing = jest.fn(async () => ({ data: { shared_with: [], sees: [] } }));
  h.share = jest.fn(async () => ({ data: { shared_with: [{ id: 8, name: 'Audit', members: 3, both_ways: true }], sees: [{ id: 8, name: 'Audit', members: 3, both_ways: true }] } }));
  const onChanged = jest.fn();
  await act(async () => r.render(<TeamSharing team={team} allTeams={allTeams} canEdit onChanged={onChanged} />));
  const options = [...c.querySelectorAll('[aria-label="Team to share with"] option')].map((o) => o.textContent);
  expect(options).toEqual(['Pick a team…', 'Audit · 3 members']);
  await pick('[aria-label="Team to share with"]', '8');
  expect(c.textContent).toContain('Both teams see and work on each other\'s tasks.');
  await act(async () => button('Share').click());
  expect(h.share).toHaveBeenCalledWith(7, 8, true);
  expect(onChanged).toHaveBeenCalled();
  expect(c.textContent).toContain('Work together');
});

test('"We see theirs" is saved from the other team\'s side', async () => {
  h.sharing = jest.fn(async () => ({ data: { shared_with: [], sees: [] } }));
  h.share = jest.fn(async () => ({ data: {} }));
  await act(async () => r.render(<TeamSharing team={team} allTeams={allTeams} canEdit onChanged={() => {}} />));
  await pick('[aria-label="Team to share with"]', '8');
  await act(async () => button('We see theirs').click());
  await act(async () => button('Share').click());
  expect(h.share).toHaveBeenCalledWith(8, 7, false);
});

test('people who are not admins only see what is shared, and nothing when there is none', async () => {
  h.sharing = jest.fn(async () => ({ data: { shared_with: [], sees: [{ id: 8, name: 'Audit', members: 3, both_ways: false }] } }));
  await act(async () => r.render(<TeamSharing team={team} allTeams={allTeams} canEdit={false} onChanged={() => {}} />));
  expect(c.textContent).toContain('Payroll sees their tasks');
  expect(button('Stop')).toBeUndefined();
  expect(c.textContent).not.toContain('Share with another team');
});
