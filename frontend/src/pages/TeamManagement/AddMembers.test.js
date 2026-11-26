import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AddMembers from './AddMembers';

const h = {};
jest.mock('../../services/api', () => ({ teams: { candidates: (...a) => h.candidates(...a), addMember: (...a) => h.addMember(...a) } }));
jest.mock('../../services/feedback', () => ({ notify: (...a) => h.notify(...a) }));

let c, r;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; jest.useFakeTimers(); h.notify = jest.fn(); c = document.createElement('div'); document.body.append(c); r = createRoot(c); });
afterEach(() => { act(() => r.unmount()); c.remove(); jest.useRealTimers(); });

test('Add people shows people from the company\'s other workspace with its name, and says they can switch to this one', async () => {
  h.candidates = jest.fn(async () => ({ data: [
    { id: 3, name: 'Asha', email: 'asha@x.com', other_workspace: false, in_workspace: true, workspace: 'Vision India' },
    { id: 5, name: 'Ravi', email: 'ravi@x.com', other_workspace: true, in_workspace: false, workspace: 'GreenCall Technology' },
  ] }));
  h.addMember = jest.fn(async () => ({ data: {} }));
  await act(async () => r.render(<AddMembers team={{ id: 7, name: 'BD' }} onAdded={() => {}} />));
  await act(async () => { jest.runOnlyPendingTimers(); });
  await act(async () => {});
  expect(c.textContent).toContain("From your company's workspaces");
  const ravi = [...c.querySelectorAll('li')].find((li) => li.textContent.includes('Ravi'));
  expect(ravi.textContent).toContain('GreenCall Technology');
  expect([...c.querySelectorAll('li')].find((li) => li.textContent.includes('Asha')).textContent).not.toContain('Vision India');
  await act(async () => { ravi.querySelector('button').click(); });
  expect(h.addMember).toHaveBeenCalledWith(7, { user_id: 5, role: expect.any(String) });
  expect(h.notify).toHaveBeenCalledWith('Ravi added to BD. They can now open this workspace from the switcher at the top.', 'success');
});
