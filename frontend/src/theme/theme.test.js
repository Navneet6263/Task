import { applyTheme, readPreference, resolveTheme, savePreference } from './theme';

afterEach(() => { localStorage.clear(); document.documentElement.classList.remove('dark'); });

test('an explicit choice wins and is remembered', () => {
  savePreference('dark');
  expect(readPreference()).toBe('dark');
  expect(document.documentElement.classList.contains('dark')).toBe(true);
  savePreference('light');
  expect(document.documentElement.classList.contains('dark')).toBe(false);
});

test('unknown or missing values fall back to the system setting', () => {
  localStorage.setItem('theme_preference', 'purple');
  expect(readPreference()).toBe('system');
  // jsdom has no matchMedia, so "system" resolves to light instead of throwing.
  expect(resolveTheme('system')).toBe('light');
  expect(applyTheme('system')).toBe('light');
});
