import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ItemChip from './ItemChip';
import { toItems } from './items';

let c, r;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; c = document.createElement('div'); document.body.append(c); r = createRoot(c); });
afterEach(() => { act(() => r.unmount()); c.remove(); });

test('a task on the calendar says Open, shows who created it on hover, and opens on click', async () => {
  const [task] = toItems({ tasks: [{ id: 42, title: 'Payroll October', status: 'TODO', priority: 'HIGH', due_date: '2099-10-30', assigned_to_name: 'Asha Rao', created_by_name: 'Navneet', client_name: 'Riverside Motors', team_name: 'Accounts' }] });
  const onOpen = jest.fn();
  await act(async () => r.render(<ItemChip item={task} onOpen={onOpen} />));
  expect(c.textContent).toContain('Open');
  await act(async () => { c.querySelector('span').dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); await new Promise((res) => setTimeout(res, 300)); });
  const card = document.querySelector('[role="tooltip"]');
  expect(card.textContent).toContain('Created by');
  expect(card.textContent).toContain('Navneet');
  expect(card.textContent).toContain('Riverside Motors');
  await act(async () => c.querySelector('button').click());
  expect(onOpen).toHaveBeenCalledWith(task);
});
