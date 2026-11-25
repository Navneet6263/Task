import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { SendBackModal, SentBackBanner, SentBackTag, canSendBack, isSentBack } from './SendBack';

const h = {};
jest.mock('../../services/api', () => ({
  tasks: { sendBackInfo: (...a) => h.info(...a), sendBack: (...a) => h.send(...a) },
}));

let c, r;
const type = (el, v) => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem('user', JSON.stringify({ id: 5, name: 'Asha' }));
  c = document.createElement('div'); document.body.append(c); r = createRoot(c);
});
afterEach(() => { act(() => r.unmount()); c.remove(); localStorage.clear(); });

const task = { id: 40, title: 'VAT return for Acme', assigned_to: 5, status: 'IN_PROGRESS', version: 3, issue_type: 'task' };

test('only the assignee of an open task sees Send back; bugs use their own bar when bug tracking is on', () => {
  expect(canSendBack(task)).toBe(true);
  expect(canSendBack({ ...task, assigned_to: 6 })).toBe(false);
  expect(canSendBack({ ...task, status: 'DONE' })).toBe(false);
  expect(canSendBack({ ...task, issue_type: 'bug' }, { bugFlowOn: true })).toBe(false);
  expect(canSendBack({ ...task, issue_type: 'bug' }, { bugFlowOn: false })).toBe(true);
});

test('the window says who gets it back, needs a reason, and sends it with the task version', async () => {
  h.info = jest.fn(async () => ({ data: { allowed: true, to: { id: 9, name: 'Ravi' } } }));
  h.send = jest.fn(async () => ({ data: { message: 'Sent back to Ravi.', to: { id: 9, name: 'Ravi' } } }));
  const onDone = jest.fn(); const onClose = jest.fn();
  await act(async () => r.render(<SendBackModal task={task} onClose={onClose} onDone={onDone} />));
  expect(document.body.textContent).toContain('It goes back to Ravi');
  expect(button('Send back').disabled).toBe(true);

  await act(async () => { button('This belongs to another team.').click(); });
  expect(document.querySelector('textarea').value).toBe('This belongs to another team.');
  await act(async () => type(document.querySelector('textarea'), 'Payroll work, I only do VAT.'));
  await act(async () => { button('Send back').click(); });
  expect(h.send).toHaveBeenCalledWith(40, 'Payroll work, I only do VAT.', 3);
  expect(onDone).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});

test('when nobody can take it back, the window says why and offers no send', async () => {
  h.info = jest.fn(async () => ({ data: { allowed: false, reason: 'Nobody to send it back to: it has no assigner and the team has no leader.' } }));
  h.send = jest.fn();
  await act(async () => r.render(<SendBackModal task={task} onClose={() => {}} />));
  expect(document.body.textContent).toContain('Nobody to send it back to');
  expect(document.querySelector('textarea')).toBeNull();
  expect(button('Send back').disabled).toBe(true);
});

test('a task sent back shows who sent it and why, until it is assigned again', async () => {
  const back = { ...task, assigned_to: 9, returned_to: 9, returned_by_name: 'Asha', returned_reason: 'Payroll work, I only do VAT.', returned_at: '2026-11-24T05:00:00Z' };
  expect(isSentBack(back)).toBe(true);
  expect(isSentBack({ ...back, assigned_to: 12 })).toBe(false);
  await act(async () => r.render(<><SentBackBanner task={back} /><SentBackTag task={back} /></>));
  expect(c.textContent).toContain('Sent back by Asha');
  expect(c.textContent).toContain('Payroll work, I only do VAT.');
  expect(c.textContent).toContain('Sent back');
});
