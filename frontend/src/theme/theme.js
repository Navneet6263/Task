// Theme preference: 'light' | 'dark' | 'system'. The resolved theme is applied as the
// `dark` class on <html>; public/index.html applies it before first paint to avoid a flash.
const KEY = 'theme_preference';
const PREFERENCES = ['light', 'dark', 'system'];

export function readPreference() {
  try {
    const value = localStorage.getItem(KEY);
    return PREFERENCES.includes(value) ? value : 'system';
  } catch { return 'system'; }
}

const systemPrefersDark = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export const resolveTheme = (preference) => (preference === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : preference);

export function applyTheme(preference) {
  const resolved = resolveTheme(preference);
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  return resolved;
}

export function savePreference(preference) {
  try { localStorage.setItem(KEY, preference); } catch { /* private mode: theme still applies for this visit */ }
  return applyTheme(preference);
}

export function watchSystemTheme(onChange) {
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  if (!media) return () => {};
  const listener = () => { if (readPreference() === 'system') onChange(applyTheme('system')); };
  media.addEventListener?.('change', listener);
  return () => media.removeEventListener?.('change', listener);
}
