import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import MembersTable from './MembersTable';

const h = {};
jest.mock('../../services/api', () => ({
  teams: { setLeader: (...a) => h.setLeader(...a), updateMemberRole: () => Promise.resolve({}), removeMember: () => Promise.resolve({}) },
  setAccessRole: (...a) => h.setAccessRole(...a),
}));
jest.mock('../../services/feedback', () => ({ notify: () => {} }));

const team = { id: 7, name: 'Payroll' };
const members = [
  { id: 1, name: 'Lead', role: 'manager', team_role: 'Team Leader', is_reporting_manager: true },
  { id: 3, name: 'Asha', role: 'person', team_role: 'Member', is_reporting_manager: false },
];
let c, r;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; c = document.createElement('div'); document.body.append(c); r = createRoot(c); window.confirm = () => true; });
afterEach(() => { act(() => r.unmount()); c.remove(); });
const button = (text) => [...c.querySelectorAll('button')].filter((b) => b.textContent === text);

test('an admin makes a member the team leader and changes what someone can do', async () => {
  h.setLeader = jest.fn(async () => ({ data: {} }));
  h.setAccessRole = jest.fn(async () => ({ data: {} }));
  const onChanged = jest.fn();
  await act(async () => r.render(<MembersTable team={team} members={members} canManage admin={{ isCompanyAdmin: false, selfId: 10 }} onChanged={onChanged} />));
  expect(c.textContent).toContain('Team leader');
  expect(button('Make leader')).toHaveLength(1);
  await act(async () => button('Make leader')[0].click());
  expect(h.setLeader).toHaveBeenCalledWith(7, 3);

  const access = c.querySelector('[aria-label="Access of Asha"]');
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(access, 'manager'); access.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(h.setAccessRole).toHaveBeenCalledWith(false, 3, 'manager');
  expect(onChanged).toHaveBeenCalledTimes(2);
});

test('a manager can edit the team but cannot pick its leader or change access', async () => {
  await act(async () => r.render(<MembersTable team={team} members={members} canManage admin={null} onChanged={() => {}} />));
  expect(button('Make leader')).toHaveLength(0);
  expect(c.querySelector('[aria-label="Access of Asha"]')).toBeNull();
  expect(button('Remove')).toHaveLength(1);
});
