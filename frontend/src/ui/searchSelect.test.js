import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import SearchSelect, { searchOptions } from './SearchSelect';

const opts = ['KC Kicks Ltd', 'OG Kicks Ltd', 'Kicksmart Ltd', 'Brainz Digital Ltd'].map((n, i) => ({ value: i + 1, label: n, hint: i < 2 ? 'Ratnam & Co Ltd' : '' }));

test('search matches words in any order, names that start with the text come first, and the agent counts', () => {
  expect(searchOptions(opts, 'kicks').map((o) => o.label)).toEqual(['Kicksmart Ltd', 'KC Kicks Ltd', 'OG Kicks Ltd']);
  expect(searchOptions(opts, 'ltd kc').map((o) => o.label)).toEqual(['KC Kicks Ltd']);
  expect(searchOptions(opts, 'ratnam').map((o) => o.label)).toEqual(['KC Kicks Ltd', 'OG Kicks Ltd']);
  expect(searchOptions(opts, '  ')).toHaveLength(4);
});

test('a long list shows the first 60 and says how many more, and arrow keys + Enter pick', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const c = document.createElement('div'); document.body.append(c); const r = createRoot(c);
  const many = Array.from({ length: 470 }, (_, i) => ({ value: String(i), label: `Client ${String(i).padStart(3, '0')} Ltd` }));
  const onChange = jest.fn();
  await act(async () => r.render(<SearchSelect id="s" value="" onChange={onChange} options={many} />));
  const box = c.querySelector('#s');
  act(() => { box.focus(); box.dispatchEvent(new FocusEvent('focus')); });
  expect(c.querySelectorAll('[role="option"]')).toHaveLength(60);
  expect(c.textContent).toContain('410 more. Keep typing to narrow it down.');
  act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(box, '12'); box.dispatchEvent(new Event('input', { bubbles: true })); });
  act(() => box.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
  act(() => box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  // "Client 120…129" start a word with 12, so they come before "Client 012"; one step down is 121.
  expect(onChange).toHaveBeenCalledWith('121');
  act(() => r.unmount()); c.remove();
});
