import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import DeveloperTab from './DeveloperTab';

const h = {};
jest.mock('../../../services/api', () => ({ __esModule: true, default: { get: (...a) => h.get(...a), post: (...a) => h.post(...a), delete: (...a) => h.delete(...a), patch: (...a) => h.patch(...a) } }));
jest.mock('../../../services/feedback', () => ({ notify: () => {} }));

const STATUS = {
  enabled: true, organization: { id: 4, name: 'Acme' }, rate_per_minute: 60,
  scopes: { 'tasks:read': 'Read tasks', 'tasks:write': 'Create and update tasks', 'users:read': 'Read people and teams' },
  events: { 'task.created': 'A task is created', 'task.completed': 'A task is marked done' },
};
let c, r;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; c = document.createElement('div'); document.body.append(c); r = createRoot(c); });
afterEach(() => { act(() => r.unmount()); c.remove(); });
const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent === text);
const type = (el, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); };

test('when the module is off, admins are told to ask for it and see no keys', async () => {
  h.get = jest.fn(async () => ({ data: { ...STATUS, enabled: false } }));
  await act(async () => r.render(<DeveloperTab />));
  expect(c.textContent).toContain('Developer API is off for this company');
  expect(h.get).toHaveBeenCalledTimes(1);
});

test('the guide shows this company\'s API address and the steps', async () => {
  h.get = jest.fn(async () => ({ data: STATUS }));
  await act(async () => r.render(<DeveloperTab />));
  expect(c.textContent).toContain('Create a key for the software you are connecting');
  expect(c.textContent).toMatch(/\/api\/v1/);
  expect(c.textContent).toContain('external_id');
});

test('a new key is shown once with a ready test command, then only its prefix', async () => {
  h.get = jest.fn(async (path) => ({ data: path === '/developer/status' ? STATUS : [] }));
  h.post = jest.fn(async () => ({ data: { id: 1, name: 'CRM', key: 'gt_live_abcdef123456_SECRETSECRETSECRETSECRETSECRETSECRETSECRET1', prefix: 'gt_live_abcdef123456', scopes: ['tasks:read'] } }));
  await act(async () => r.render(<DeveloperTab />));
  await act(async () => button('API keys').click());
  await act(async () => button('Create your first key').click());
  act(() => type(document.querySelector('[role="dialog"] input'), 'CRM'));
  const write = [...document.querySelectorAll('[role="dialog"] label')].find((l) => l.textContent.includes('tasks:write')).querySelector('input');
  await act(async () => write.click());
  await act(async () => button('Create key').click());
  expect(h.post).toHaveBeenCalledWith('/developer/keys', expect.objectContaining({ name: 'CRM', scopes: ['tasks:read'], expires_in_days: 365 }));
  expect(document.body.textContent).toContain('it will never be shown again');
  expect(document.body.textContent).toContain('SECRETSECRET');
  expect(document.body.textContent).toContain('curl');
});
