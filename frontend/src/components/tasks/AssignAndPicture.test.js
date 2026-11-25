import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AssignToMe, { canTake } from './AssignToMe';
import TaskPicture, { readPicture } from './TaskPicture';

const h = {};
jest.mock('../../services/api', () => ({ tasks: { update: (...a) => h.update(...a) } }));
jest.mock('../../services/feedback', () => ({ notify: (...a) => h.notify(...a) }));

let c, r;
const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  h.notify = jest.fn();
  localStorage.setItem('user', JSON.stringify({ id: 5, name: 'Asha' }));
  c = document.createElement('div'); document.body.append(c); r = createRoot(c);
});
afterEach(() => { act(() => r.unmount()); c.remove(); localStorage.clear(); });

test('Assign to me shows on open tasks that are not yours and takes the task in one click', async () => {
  expect(canTake({ assigned_to: null, status: 'TODO' })).toBe(true);
  expect(canTake({ assigned_to: 9, status: 'IN_PROGRESS' })).toBe(true);
  expect(canTake({ assigned_to: 5, status: 'TODO' })).toBe(false);
  expect(canTake({ assigned_to: null, status: 'DONE' })).toBe(false);

  h.update = jest.fn(async () => ({ data: {} }));
  const onDone = jest.fn(); const onCard = jest.fn();
  await act(async () => r.render(<div onClick={onCard}><AssignToMe task={{ id: 40, title: 'VAT return', assigned_to: null, status: 'TODO', version: 3 }} onDone={onDone} /></div>));
  await act(async () => { button('Assign to me').click(); });
  expect(h.update).toHaveBeenCalledWith(40, { assigned_to: 5, version: 3 });
  expect(onDone).toHaveBeenCalled();
  expect(onCard).not.toHaveBeenCalled();
  expect(h.notify).toHaveBeenCalledWith('"VAT return" is now yours.', 'success');
});

test('a task changed by someone else just now is not taken over silently', async () => {
  h.update = jest.fn(async () => { throw Object.assign(new Error('x'), { response: { status: 409 } }); });
  await act(async () => r.render(<AssignToMe task={{ id: 40, title: 'VAT return', assigned_to: null, status: 'TODO', version: 3 }} />));
  await act(async () => { button('Assign to me').click(); });
  expect(h.notify).toHaveBeenCalledWith('This task changed just now. Refresh and try again.');
});

test('pictures must be PNG, JPG, WEBP or GIF and at most 450 KB', () => {
  const done = jest.fn();
  readPicture(new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' }), done);
  expect(h.notify).toHaveBeenLastCalledWith('Pick a PNG, JPG, WEBP or GIF picture.');
  readPicture(new File([new Uint8Array(450 * 1024 + 1)], 'big.png', { type: 'image/png' }), done);
  expect(h.notify).toHaveBeenLastCalledWith('This picture is over 450 KB. Please pick a smaller one or compress it first.');
  expect(done).not.toHaveBeenCalled();
});

test('the task window can add, replace and remove a picture', async () => {
  const onChange = jest.fn();
  await act(async () => r.render(<TaskPicture value="" onChange={onChange} />));
  expect(button('Add picture (PNG, JPG, WEBP or GIF, up to 450 KB)')).toBeTruthy();

  await act(async () => r.render(<TaskPicture value="data:image/png;base64,AAAA" onChange={onChange} />));
  expect(c.querySelector('img').getAttribute('src')).toBe('data:image/png;base64,AAAA');
  expect(button('Replace')).toBeTruthy();
  await act(async () => { button('Remove').click(); });
  expect(c.textContent).toContain('Remove the picture?');
  await act(async () => { [...c.querySelectorAll('button')].filter((b) => b.textContent === 'Remove').pop().click(); });
  expect(onChange).toHaveBeenCalledWith('');
});
