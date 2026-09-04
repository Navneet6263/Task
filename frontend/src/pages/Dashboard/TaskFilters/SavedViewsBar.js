import React, { useEffect, useMemo, useState } from 'react';

const EMPTY_LIST = [];
const cleanName = (value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 32);

const readViews = (key) => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.slice(0, 10) : EMPTY_LIST;
  } catch {
    return EMPTY_LIST;
  }
};

const SavedViewsBar = ({ teamId, userId, view, setView, focusMode, setFocusMode, filters, setters }) => {
  const storageKey = useMemo(() => `greentask:saved-views:${userId || 'user'}:${teamId || 'team'}`, [teamId, userId]);
  const [savedViews, setSavedViews] = useState(() => readViews(storageKey));
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => setSavedViews(readViews(storageKey)), [storageKey]);

  const persist = (next) => {
    setSavedViews(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  const saveCurrent = () => {
    const label = cleanName(name);
    if (!label) return;
    const snapshot = {
      id: `${Date.now()}`,
      name: label,
      view,
      focusMode,
      filters: {
        priorities: filters.priorities,
        assignees: filters.assignees,
        statuses: filters.statuses,
        issueTypes: filters.issueTypes,
        clientNames: filters.clientNames,
        search: filters.search,
        createdFrom: filters.createdFrom,
        createdTo: filters.createdTo,
      },
    };
    persist([snapshot, ...savedViews.filter((item) => item.name.toLowerCase() !== label.toLowerCase())].slice(0, 10));
    setName('');
    setSaving(false);
  };

  const applyView = (saved) => {
    Object.entries(saved.filters || {}).forEach(([key, value]) => setters[key]?.(value));
    setFocusMode(saved.focusMode || '');
    setView(saved.view || 'list');
  };

  return (
    <div className="relative z-10 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/70 px-2.5 py-2">
      <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Saved Views</span>
      {savedViews.map((saved) => (
        <span key={saved.id} className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <button type="button" onClick={() => applyView(saved)} className="px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:text-indigo-700">{saved.name}</button>
          <button type="button" aria-label={`Delete ${saved.name} view`} onClick={() => persist(savedViews.filter((item) => item.id !== saved.id))} className="border-l border-slate-200 px-2 text-slate-400 hover:bg-red-50 hover:text-red-600">×</button>
        </span>
      ))}
      {saving ? (
        <div className="inline-flex gap-1">
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && saveCurrent()} placeholder="View name" className="h-8 w-32 rounded-lg border border-indigo-200 px-2 text-[11px] outline-none focus:border-indigo-500" />
          <button type="button" disabled={!cleanName(name)} onClick={saveCurrent} className="h-8 rounded-lg bg-indigo-600 px-2.5 text-[11px] font-bold text-white disabled:opacity-40">Save</button>
          <button type="button" onClick={() => setSaving(false)} className="h-8 px-2 text-[11px] font-bold text-slate-500">Cancel</button>
        </div>
      ) : (
        <button type="button" onClick={() => setSaving(true)} className="h-8 rounded-lg border border-dashed border-indigo-300 px-2.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-50">+ Save current view</button>
      )}
    </div>
  );
};

export default SavedViewsBar;
