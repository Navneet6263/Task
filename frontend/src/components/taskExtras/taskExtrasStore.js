import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { taskExtras } from '../../services/api';

// Hues that read well on both the light and the dark theme; chips use them with transparency.
export const LABEL_HEX = {
  green: '#16a34a', blue: '#2563eb', violet: '#7c3aed', pink: '#db2777', red: '#dc2626',
  orange: '#ea580c', amber: '#d97706', teal: '#0d9488', slate: '#64748b',
};

// The organization's task prefix and labels, loaded once and shared by every screen.
let metaPromise = null;
let metaOrg = null;
const activeOrg = () => { try { return localStorage.getItem('active_org_id'); } catch { return null; } };
let metaValue = { prefix: 'TASK', labels: [], colors: Object.keys(LABEL_HEX) };
const listeners = new Set();
const publish = (next) => { metaValue = next; listeners.forEach((fn) => fn(next)); };
export const reloadTaskMeta = () => {
  // Never let a missing or failing call break the screen; cards then just show no extras.
  metaPromise = Promise.resolve().then(() => taskExtras.meta()).then(({ data }) => { publish({ ...metaValue, ...data }); return data; }).catch(() => metaValue);
  return metaPromise;
};
export const resetTaskMetaCache = () => { metaPromise = null; metaValue = { prefix: 'TASK', labels: [], colors: Object.keys(LABEL_HEX) }; };

export function useTaskMeta() {
  const [meta, setMeta] = useState(metaValue);
  useEffect(() => {
    listeners.add(setMeta);
    // A different organization has its own prefix and labels.
    if (!metaPromise || metaOrg !== activeOrg()) { metaOrg = activeOrg(); reloadTaskMeta(); }
    return () => listeners.delete(setMeta);
  }, []);
  const keyOf = useCallback((id) => `${meta.prefix}-${id}`, [meta.prefix]);
  return { ...meta, keyOf, reload: reloadTaskMeta };
}

// Badges for the cards on screen: one request for all visible tasks.
const SummaryContext = createContext({ get: () => null, reload: () => {} });

export function TaskExtrasProvider({ tasks, children }) {
  const [map, setMap] = useState({});
  const [tick, setTick] = useState(0);
  const idsKey = (tasks || []).map((t) => t.id).filter(Boolean).slice(0, 200).join(',');
  useEffect(() => {
    if (!idsKey) { setMap({}); return undefined; }
    let active = true;
    Promise.resolve().then(() => taskExtras.summary(idsKey.split(','))).then(({ data }) => { if (active) setMap(data || {}); }).catch(() => {});
    return () => { active = false; };
  }, [idsKey, tick]);
  const value = useMemo(() => ({ get: (id) => map[id] || null, reload: () => setTick((n) => n + 1) }), [map]);
  return <SummaryContext.Provider value={value}>{children}</SummaryContext.Provider>;
}

export const useTaskSummary = (id) => useContext(SummaryContext).get(id);
export const useReloadSummaries = () => useContext(SummaryContext).reload;
