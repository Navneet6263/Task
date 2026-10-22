import { useEffect, useState } from 'react';
import { taskForm as taskFormApi } from '../../services/api';

// The organization's designed task form, shared by the composer, task detail and settings.
// Cached per organization for a minute; the designer announces saves so open screens refresh.
let cache = null;
const orgKey = () => localStorage.getItem('active_org_id') || 'default';

export function announceTaskFormChange(data) {
  cache = data ? { data, at: Date.now(), org: orgKey() } : null;
  window.dispatchEvent(new Event('task-form-changed'));
}

export default function useTaskFormLayout(enabled = true) {
  const fresh = cache && cache.org === orgKey() && Date.now() - cache.at < 60000;
  const [state, setState] = useState(() => (fresh ? cache.data : null));
  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    const load = (force) => {
      if (!force && cache && cache.org === orgKey() && Date.now() - cache.at < 60000) { setState(cache.data); return; }
      // Wrapped so a missing or failing API falls back to the classic form instead of throwing.
      Promise.resolve().then(() => taskFormApi.get())
        .then((r) => { cache = { data: r.data, at: Date.now(), org: orgKey() }; if (active) setState(r.data); })
        .catch(() => { if (active) setState((prev) => prev || { layout: null, version: 0, can_edit: false, templates: [], failed: true }); });
    };
    load(false);
    const onChange = () => { if (cache?.data && cache.org === orgKey()) setState(cache.data); else load(true); };
    window.addEventListener('task-form-changed', onChange);
    return () => { active = false; window.removeEventListener('task-form-changed', onChange); };
  }, [enabled]);
  return state;
}

// Custom field values arrive from the API as a JSON string.
export const parseCustom = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; }
};

export const localToday = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
