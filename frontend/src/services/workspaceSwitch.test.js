import { openInOtherWorkspace, teamLabel } from './workspaceSwitch';

const conflict = (orgId) => ({ response: { status: 409, data: { code: 'OTHER_WORKSPACE', org_id: orgId, org_name: 'Vision India' } } });

beforeEach(() => { localStorage.clear(); localStorage.setItem('active_org_id', '4'); });

test('a task of another workspace switches there and opens it; it never loops', () => {
  const assign = jest.fn();
  const original = window.location;
  delete window.location;
  window.location = { assign };
  try {
    expect(openInOtherWorkspace(conflict(9), 40)).toBe(true);
    expect(localStorage.getItem('active_org_id')).toBe('9');
    expect(assign).toHaveBeenCalledWith('/dashboard?task=40');
    expect(openInOtherWorkspace(conflict(9), 40)).toBe(false); // already in Vision India
    expect(openInOtherWorkspace({ response: { status: 403, data: { error: 'Team access denied' } } }, 40)).toBe(false);
    expect(assign).toHaveBeenCalledTimes(1);
  } finally { window.location = original; }
});

test('My Tasks names the workspace only for tasks of another workspace', () => {
  expect(teamLabel({ team_name: 'Accounts', org_id: 4, workspace_name: 'GreenCall Technology' })).toBe('Accounts');
  expect(teamLabel({ team_name: 'Skilling', org_id: 9, workspace_name: 'Vision India' })).toBe('Skilling · Vision India');
});
