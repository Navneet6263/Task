import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { HandOverModal, HandedOverSection, canHandOver } from './HandOver';
import { setChatPresence, showChatNotice } from '../../services/chatPresence';

const h = {};
jest.mock('../../services/api', () => ({
  tasks: { handoverOptions: (...a) => h.options(...a), handOver: (...a) => h.handOver(...a), handedOver: (...a) => h.handedOver(...a) },
}));
jest.mock('../../services/feedback', () => ({ notify: (...a) => h.notify(...a) }));

let c, r;
const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true; h.notify = jest.fn();
  localStorage.setItem('user', JSON.stringify({ id: 30, role: 'person' }));
  localStorage.setItem('active_org_id', '4');
  c = document.createElement('div'); document.body.append(c); r = createRoot(c);
});
afterEach(() => { act(() => r.unmount()); c.remove(); localStorage.clear(); });

const task = { id: 40, title: 'Quote for Acme', status: 'TODO', version: 3 };

test('only managers, admins and the team leader see Hand over', () => {
  expect(canHandOver(task, [{ id: 30, is_reporting_manager: 0 }])).toBe(false);
  expect(canHandOver(task, [{ id: 30, is_reporting_manager: 1 }])).toBe(true);
  localStorage.setItem('user', JSON.stringify({ id: 31, role: 'manager' }));
  expect(canHandOver(task, [])).toBe(true);
  expect(canHandOver({ ...task, status: 'DONE' }, [])).toBe(false);
  expect(canHandOver({ ...task, parent_task_id: 9 }, [])).toBe(false);
});

test('the window lists the company\'s teams by workspace with their leaders and hands the task over', async () => {
  h.options = jest.fn(async () => ({ data: { allowed: true, teams: [
    { id: 7, name: 'Sales', workspace: 'GreenCall', leader: { id: 21, name: 'Rahul' } },
    { id: 8, name: 'Finance', workspace: 'Vision India', leader: null },
  ] } }));
  h.handOver = jest.fn(async () => ({ data: { message: 'Handed over to Sales (Rahul).' } }));
  const onDone = jest.fn(); const onClose = jest.fn();
  await act(async () => r.render(<HandOverModal task={task} onClose={onClose} onDone={onDone} />));
  expect(document.body.textContent).toContain('Vision India');
  expect(document.body.textContent).toContain('Leader: Rahul');
  expect(document.body.textContent).toContain('No leader yet');
  expect(button('Hand over').disabled).toBe(true);
  await act(async () => { [...document.querySelectorAll('[role="radio"]')].find((b) => b.textContent.includes('Sales')).click(); });
  await act(async () => { button('Hand over').click(); });
  expect(h.handOver).toHaveBeenCalledWith(40, 7, '', 3);
  expect(onDone).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});

test('My Tasks shows what you handed over, where it is and its status, without opening it', async () => {
  h.handedOver = jest.fn(async () => ({ data: [
    { id: 5, title: 'Quote for Acme', from_team: 'IT', to_team: 'Sales', current_team: 'Finance', workspace: 'Vision India', assignee: 'Meena', status: 'IN_PROGRESS', sent_back: false, is_deleted: false },
    { id: 6, title: 'Price list', from_team: 'IT', to_team: 'Sales', current_team: 'IT', assignee: 'Asha', status: 'TODO', sent_back: true, is_deleted: false },
  ] }));
  await act(async () => r.render(<HandedOverSection />));
  expect(c.textContent).toContain('Handed over');
  expect(c.textContent).toContain('IT → Sales · now in Finance (Vision India) · with Meena');
  expect(c.textContent).toContain('In progress');
  expect(c.textContent).toContain('Sent back');
});

test('a new team chat message shows a notice, unless that chat is on screen', () => {
  const notice = { team_id: 2, team_name: 'Sales', from: 'Asha', preview: 'Call moved to 4 pm', org_id: 9, workspace: 'Vision India' };
  expect(showChatNotice(notice)).toBe(true);
  expect(h.notify).toHaveBeenLastCalledWith('Asha in Sales (Vision India): Call moved to 4 pm', 'info');
  setChatPresence({ open: true, teamId: 2 });
  expect(showChatNotice(notice)).toBe(false);
  setChatPresence({ open: false, teamId: null });
  expect(showChatNotice({ ...notice, direct: true })).toBe(true);
  expect(h.notify).toHaveBeenLastCalledWith('Asha sent you a message: Call moved to 4 pm', 'info');
});

test('a burst of messages in one team gives one notice, then another after a quiet moment', () => {
  const notice = { team_id: 77, team_name: 'Ops', from: 'Ravi', preview: 'hi' };
  expect(showChatNotice(notice, 1000)).toBe(true);
  expect(showChatNotice({ ...notice, preview: 'again' }, 4000)).toBe(false);
  expect(showChatNotice({ ...notice, preview: 'later' }, 12000)).toBe(true);
});
