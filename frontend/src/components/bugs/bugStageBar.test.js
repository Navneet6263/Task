import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import BugStageBar from './BugStageBar';
import { stageOf } from './bugStages';

const h = {};
jest.mock('../../services/api', () => ({ bugs: { get: (...a) => h.get(...a), act: (...a) => h.act(...a) } }));
jest.mock('../../services/feedback', () => ({ notify: (...a) => h.notify?.(...a) }));

const STAGES = [['new', 'New'], ['ready', 'Ready to pick'], ['fixing', 'Fixing'], ['qa', 'Ready for QA'], ['done', 'Done']].map(([key, name]) => ({ key, name }));
let c, r;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; c = document.createElement('div'); document.body.append(c); r = createRoot(c); });
afterEach(() => { act(() => r.unmount()); c.remove(); });
const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const type = (el, value) => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); };

test('old bugs get their stage from their status, like on the server', () => {
  expect([stageOf({ status: 'DONE' }), stageOf({ status: 'TODO' }), stageOf({ status: 'TODO', assigned_to: 4 }), stageOf({ bug_stage: 'qa' })])
    .toEqual(['done', 'ready', 'fixing', 'qa']);
});

test('the developer marks a bug fixed with a note, and it goes to QA', async () => {
  h.get = jest.fn(async () => ({ data: { stage: 'fixing', stages: STAGES, actions: ['release', 'fixed'], qa_name: 'Ravi', reopen_count: 1, team_has_roles: true, is_lead: false } }));
  h.act = jest.fn(async () => ({ data: { stage: 'qa' } }));
  h.notify = jest.fn();
  const onChanged = jest.fn();
  await act(async () => r.render(<BugStageBar task={{ id: 9, version: 3, assigned_to_name: 'Asha' }} onChanged={onChanged} />));
  expect(c.textContent).toContain('Asha is fixing it.');
  expect(c.textContent).toContain('Reopened 1x');
  expect(button('Give back')).toBeTruthy();

  await act(async () => button('Mark fixed').click());
  expect(c.textContent).toContain('What did you fix?');
  expect(button('Send to QA').disabled).toBe(true); // a note is needed first
  await act(async () => type(c.querySelector('#bug-note'), 'Safari popup fixed'));
  await act(async () => button('Send to QA').click());
  expect(h.act).toHaveBeenCalledWith(9, 'fixed', 'Safari popup fixed');
  expect(h.notify).toHaveBeenCalledWith('Sent to QA to check.', 'success');
  expect(onChanged).toHaveBeenCalled();
});

test('QA passes or fails a fix; a refused step shows why and reloads the stage', async () => {
  h.get = jest.fn(async () => ({ data: { stage: 'qa', stages: STAGES, actions: ['pass', 'fail'], qa_name: 'Ravi', reopen_count: 0, team_has_roles: true, is_lead: false } }));
  h.act = jest.fn(async () => { throw { response: { data: { error: 'This bug is in Done now. Reload it to see the latest.' } } }; });
  h.notify = jest.fn();
  await act(async () => r.render(<BugStageBar task={{ id: 9, version: 4 }} />));
  expect(c.textContent).toContain('Ravi checks the fix next.');
  await act(async () => button('Pass').click());
  expect(h.act).toHaveBeenCalledWith(9, 'pass', '');
  expect(h.notify).toHaveBeenCalledWith('This bug is in Done now. Reload it to see the latest.');
  expect(h.get).toHaveBeenCalledTimes(2);
});

test('a team leader without Developer / QA set up gets a tip', async () => {
  h.get = jest.fn(async () => ({ data: { stage: 'ready', stages: STAGES, actions: ['pick'], reopen_count: 0, team_has_roles: false, is_lead: true } }));
  await act(async () => r.render(<BugStageBar task={{ id: 9, version: 1 }} />));
  expect(c.textContent).toContain("mark who is Developer and who is QA in this space's People tab");
  expect(button('Pick')).toBeTruthy();
});
