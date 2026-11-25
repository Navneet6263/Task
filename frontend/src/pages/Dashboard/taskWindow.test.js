import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import TaskDetailModal from './TaskDetailModal';
import TaskMenu from '../../components/taskExtras/TaskMenu';
import TaskHistory, { ago } from '../../components/taskExtras/TaskHistory';
import CommandPalette from '../../components/shell/CommandPalette';
import { recentTasks, rememberTask, whenLabel } from '../../services/recent';
import { resetTaskMetaCache } from '../../components/taskExtras/taskExtrasStore';

const h = {};
const call = (name, fallback) => (...a) => (h[name] ? h[name](...a) : Promise.resolve(fallback));
jest.mock('../../services/api', () => {
  const ok = (data) => Promise.resolve({ data });
  const fn = (name, data) => (...a) => (h[name] ? h[name](...a) : ok(data));
  return {
    __esModule: true,
    default: { get: fn('apiGet', {}), post: fn('apiPost', {}), put: fn('apiPut', {}), patch: fn('apiPatch', {}), delete: fn('apiDelete', {}) },
    tasks: { update: fn('update', { version: 4 }), getDetail: fn('getDetail', null), getFormOptions: fn('formOptions', { task_types: [], products: [], categories: [] }), markTaskViewed: fn('viewed', {}), getTimeLogs: fn('timeLogs', []) },
    teams: { getMembers: fn('members', [{ id: 10, name: 'Navneet Kumar' }, { id: 12, name: 'Ruchika Pal' }]), getAll: fn('teams', []) },
    taskExtras: { meta: () => ok({ prefix: 'AM', labels: [] }), detail: fn('extrasDetail', { id: 11, labels: [], parent: null, subtasks: [], links: [] }), flag: fn('flag', { flagged: true }), history: fn('history', []), search: fn('search', []), summary: fn('summary', {}) },
    taskWorkflow: { get: fn('watchGet', { following: false, watchers: 1, checklist: [] }), follow: fn('follow', { following: true }) },
    comments: { getByTask: fn('comments', []), create: fn('comment', {}) },
    taskForm: { get: fn('taskForm', { layout: null }) },
    timesheet: { status: fn('tsStatus', { enabled: false }) },
  };
});
jest.mock('../../services/feedback', () => ({ notify: (...a) => h.notify?.(...a) }));
void call;

const task = { id: 11, title: 'Test', description: '', status: 'TODO', priority: 'MEDIUM', team_id: 2, assigned_to: 12, assigned_by: 10, version: 3, issue_type: 'task', total_comments: 0, flagged: 0, parent_task_id: 5 };
let c, r;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true; localStorage.clear(); resetTaskMetaCache();
  localStorage.setItem('user', JSON.stringify({ id: 10, name: 'Navneet Kumar', role: 'admin' }));
  Object.keys(h).forEach((k) => delete h[k]);
  c = document.createElement('div'); document.body.append(c); r = createRoot(c);
});
afterEach(() => { act(() => r.unmount()); c.remove(); });
const flush = () => act(async () => { await new Promise((res) => setTimeout(res, 0)); });
const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const pick = (el, value) => act(() => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new Event('change', { bubbles: true })); });

function Window({ start = task, onSaved = () => {} }) {
  const [selected, setSelected] = useState(start);
  const [tab, setTab] = useState('details');
  return selected ? <MemoryRouter><TaskDetailModal selectedTask={selected} setSelectedTask={setSelected} sheetTab={tab} setSheetTab={setTab} onSaved={onSaved} handleDelete={() => {}} /></MemoryRouter> : <p>closed</p>;
}

test('the task window: key and parent on top, details on the right that save at once, and it is remembered as recent', async () => {
  h.update = jest.fn(async () => ({ data: { version: 4 } }));
  h.getDetail = jest.fn(async (id) => ({ data: { ...task, id, status: 'IN_PROGRESS', version: 4 } }));
  await act(async () => r.render(<Window />));
  await flush();
  const crumbs = document.querySelector('[aria-label="Breadcrumb"]').textContent;
  expect(crumbs).toContain('AM-5');
  expect(crumbs).toContain('AM-11');
  expect(document.querySelector('[aria-label="Watch this task (1 watching)"]')).toBeTruthy();
  expect(recentTasks().map((t) => t.id)).toEqual([11]);
  pick(document.querySelector('[aria-label="Status"]'), 'IN_PROGRESS');
  await flush();
  expect(h.update).toHaveBeenCalledWith(11, { status: 'IN_PROGRESS', version: 3 });
  // Assign to me is a single click.
  await act(async () => button('Assign to me').click());
  await flush();
  expect(h.update).toHaveBeenLastCalledWith(11, { assigned_to: 10, version: 4 });
});

test('the title and description are edited in place; Activity has comments with quick replies, history and checklist', async () => {
  h.update = jest.fn(async () => ({ data: { version: 4 } }));
  await act(async () => r.render(<Window />));
  await flush();
  await act(async () => document.querySelector('button[title="Click to edit the title"]').click());
  const box = document.querySelector('textarea[aria-label="Title"]');
  act(() => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(box, 'Test asset upload'); box.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  await flush();
  expect(h.update).toHaveBeenCalledWith(11, { title: 'Test asset upload', version: 3 });
  expect([...document.querySelectorAll('[aria-label="Quick replies"] button')].map((b) => b.textContent)).toEqual(['Can I get more info…?', 'Status update…', 'Thanks…']);
  // "M" goes to the comment box.
  act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true })); });
  await flush();
  expect(document.activeElement.getAttribute('aria-label')).toBe('New comment');
  expect([...document.querySelectorAll('[aria-label="Activity"] [role="tab"]')].map((b) => b.textContent)).toEqual(['Comments', 'History', 'Checklist & review']);
});

test('watch and flag from the top of the task window', async () => {
  h.follow = jest.fn(async () => ({ data: { following: true } }));
  h.flag = jest.fn(async () => ({ data: { flagged: true } }));
  await act(async () => r.render(<Window />));
  await flush();
  await act(async () => document.querySelector('[aria-label="Watch this task (1 watching)"]').click());
  expect(h.follow).toHaveBeenCalledWith(11, true);
  expect(document.querySelector('[aria-label="Watching (2). Click to stop"]')).toBeTruthy();
  await act(async () => document.querySelector('[aria-label="More actions"]').click());
  await act(async () => button('Add flag').click());
  expect(h.flag).toHaveBeenCalledWith(11, true);
  expect(document.querySelector('[aria-label="Breadcrumb"]').textContent).toContain('Flagged');
});

test('the card menu changes status, assigns to me, copies the key and flags', async () => {
  const onStatus = jest.fn();
  const onChanged = jest.fn();
  h.update = jest.fn(async () => ({ data: { version: 4 } }));
  h.flag = jest.fn(async () => ({ data: { flagged: true } }));
  Object.assign(navigator, { clipboard: { writeText: jest.fn(async () => {}) } });
  await act(async () => r.render(<TaskMenu task={task} onStatus={onStatus} onChanged={onChanged} />));
  await flush();
  const open = () => act(async () => document.querySelector('[aria-label="More actions for Test"]').click());
  await open();
  await act(async () => [...document.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent.startsWith('Change status')).click());
  await act(async () => [...document.querySelectorAll('[role="menuitemradio"]')].find((b) => b.textContent === 'Done').click());
  expect(onStatus).toHaveBeenCalledWith('DONE');
  await open();
  await act(async () => button('Assign to me').click());
  expect(h.update).toHaveBeenCalledWith(11, { assigned_to: 10, version: 3 });
  await open();
  await act(async () => [...document.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent.startsWith('Copy key')).click());
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith('AM-11');
  await open();
  await act(async () => button('Add flag').click());
  expect(h.flag).toHaveBeenCalledWith(11, true);
  expect(onChanged).toHaveBeenCalled();
});

test('history shows who changed what, from what to what', async () => {
  h.history = jest.fn(async () => ({ data: [
    { id: 2, activity: 'Task Updated', user_name: 'Ruchika Pal', created_at: new Date(Date.now() - 5 * 60000).toISOString(), changes: { status: { before: 'TODO', after: 'IN_PROGRESS' }, assigned_to: { before: 12, after: 10 } } },
    { id: 1, activity: 'Flag Added', user_name: 'Navneet Kumar', created_at: '2026-11-01T10:00:00Z', changes: null, note: null },
  ] }));
  await act(async () => r.render(<TaskHistory taskId={11} members={[{ id: 10, name: 'Navneet Kumar' }, { id: 12, name: 'Ruchika Pal' }]} />));
  await flush();
  expect(c.textContent).toContain('Ruchika Pal task updated · 5 min ago');
  expect(c.textContent).toContain('Status: To Do → In Progress');
  expect(c.textContent).toContain('Assignee: Ruchika Pal → Navneet Kumar');
  expect(c.textContent).toContain('Navneet Kumar flag added');
  expect(ago(Date.now() - 3 * 3600000)).toBe('3 h ago');
});

test('Ctrl+K shows recently opened tasks before anything is typed', async () => {
  const now = Date.now();
  rememberTask({ id: 7, title: 'ViewAssignItAssetList search box', status: 'IN_PROGRESS' });
  rememberTask({ id: 11, title: 'Test', status: 'TODO' });
  expect(whenLabel(now, now)).toBe('Today');
  expect(whenLabel(now - 86400000, now)).toBe('Yesterday');
  expect(whenLabel(now - 3 * 86400000, now)).toBe('This week');
  await act(async () => r.render(<MemoryRouter><CommandPalette navGroups={[]} onClose={() => {}} onCreate={() => {}} /></MemoryRouter>));
  await flush();
  const options = [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent);
  expect(document.body.textContent).toContain('Recent');
  expect(options.slice(1, 3)).toEqual(['TestAM-11 · Today', 'ViewAssignItAssetList search boxAM-7 · Today']);
});

test('Assign to me sits at the top of the task window, and the I key does the same', async () => {
  h.update = jest.fn(async () => ({ data: { version: 4 } }));
  h.getDetail = jest.fn(async (id) => ({ data: { ...task, id, assigned_to: 10, version: 4 } }));
  await act(async () => r.render(<Window />));
  await flush();
  const top = document.querySelector('header');
  expect([...top.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Assign to me')).toBe(true);
  await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', bubbles: true })); });
  await flush();
  expect(h.update).toHaveBeenCalledWith(11, expect.objectContaining({ assigned_to: 10 }));
});
