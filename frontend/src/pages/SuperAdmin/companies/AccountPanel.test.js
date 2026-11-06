import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AccountPanel from './AccountPanel';
import NewCompanyModal from './NewCompanyModal';

let c, r;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; c = document.createElement('div'); document.body.append(c); r = createRoot(c); });
afterEach(() => { act(() => r.unmount()); c.remove(); });
const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent === text);
const type = (el, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); };

const detail = { id: 4, name: 'Niraj', email: 'niraj@example.com', status: 'approved', organizations: [{ id: 4, name: 'Niraj Workspace' }] };

test('handing a company over shows the new password once and then opens the new account', async () => {
  const handOver = jest.fn(async () => ({ id: 30, email: 'new@example.com', password: 'Ab3dE-fG7hJ', existing_account: false }));
  const onReplaced = jest.fn();
  await act(async () => r.render(<AccountPanel detail={detail} sa={{ actions: { handOver } }} onReplaced={onReplaced} onRemoved={() => {}} />));
  expect(button('Remove account').disabled).toBe(true);
  await act(async () => button('Change company admin').click());
  const inputs = document.querySelectorAll('[role="dialog"] input:not([type="radio"])');
  act(() => { type(inputs[0], 'New Admin'); type(inputs[2], 'new@example.com'); });
  await act(async () => button('Hand over').click());
  expect(handOver).toHaveBeenCalledWith(detail, expect.objectContaining({ name: 'New Admin', email: 'new@example.com', keep_old_as_admin: false }));
  expect(document.body.textContent).toContain('Ab3dE-fG7hJ');
  await act(async () => button('Done').click());
  expect(onReplaced).toHaveBeenCalledWith(30);
});

test('an account without organizations can be removed', async () => {
  const removeAdmin = jest.fn(async () => true);
  const onRemoved = jest.fn();
  await act(async () => r.render(<AccountPanel detail={{ ...detail, status: 'pending', organizations: [] }} sa={{ actions: { removeAdmin } }} onReplaced={() => {}} onRemoved={onRemoved} />));
  expect(button('Change company admin')).toBeUndefined();
  await act(async () => button('Remove account').click());
  await act(async () => [...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent === 'Remove account').click());
  expect(removeAdmin).toHaveBeenCalledWith(expect.objectContaining({ id: 4 }));
  expect(onRemoved).toHaveBeenCalled();
});

test('a new company is created with the chosen plan and its password is shown', async () => {
  const onCreate = jest.fn(async () => ({ id: 31, email: 'boss@acme.com', password: 'Zx9Yw-Vu8Ts' }));
  await act(async () => r.render(<NewCompanyModal onCreate={onCreate} onClose={() => {}} onDone={() => {}} />));
  const inputs = document.querySelectorAll('[role="dialog"] input');
  act(() => { type(inputs[0], 'Acme'); type(inputs[1], 'Boss'); type(inputs[3], 'boss@acme.com'); });
  await act(async () => [...document.querySelectorAll('button')].find((b) => b.textContent.startsWith('Scale')).click());
  await act(async () => button('Create company').click());
  expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ company_name: 'Acme', email: 'boss@acme.com', max_companies: 10, max_staff_per_company: 500 }));
  expect(document.body.textContent).toContain('Zx9Yw-Vu8Ts');
});
