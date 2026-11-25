import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import SignedInDevices, { deviceName } from './SignedInDevices';

const h = {};
jest.mock('../../services/api', () => ({
  accountSessions: {
    list: (...a) => h.list(...a), revoke: (...a) => h.revoke(...a), revokeOthers: (...a) => h.revokeOthers(...a),
  },
}));

const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const rows = () => ({ data: { sessions: [
  { id: 1, current: true, remember: false, ip: '10.0.0.1', user_agent: CHROME_WIN, created_at: '2026-11-24T05:00:00Z', last_seen_at: new Date().toISOString() },
  { id: 2, current: false, remember: true, ip: '49.36.1.2', user_agent: SAFARI_IPHONE, created_at: '2026-11-01T05:00:00Z', last_seen_at: '2026-11-20T05:00:00Z' },
] } });
let c, r;
const button = (text) => [...c.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; c = document.createElement('div'); document.body.append(c); r = createRoot(c); });
afterEach(() => { act(() => r.unmount()); c.remove(); });

test('names devices from their browser in plain words', () => {
  expect(deviceName(CHROME_WIN)).toBe('Chrome on Windows');
  expect(deviceName(SAFARI_IPHONE)).toBe('Safari on iPhone');
  expect(deviceName('')).toBe('Unknown device');
});

test('lists where the account is signed in and signs other devices out', async () => {
  h.list = jest.fn(async () => rows());
  h.revoke = jest.fn(async () => ({ data: { ended: 1 } }));
  h.revokeOthers = jest.fn(async () => ({ data: { ended: 1 } }));
  await act(async () => r.render(<SignedInDevices />));
  expect(c.textContent).toContain('Chrome on Windows');
  expect(c.textContent).toContain('This device');
  expect(c.textContent).toContain('Safari on iPhone');
  expect(c.textContent).toContain('IP 49.36.1.2');
  expect(c.textContent).toContain('ends after 12 hours');

  const signOut = [...c.querySelectorAll('li')].find((li) => li.textContent.includes('iPhone')).querySelector('button');
  expect(signOut.textContent).toBe('Sign out');
  await act(async () => { signOut.click(); });
  expect(h.revoke).toHaveBeenCalledWith(2);

  await act(async () => { button('Sign out all other devices').click(); });
  expect(h.revokeOthers).toHaveBeenCalledTimes(1);
});
