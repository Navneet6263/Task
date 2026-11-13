import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import OrganizationsTab from '../OrganizationsTab';
import AdminsTab from '../AdminsTab';
import CompanyAdminsTab from '../CompanyAdminsTab';
import UsersTab from '../UsersTab';

const h = {};
jest.mock('../../../services/api', () => ({
  __esModule: true,
  default: { get: (...a) => h.get(...a), post: (...a) => h.post(...a), put: (...a) => h.put(...a), patch: (...a) => h.patch(...a), delete: (...a) => h.del(...a) },
  setAccessRole: () => Promise.resolve(),
}));
jest.mock('../../../services/feedback', () => ({ notify: () => {} }));

const orgs = [
  { id: 8, name: 'Rohit Verma Workspace', company_code: 'ORG-ACC-1', task_prefix: null, user_count: 48, team_count: 1, admin_count: 1 },
  { id: 9, name: 'New Branch', company_code: 'ORG-NEW-2', task_prefix: 'NB', user_count: 0, team_count: 0, admin_count: 0 },
];
const people = [
  { id: 1, name: 'Rohit Verma', email: 'rohit@x.com', role: 'admin', org_id: 8, org_name: 'Rohit Verma Workspace' },
  { id: 12, name: 'Asha Rao', email: 'asha@x.com', role: 'manager', org_id: 8 },
  { id: 13, name: 'Vikram Singh', email: 'vikram@x.com', role: 'person', org_id: 8 },
];
let c, r;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true; c = document.createElement('div'); document.body.append(c); r = createRoot(c);
  h.get = jest.fn(async () => ({ data: people }));
});
afterEach(() => { act(() => r.unmount()); c.remove(); });
const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const flush = () => act(async () => { await new Promise((res) => setTimeout(res, 0)); });
const type = (el, value) => act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
const dialog = () => document.querySelector('[role="dialog"]');
const inDialog = (label) => [...dialog().querySelectorAll('label')].find((l) => l.textContent.startsWith(label)).querySelector('input');

test('each organization card shows its task code and admins, and an organization without an admin says so', async () => {
  await act(async () => r.render(<OrganizationsTab orgs={orgs} canCreate onChanged={() => {}} />));
  await flush();
  expect(c.textContent).toContain('Task numbers: ACC-142');
  expect(c.textContent).toContain('Task numbers: NB-142');
  expect(c.textContent).toContain('Rohit Verma');
  expect(c.textContent).toContain('No admin yet.');
  // An organization admin (not the owner) sees the card but cannot edit it.
  act(() => r.unmount()); r = createRoot(c);
  await act(async () => r.render(<OrganizationsTab orgs={[orgs[0]]} canCreate={false} onChanged={() => {}} />));
  expect(button('Edit')).toBeUndefined();
  expect(c.textContent).not.toContain('+ Add admin');
});

test('editing an organization changes its name and task code, and shows how task numbers will look', async () => {
  h.patch = jest.fn(async () => ({ data: {} }));
  const onChanged = jest.fn();
  await act(async () => r.render(<OrganizationsTab orgs={orgs} canCreate onChanged={onChanged} />));
  await flush();
  await act(async () => [...document.querySelectorAll('button')].filter((b) => b.textContent === 'Edit')[0].click());
  expect(dialog().textContent).toContain('Task numbers will look like ACC-142');
  expect(dialog().textContent).toContain('This does not change, because people already use it to join.');
  expect(button('Save changes').disabled).toBe(true);
  type(inDialog('Organization name'), 'Accountrust');
  type(inDialog('Task code'), 'a-c t!');
  expect(dialog().textContent).toContain('Task numbers will look like ACT-142');
  await act(async () => button('Save changes').click());
  expect(h.patch).toHaveBeenCalledWith('/company-admin/organizations/8', { name: 'Accountrust', task_prefix: 'ACT' });
  expect(onChanged).toHaveBeenCalled();
});

test('a new organization can get its admin in the same step, and the password is made and shown once', async () => {
  h.post = jest.fn(async (url) => (url.endsWith('/organizations')
    ? { data: { id: 10, name: 'Leeds Office', company_code: 'ORG-LEE-3' } }
    : { data: { id: 90, email: 'priya@x.com', temporary_password: 'Ab3De-fG7hJ' } }));
  await act(async () => r.render(<OrganizationsTab orgs={orgs} canCreate onChanged={() => {}} />));
  await flush();
  await act(async () => button('+ New organization').click());
  expect(button('Create organization').disabled).toBe(true);
  type(inDialog('Organization name'), 'Leeds Office');
  type(inDialog('Admin’s full name'), 'Priya Shah');
  type(inDialog('Admin’s work email'), 'Priya@x.com');
  // No password field to fill.
  expect(dialog().querySelector('input[type="password"]')).toBeNull();
  await act(async () => button('Create organization').click());
  expect(h.post.mock.calls).toEqual([['/company-admin/organizations', { name: 'Leeds Office' }], ['/company-admin/admins', { name: 'Priya Shah', email: 'Priya@x.com', org_id: 10 }]]);
  expect(dialog().textContent).toContain('ORG-LEE-3');
  expect(dialog().textContent).toContain('Ab3De-fG7hJ');
  expect(dialog().textContent).toContain('choose their own password the first time they sign in');
});

test('an admin can be someone already in the organization, picked by search; only their role changes', async () => {
  h.put = jest.fn(async () => ({ data: {} }));
  await act(async () => r.render(<OrganizationsTab orgs={orgs} canCreate onChanged={() => {}} />));
  await flush();
  await act(async () => button('+ Add admin').click());
  expect(dialog().textContent).toContain('For Rohit Verma Workspace');
  const box = dialog().querySelector('[aria-label="Person"]');
  act(() => { box.focus(); box.dispatchEvent(new FocusEvent('focus')); });
  type(box, 'vik');
  const options = [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent);
  // Existing admins are not offered; the role and email help tell people apart.
  expect(options).toEqual(['Vikram SinghMember · vikram@x.com']);
  await act(async () => document.querySelector('[role="option"]').click());
  await act(async () => button('Make admin').click());
  expect(h.put).toHaveBeenCalledWith('/company-admin/users/13/role', { role: 'admin' });
  expect(dialog().textContent).toContain('Vikram Singh is now an admin of Rohit Verma Workspace');
  expect(dialog().textContent).toContain('Nothing else to share.');
});

test('the Admins tab resets a password and removes an admin, who stays as a manager or member', async () => {
  h.post = jest.fn(async () => ({ data: { email: 'rohit@x.com', temporary_password: 'Zz9Yy-xX8wW' } }));
  h.put = jest.fn(async () => ({ data: {} }));
  await act(async () => r.render(<AdminsTab orgs={orgs} onChanged={() => {}} />));
  await flush();
  expect(c.textContent).toContain('Rohit Verma');
  expect(c.textContent).not.toContain('Asha Rao');
  await act(async () => button('Reset password').click());
  expect(dialog().textContent).toContain('Their current password stops working as soon as you save.');
  await act(async () => button('Change password').click());
  expect(h.post).toHaveBeenCalledWith('/company-admin/users/1/reset-password', { must_change: true });
  expect(dialog().textContent).toContain('Zz9Yy-xX8wW');
  await act(async () => button('Done').click());
  await act(async () => document.querySelector('[aria-label="Remove Rohit Verma as admin"]').click());
  await act(async () => [...dialog().querySelectorAll('input[type="radio"]')][1].click());
  await act(async () => button('Remove as admin').click());
  expect(h.put).toHaveBeenCalledWith('/company-admin/users/1/role', { role: 'person' });
});

test('any person can get a new password from the People tab: made for them, or typed and kept as it is', async () => {
  h.get = jest.fn(async () => ({ data: { data: people, pagination: { total: 3 } } }));
  h.post = jest.fn(async (url, body) => ({ data: { email: 'asha@x.com', temporary_password: body.password || 'Mm1Nn-oO2pP', must_change_password: body.must_change } }));
  await act(async () => r.render(<UsersTab isCompanyAdmin={false} orgs={[]} selfId={1} onChanged={() => {}} />));
  await flush();
  // Not on your own row.
  expect(document.querySelector('[aria-label="Change Rohit Verma’s password"]')).toBeNull();
  await act(async () => document.querySelector('[aria-label="Change Asha Rao’s password"]').click());
  await act(async () => [...dialog().querySelectorAll('input[type="radio"]')][1].click());
  const box = dialog().querySelector('input[type="text"]');
  type(box, 'short');
  expect(dialog().textContent).toContain('3 more characters needed.');
  expect(button('Change password').disabled).toBe(true);
  type(box, 'Winter2026!');
  await act(async () => dialog().querySelector('input[type="checkbox"]').click());
  await act(async () => button('Change password').click());
  expect(h.post).toHaveBeenCalledWith('/admin/users/12/reset-password', { password: 'Winter2026!', must_change: false });
  expect(dialog().textContent).toContain('Winter2026!');
  expect(dialog().textContent).toContain('They can sign in with this one.');
});

test('an organization admin can rename their own organization', async () => {
  h.patch = jest.fn(async () => ({ data: {} }));
  await act(async () => r.render(<OrganizationsTab orgs={[{ id: 4, name: 'Niraj Jena Workspace', company_code: 'ORG-NIRA-1', user_count: 9, team_count: 2 }]} canCreate={false} canEdit onChanged={() => {}} />));
  expect(c.textContent).not.toContain('+ Add admin');
  await act(async () => button('Edit').click());
  type(inDialog('Organization name'), 'Greencall');
  await act(async () => button('Save changes').click());
  expect(h.patch).toHaveBeenCalledWith('/admin/organization', { name: 'Greencall', task_prefix: '' });
});

test('company admins: the owner stays, an admin can be added by search, and a co-admin can be removed', async () => {
  const state = { owner: { id: 22, name: 'Navneet Kumar', email: 'navneet@x.com' }, co_admins: [], me: 3 };
  h.get = jest.fn(async (url) => (url.endsWith('/company-admins') ? { data: state } : { data: [...people, { id: 28, name: 'Vikas Saxena', email: 'vikas@x.com', role: 'admin', org_id: 4, org_name: 'Niraj Jena Workspace' }] }));
  h.post = jest.fn(async (url, body) => { state.co_admins = [{ id: body.user_id, name: 'Vikas Saxena', email: 'vikas@x.com', org_name: 'Niraj Jena Workspace' }]; return { data: {} }; });
  h.del = jest.fn(async () => { state.co_admins = []; return { data: {} }; });
  await act(async () => r.render(<CompanyAdminsTab />));
  await flush();
  expect(c.textContent).toContain('Owner');
  await act(async () => button('+ Add company admin').click());
  const box = dialog().querySelector('[aria-label="Admin"]');
  act(() => { box.focus(); box.dispatchEvent(new FocusEvent('focus')); });
  type(box, 'vik');
  // Only admins are offered.
  expect([...document.querySelectorAll('[role="option"]')].map((o) => o.textContent)).toEqual(['Vikas SaxenaNiraj Jena Workspace · vikas@x.com']);
  await act(async () => document.querySelector('[role="option"]').click());
  await act(async () => button('Make company admin').click());
  await flush();
  expect(h.post).toHaveBeenCalledWith('/company-admin/company-admins', { user_id: 28 });
  expect(c.textContent).toContain('Admin of Niraj Jena Workspace');
  await act(async () => document.querySelector('[aria-label="Remove Vikas Saxena as company admin"]').click());
  await act(async () => [...dialog().parentElement.querySelectorAll('button')].filter((x) => x.textContent === 'Remove').pop().click());
  await flush();
  expect(h.del).toHaveBeenCalledWith('/company-admin/company-admins/28');
});
