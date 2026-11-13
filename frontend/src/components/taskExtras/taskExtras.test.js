import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import TaskBadges from './TaskBadges';
import LabelPicker from './LabelPicker';
import TaskExtrasPanel from './TaskExtrasPanel';
import { extrasPayload } from './ComposerExtras';
import { TaskExtrasProvider, resetTaskMetaCache } from './taskExtrasStore';

const h = {};
jest.mock('../../services/api', () => ({
  taskExtras: new Proxy({}, { get: (_, name) => (...a) => h[name](...a) }),
  tasks: { update: (...a) => h.update(...a) },
}));
jest.mock('../../services/feedback', () => ({ notify: () => {} }));

const META = { data: { prefix: 'ACC', labels: [{ id: 1, name: 'VAT', color: 'blue' }, { id: 2, name: 'Payroll', color: 'green' }] } };
let c, r;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true; resetTaskMetaCache();
  c = document.createElement('div'); document.body.append(c); r = createRoot(c);
  h.meta = jest.fn(async () => META);
});
afterEach(() => { act(() => r.unmount()); c.remove(); });
const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent === text);
const flush = () => act(async () => { await new Promise((res) => setTimeout(res, 0)); });

test('cards show labels, subtask progress, parent and blockers from one request, without the task number', async () => {
  h.summary = jest.fn(async () => ({ data: { 5: { labels: [{ id: 1, name: 'VAT', color: 'blue' }], subtasks: { total: 4, done: 3 }, parent: { id: 2, title: 'Month end' }, blocked_by: 1 } } }));
  await act(async () => r.render(<TaskExtrasProvider tasks={[{ id: 5 }, { id: 6 }]}><TaskBadges task={{ id: 5 }} /><TaskBadges task={{ id: 6 }} /></TaskExtrasProvider>));
  await flush();
  expect(h.summary).toHaveBeenCalledTimes(1);
  expect(h.summary).toHaveBeenCalledWith(['5', '6']);
  expect(c.textContent).not.toContain('ACC-5');
  expect(c.textContent).not.toContain('ACC-6');
  expect(c.textContent).toContain('3/4');
  expect(c.textContent).toContain('↳ Month end');
  expect(c.textContent).toContain('Blocked');
  expect(c.textContent).toContain('VAT');
});

test('a new label is created with its colour and picked at once', async () => {
  h.createLabel = jest.fn(async () => ({ data: { id: 3, name: 'Urgent client', color: 'red' } }));
  const onChange = jest.fn();
  await act(async () => r.render(<LabelPicker value={[1]} onChange={onChange} />));
  await flush();
  await act(async () => button('+ Label').click());
  const input = document.querySelector('[aria-label="Find or create a label"]');
  act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Urgent client'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => document.querySelector('[aria-label="red"]').click());
  await act(async () => button('Create label “Urgent client”').click());
  expect(h.createLabel).toHaveBeenCalledWith({ name: 'Urgent client', color: 'red' });
  expect(onChange).toHaveBeenCalledWith([1, 3]);
});

test('the task screen adds a subtask and shows progress', async () => {
  const empty = { id: 9, labels: [], parent: null, subtasks: [], links: [] };
  h.detail = jest.fn(async () => ({ data: empty }));
  h.addSubtask = jest.fn(async () => ({ data: { ...empty, subtasks: [{ id: 10, title: 'Collect slips', status: 'DONE', version: 1 }, { id: 11, title: 'Check totals', status: 'TODO', version: 1 }] } }));
  await act(async () => r.render(<TaskExtrasPanel task={{ id: 9, team_id: 3 }} members={[{ id: 4, name: 'Asha' }]} />));
  await flush();
  await act(async () => button('+ Add subtask').click());
  const title = document.querySelector('[aria-label="Subtask title"]');
  act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(title, 'Collect slips'); title.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => button('Add').click());
  expect(h.addSubtask).toHaveBeenCalledWith(9, expect.objectContaining({ title: 'Collect slips' }));
  expect(c.textContent).toContain('50%');
  expect(c.textContent).toContain('ACC-11');
});

test('blockers picked while creating a task are saved as "is blocked by" links', () => {
  expect(extrasPayload({ label_ids: [], parent: null, blocked_by: [] })).toBeNull();
  expect(extrasPayload({ label_ids: [1], parent: { id: 4 }, blocked_by: [{ id: 7 }] }))
    .toEqual({ label_ids: [1], parent_id: 4, links: [{ type: 'blocks', inward: true, task_id: 7 }] });
});

test('several subtasks can be added at once, one per line', async () => {
  const empty = { id: 9, labels: [], parent: null, subtasks: [], links: [] };
  h.detail = jest.fn(async () => ({ data: empty }));
  h.addSubtask = jest.fn(async () => ({ data: empty }));
  await act(async () => r.render(<TaskExtrasPanel task={{ id: 9, team_id: 3 }} members={[]} />));
  await flush();
  await act(async () => button('+ Add subtask').click());
  await act(async () => button('Add several at once').click());
  const box = document.querySelector('[aria-label="Subtasks, one per line"]');
  act(() => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(box, '- Collect slips\n2. Check totals\n\nSend to client'); box.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => button('Add all').click());
  expect(h.addSubtask.mock.calls.map((c) => c[1].title)).toEqual(['Collect slips', 'Check totals', 'Send to client']);
});
