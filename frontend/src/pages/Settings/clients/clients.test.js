import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ClientsSection from './ClientsSection';
import ClientPicker from '../../../components/clients/ClientPicker';
import { announceClientsChange } from '../../../components/clients/useClients';

const h = {};
jest.mock('../../../services/api', () => ({
  clients: {
    list: (...a) => h.list(...a), create: (...a) => h.create(...a), update: (...a) => h.update(...a), setPickOnly: (...a) => h.setPickOnly(...a),
  },
}));

const sample = (pickOnly, canManage) => ({ data: { pick_only: pickOnly, can_manage: canManage, clients: [
  { id: 1, name: 'Riverside Motors', is_active: true, source: 'task', task_count: 6, open_tasks: 2, hours: 12.5, last_used: '2026-10-18T10:00:00Z', created_at: '2026-09-01T00:00:00Z' },
  { id: 2, name: 'Old Co', is_active: false, source: null, task_count: 0, open_tasks: 0, hours: 0, last_used: null, created_at: '2026-09-01T00:00:00Z' },
] } });
let c, r;
const type = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text || b.textContent.includes(text));
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; c = document.createElement('div'); document.body.append(c); r = createRoot(c); announceClientsChange(); });
afterEach(() => { act(() => r.unmount()); c.remove(); });

test('managers add clients and switch the pick-only rule from Settings', async () => {
  h.list = jest.fn(async () => sample(false, true));
  h.create = jest.fn(async (name) => ({ data: { id: 3, name } }));
  h.setPickOnly = jest.fn(async () => ({ data: {} }));
  await act(async () => r.render(<ClientsSection />));
  expect(c.textContent).toContain('should they pick the client only from this list?');
  expect(c.textContent).toContain('Riverside Motors');
  expect(c.textContent).not.toContain('Old Co');
  act(() => type(c.querySelector('[aria-label="Client name"]'), 'Acme Pvt Ltd'));
  await act(async () => c.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(h.create).toHaveBeenCalledWith('Acme Pvt Ltd');
  await act(async () => button('Yes — only from this list').click());
  expect(h.setPickOnly).toHaveBeenCalledWith(true);
});

test('with pick-only on, employees get a dropdown and managers can add inline', async () => {
  h.list = jest.fn(async () => sample(true, false));
  await act(async () => r.render(<ClientPicker id="x" value="" onChange={() => {}} />));
  expect(c.querySelector('#x').tagName).toBe('SELECT');
  expect([...c.querySelectorAll('#x option')].map((o) => o.textContent)).toEqual(['-Select client-', 'Riverside Motors']);
  expect(c.textContent).toContain('Client names are added by your manager or admin.');
  act(() => r.unmount()); r = createRoot(c); announceClientsChange();
  h.list = jest.fn(async () => sample(true, true));
  await act(async () => r.render(<ClientPicker id="x" value="" onChange={() => {}} />));
  expect(button('+ Add a new client')).toBeTruthy();
});
