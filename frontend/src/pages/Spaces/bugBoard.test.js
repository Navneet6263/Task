import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import BugBoard from './BugBoard';

const h = {};
jest.mock('../../services/api', () => ({
  bugs: { board: (...a) => h.board(...a), act: (...a) => h.act(...a) },
  tasks: { getDetail: async (id) => ({ data: { id, title: 'Opened' } }) },
}));
jest.mock('../../services/feedback', () => ({ notify: (...a) => h.notify?.(...a) }));
jest.mock('../../components/taskExtras/taskExtrasStore', () => ({
  TaskExtrasProvider: ({ children }) => children, useTaskMeta: () => ({ keyOf: (id) => `WEB-${id}` }),
}));
jest.mock('../Dashboard/TaskDetailModal', () => ({ selectedTask }) => <div>Task window: {selectedTask.title}</div>);
jest.mock('../../components/account/UserAvatar', () => ({ name }) => <span>{name}</span>);

const STAGES = [['new', 'New'], ['ready', 'Ready to pick'], ['fixing', 'Fixing'], ['qa', 'Ready for QA'], ['done', 'Done']].map(([key, name]) => ({ key, name }));
const boardData = (me = {}) => ({
  stages: STAGES, done_days: 14,
  columns: {
    new: [],
    ready: [{ id: 2, title: 'Payment fails on Safari', severity: 'CRITICAL' }, { id: 1, title: 'Export skips last row', severity: 'LOW' }],
    fixing: [{ id: 3, title: 'Photo upload stops', assigned_to: 21, assigned_to_name: 'Asha Verma', reopen_count: 1 }],
    qa: [{ id: 4, title: 'Blank error in chat', assigned_to: 22, assigned_to_name: 'Karan', qa_user_id: 31, qa_user_name: 'Ravi Kumar' }],
    done: [],
  },
  counts: { new: 0, ready: 2, fixing: 1, qa: 1, done: 0 },
  summary: { open: 4, critical: 1, reopened: 1 },
  me: { id: 21, role: 'developer', is_lead: false, team_has_roles: true, wip_limit: 3, fixing: 1, can_pick: true, ...me },
});
let c, r;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; c = document.createElement('div'); document.body.append(c); r = createRoot(c); });
afterEach(() => { act(() => r.unmount()); c.remove(); });
const buttons = (text) => [...c.querySelectorAll('button')].filter((b) => b.textContent.trim() === text);
const column = (name) => c.querySelector(`section[aria-label="${name}"]`);

test('bugs sit in their stage column, and a developer picks one right from the card', async () => {
  h.board = jest.fn(async () => ({ data: boardData() }));
  h.act = jest.fn(async () => ({ data: { stage: 'fixing' } }));
  h.notify = jest.fn();
  await act(async () => r.render(<BugBoard team={{ id: 3, name: 'Web App' }} />));
  expect(column('Ready to pick').textContent).toContain('Payment fails on Safari');
  expect(column('Fixing').textContent).toContain('Reopened 1x');
  expect(column('Ready for QA').textContent).toContain('QA: Ravi');
  expect(c.textContent).toContain('You have 1 of 3 bugs in Fixing.');
  expect(buttons('Pick')).toHaveLength(2);

  await act(async () => buttons('Pick')[0].click());
  expect(h.act).toHaveBeenCalledWith(2, 'pick');
  expect(h.notify).toHaveBeenCalledWith('WEB-2 is yours now.', 'success');
  expect(h.board).toHaveBeenCalledTimes(2);

  // "Mine" keeps only the bugs I fix or check.
  await act(async () => buttons('Mine')[0].click());
  expect(column('Ready to pick').textContent).toContain('Nothing here.');
  expect(column('Fixing').textContent).toContain('Photo upload stops');

  await act(async () => [...c.querySelectorAll('button')].find((b) => b.textContent.includes('Photo upload stops')).click());
  expect(c.textContent).toContain('Task window: Opened');
});

test('QA gets no Pick button, and a developer at the limit cannot pick a fourth', async () => {
  h.board = jest.fn(async () => ({ data: boardData({ id: 31, role: 'qa', can_pick: false, fixing: 0 }) }));
  await act(async () => r.render(<BugBoard team={{ id: 3, name: 'Web App' }} />));
  expect(buttons('Pick')).toHaveLength(0);
  expect(c.textContent).toContain('You check the fixes in this team.');

  h.board = jest.fn(async () => ({ data: boardData({ fixing: 3 }) }));
  await act(async () => r.render(<BugBoard team={{ id: 4, name: 'Mobile' }} />));
  expect(buttons('Pick').every((b) => b.disabled)).toBe(true);
});
