import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { mapEmailRows, mapRows, matchEmails } from './parseHrSheet';
import Login from '../../Login';
import AccountSetup from '../../AccountSetup';

const h = {};
jest.mock('../../../services/api', () => ({
  auth: { login: (...a) => h.login(...a), register: () => Promise.resolve({ data: {} }) },
  account: { firstPassword: (...a) => h.firstPassword(...a), startEmail: () => Promise.resolve({ data: {} }), verifyEmail: () => Promise.resolve({ data: {} }) },
}));

// Headings and order as in a GreenHR "Active Employee Data" export, with a title row above.
const greenHr = [
  ['Active Employee Data'],
  ['Sno', 'EmployeeCode', 'FullName', 'Present address', 'Date of Joining', 'Department', 'Designation', 'Office Location', 'profile', 'Mobile', 'HREmpCode', 'ReportingManagerEmpCode', 'Reporting Manager'],
  [1, 'ACT01', 'Kavya Iyer', 'x', new Date('2020-01-01'), 'Director', 'Director', 'Delhi', '', 9000000001, 'H1', '', ''],
  [2, 'act03', { richText: [{ text: 'Dev ' }, { text: 'K' }] }, 'x', '', 'Accounts', 'Team Lead', 'Jaipur', '', '9000000003', 'H3', 'ACT01', 'Kavya Madam'],
  [3, 'ACT20', 'Asha', 'x', '', 'Accounts', 'Executive', 'Delhi', '', '', 'H20', '', 'Dev K'],
  [4, '', 'No Code', 'x'],
  [5, 'ACT20', 'Asha Again'],
];

test('reads a GreenHR export: finds the headings, codes, managers and suggests roles', () => {
  const { rows, columns, problems, error } = mapRows(greenHr);
  expect(error).toBe('');
  expect(columns).toMatchObject({ code: 'EmployeeCode', name: 'FullName', manager_code: 'ReportingManagerEmpCode', manager_name: 'Reporting Manager', location: 'Office Location' });
  expect(columns.email).toBeUndefined();
  expect(rows.map((r) => [r.code, r.name, r.manager_code, r.role])).toEqual([
    ['ACT01', 'Kavya Iyer', '', 'admin'],
    ['ACT03', 'Dev K', 'ACT01', 'manager'],
    ['ACT20', 'Asha', 'ACT03', 'person'],
  ]);
  expect(rows[0].mobile).toBe('9000000001');
  expect(problems.map((p) => p.text)).toEqual(['Row 6: no employee code — skipped', 'Row 7: ACT20 appears again — skipped']);
  expect(mapRows([['A', 'B'], [1, 2]]).error).toMatch(/Employee code/);
});

test('emails from a name-only sheet are matched by exact name, then by a name inside the other', () => {
  const people = mapRows(greenHr).rows;
  const sheet = mapEmailRows([
    ['Employee Name / Month', 'Date of Birth', 'Location', 'Email Address'],
    ['kavya iyer', new Date('1990-01-01'), 'Delhi', 'Kavya@Gmail.com'],
    ['Asha Kumari', '', 'Delhi', 'asha@gmail.com'],
    ['Dev', '', 'Jaipur', 'not-an-email'],
    ['Someone Else', '', 'Delhi', 'else@gmail.com'],
  ]);
  expect(sheet.rows.map((x) => x.email)).toEqual(['kavya@gmail.com', 'asha@gmail.com', 'else@gmail.com']);
  const result = matchEmails(people, sheet.rows);
  expect(result.rows.map((x) => [x.code, x.email || ''])).toEqual([['ACT01', 'kavya@gmail.com'], ['ACT03', ''], ['ACT20', 'asha@gmail.com']]);
  expect(result.unmatched.map((u) => u.name)).toEqual(['Someone Else']);
  expect(mapEmailRows([['A', 'B']]).error).toMatch(/name column/);
});

test('short names and one-letter spelling differences still match one person', () => {
  const people = [{ code: 'A1', name: 'Anu Mehta' }, { code: 'A2', name: 'Vikram Bhatar' }, { code: 'A3', name: 'Neha Pillai' }];
  const result = matchEmails(people, [
    { name: 'Anuradha Mehta', email: 'a@x.com' }, { name: 'Vikram Bhatad', email: 'b@x.com' }, { name: 'Arjun Das', email: 'c@x.com' },
  ]);
  expect(result.rows.map((x) => x.email || '')).toEqual(['a@x.com', 'b@x.com', '']);
  expect(result.unmatched.map((u) => u.name)).toEqual(['Arjun Das']);
});

let c, r;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; localStorage.clear(); c = document.createElement('div'); document.body.append(c); r = createRoot(c); });
afterEach(() => { act(() => r.unmount()); c.remove(); });
const type = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const app = (path) => (
  <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/account-setup" element={<AccountSetup />} />
      <Route path="/dashboard" element={<p>Dashboard</p>} />
    </Routes>
  </MemoryRouter>
);

test('employees sign in with their code, then must choose their own password before the email step', async () => {
  h.login = jest.fn(async () => ({ data: { token: 't', id: 31, name: 'Asha Rao', role: 'person', org_id: 8, email: '', must_change_password: true, needs_email: true, login_code: 'ACT20' } }));
  h.firstPassword = jest.fn(async () => ({ data: {} }));
  await act(async () => r.render(app('/login')));
  await act(async () => button('Employee code').click());
  act(() => type(c.querySelector('#auth-employee-code'), 'act20'));
  act(() => type(c.querySelector('#auth-password'), 'KMPT-4827'));
  await act(async () => c.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(h.login).toHaveBeenCalledWith({ employee_code: 'ACT20', password: 'KMPT-4827' });
  expect(JSON.parse(localStorage.getItem('user'))).toMatchObject({ needs_email: true, must_change_password: true });
  expect(c.textContent).toContain('Hi Asha, choose your own password');

  act(() => type(c.querySelector('#auth-new-password'), 'my-own-secret'));
  act(() => type(c.querySelector('#auth-type-it-again'), 'my-own-secret'));
  await act(async () => c.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(h.firstPassword).toHaveBeenCalledWith('my-own-secret');
  expect(c.textContent).toContain('Your email is not registered yet');
  expect(c.textContent).toContain('Step 2 of 2');
  await act(async () => button('Do this later').click());
  expect(c.textContent).toContain('Dashboard');
  expect(localStorage.getItem('login_with')).toBe('code');
});

test('the company code field appears when the same code fits two companies', async () => {
  h.login = jest.fn(async () => { const e = new Error('x'); e.response = { data: { code: 'COMPANY_CODE_REQUIRED', error: 'x' } }; throw e; });
  localStorage.setItem('login_with', 'code');
  await act(async () => r.render(app('/login')));
  expect(c.querySelector('#auth-company-code')).toBeNull();
  act(() => type(c.querySelector('#auth-employee-code'), 'ACT05'));
  act(() => type(c.querySelector('#auth-password'), 'secret'));
  await act(async () => c.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(c.querySelector('#auth-company-code')).not.toBeNull();
  expect(c.textContent).toContain('Two companies use this employee code');
});
