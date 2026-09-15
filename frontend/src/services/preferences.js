import { clearQueryCache } from './queryCache';
export const preferenceKey = (name) => {
  const user = JSON.parse((localStorage.getItem('company_token') ? localStorage.getItem('company_user') : localStorage.getItem('user')) || '{}');
  return `workspace:${localStorage.getItem('active_org_id') || user.org_id || 'org'}:${user.role || 'user'}:${user.id || 'guest'}:${name}`;
};
export const readPreference = (name, fallback) => {
  try { return JSON.parse(localStorage.getItem(preferenceKey(name))) ?? fallback; }
  catch { return fallback; }
};
export const writePreference = (name, value) => {
  try { localStorage.setItem(preferenceKey(name), JSON.stringify(value)); return true; }
  catch { return false; }
};
export const clearAuthentication = () => {
  ['token', 'user', 'company_token', 'company_user', 'active_org_id', 'sa_token', 'sa_user', 'comm_task_context'].forEach(key => localStorage.removeItem(key));
  clearQueryCache();
};
