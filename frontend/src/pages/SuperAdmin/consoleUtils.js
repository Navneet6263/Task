import axios from 'axios';
import { SA_BASE_URL } from '../../services/runtimeConfig';

// Platform admin API. The token is read on every request so a fresh sign-in is picked up.
export const saApi = axios.create({ baseURL: SA_BASE_URL });
saApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('sa_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const saUser = () => { try { return JSON.parse(localStorage.getItem('sa_user') || '{}'); } catch { return {}; } };

// Per-admin console settings (layout, last page). Browser only, safe when storage is blocked.
const prefKey = (name) => `sa:${saUser().email || 'admin'}:${name}`;
export const readConsolePref = (name, fallback) => { try { return JSON.parse(localStorage.getItem(prefKey(name))) ?? fallback; } catch { return fallback; } };
export const writeConsolePref = (name, value) => { try { localStorage.setItem(prefKey(name), JSON.stringify(value)); } catch { /* storage blocked */ } };

export const errorOf = (error, fallback) => error?.response?.data?.error || fallback;

// Company registration details are stored as "Label: value" lines.
export function parseCompanyProfile(description) {
  const values = {};
  let summary = '';
  String(description || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => {
    const index = line.indexOf(':');
    if (index === -1) return;
    const label = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (!label) return;
    values[label] = value || '-';
    if (label.toLowerCase() === 'primary description') summary = value || '';
  });
  return { summary, values };
}

export const initials = (name) => {
  const parts = String(name || '').split(/[\s@.]+/).filter(Boolean);
  return parts.length ? (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase() : 'SA';
};

export const dateLabel = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const dateTimeLabel = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export const timeAgo = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} h ago`;
  if (minutes < 10080) return `${Math.round(minutes / 1440)} d ago`;
  return dateLabel(value);
};

export const STATUS_TONE = { pending: 'warn', approved: 'ok', rejected: 'danger' };
export const ACTION_LABEL = {
  LOGIN: 'Signed in', VIEW_DASHBOARD: 'Opened console', APPROVE_COMPANY: 'Approved company', REJECT_COMPANY: 'Rejected company',
  UPDATE_LIMITS: 'Changed limits', ENABLE_MODULE: 'Turned module on', DISABLE_MODULE: 'Turned module off',
  ADD_SUB_USER: 'Gave access', REMOVE_SUB_USER: 'Removed access', LOGIN_FAILED: 'Failed sign-in', SET_PASSWORD: 'Set password', RESEND_INVITE: 'Sent setup link',
};
export const ACTION_TONE = {
  APPROVE_COMPANY: 'ok', ENABLE_MODULE: 'ok', ADD_SUB_USER: 'info', REJECT_COMPANY: 'danger', DISABLE_MODULE: 'warn',
  REMOVE_SUB_USER: 'danger', UPDATE_LIMITS: 'info', LOGIN_FAILED: 'danger', SET_PASSWORD: 'ok', RESEND_INVITE: 'info',
};
export const actionLabel = (action) => ACTION_LABEL[action] || String(action || '').toLowerCase().replace(/_/g, ' ');
// Routine entries that are hidden from the activity feed unless asked for.
export const ROUTINE_ACTIONS = ['VIEW_DASHBOARD', 'LOGIN'];
