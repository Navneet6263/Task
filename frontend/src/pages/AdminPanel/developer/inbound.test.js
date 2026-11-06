import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Inbound from './Inbound';

const h = {};
jest.mock('../../../services/api', () => ({ __esModule: true, default: { get: (...a) => h.get(...a), post: (...a) => h.post(...a), patch: (...a) => h.patch(...a), delete: () => Promise.resolve({}) } }));
jest.mock('../../../services/feedback', () => ({ notify: () => {} }));

const STATUS = { inbound_batch: 50, inbound_fields: [{ key: 'title', label: 'Task title', always: true }, { key: 'external_id', label: 'Their record id' }, { key: 'due_date', label: 'Due date' }] };
let c, r;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; c = document.createElement('div'); document.body.append(c); r = createRoot(c); });
afterEach(() => { act(() => r.unmount()); c.remove(); });
const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent === text);
const flush = () => act(async () => { await new Promise((res) => setTimeout(res, 350)); });

test('match their fields on the sample, see the preview, and go live', async () => {
  const hook = { id: 5, name: 'Helpdesk', source: 'helpdesk', token_prefix: 'gti_abc', listening: true, is_active: true, has_sample: true };
  h.get = jest.fn(async (path) => (path === '/developer/inbound' ? { data: [hook] } : {
    data: { ...hook, mapping: {}, required: [], team_id: null, teams: [{ id: 7, name: 'Payroll' }], events: [],
      sample: { ticket: { subject: 'Printer jam', id: 'T-9' } }, paths: [{ path: 'ticket.subject', sample: 'Printer jam' }, { path: 'ticket.id', sample: 'T-9' }] },
  }));
  h.post = jest.fn(async () => ({ data: { body: { title: 'Printer jam', external_id: 'T-9' }, problems: [] } }));
  h.patch = jest.fn(async () => ({ data: {} }));
  await act(async () => r.render(<Inbound status={STATUS} />));
  expect(c.textContent).toContain('Sample received · not live');
  await act(async () => button('Match fields').click());
  const pick = async (label, value) => act(async () => { const el = document.querySelector(`[aria-label="Field for ${label}"]`); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await pick('Task title', 'ticket.subject');
  await pick('Their record id', 'ticket.id');
  await flush();
  expect(h.post).toHaveBeenLastCalledWith('/developer/inbound/5/preview', { mapping: { title: 'ticket.subject', external_id: 'ticket.id' }, required: [] });
  expect(document.body.textContent).toContain('Printer jam');
  await act(async () => button('Save and go live').click());
  expect(h.patch).toHaveBeenCalledWith('/developer/inbound/5', { mapping: { title: 'ticket.subject', external_id: 'ticket.id' }, required: [], team_id: 7, listening: false });
});
