import React, { useEffect, useRef, useState } from 'react';
import SavedViewDialog from './SavedViewDialog';
import { preferenceKey } from '../../../services/preferences';

const FILTER_DEFAULTS = {
  priorities: [], assignees: [], statuses: [], issueTypes: [], clientNames: [],
  search: '', createdFrom: '', createdTo: '',
};

const readViews = (key) => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.slice(0, 10) : [];
  } catch {
    return [];
  }
};

const buildFilterSnapshot = (filters, included) => {
  const snapshot = {};
  Object.keys(FILTER_DEFAULTS).forEach((key) => {
    const field = ['createdFrom', 'createdTo'].includes(key) ? 'dates' : key;
    if (included.includes(field)) snapshot[key] = filters[key];
  });
  return snapshot;
};

const SavedViewsBar = ({ teamId, userId, view, setView, focusMode, setFocusMode, filters, setters, members, clientNameOptions }) => {
  const storageKey = preferenceKey(`saved-views:${teamId || 'team'}`);
  const [savedViews, setSavedViews] = useState(() => readViews(storageKey));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const applyRef = useRef(null);
  const [defaultId, setDefaultId] = useState('');

  useEffect(() => {
    const legacy = `greentask:saved-views:${userId || 'user'}:${teamId || 'team'}`;
    if (!localStorage.getItem(storageKey) && !localStorage.getItem('company_token')) {
      const previous = readViews(legacy);
      if (previous.length) { try { localStorage.setItem(storageKey, JSON.stringify(previous)); } catch {} }
    }
    setSavedViews(readViews(storageKey));
  }, [storageKey, teamId, userId]);
  useEffect(() => {
    const closeMenu = (event) => !menuRef.current?.contains(event.target) && setMenuOpen(false);
    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, []);

  const persist = (next) => {
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setSavedViews(next); return true; }
    catch { alert('Browser storage is unavailable. This view was not saved.'); return false; }
  };

  const saveCurrent = ({ name, includedFields, filters: chosenFilters }) => {
    if (savedViews.some(item => item.name.toLowerCase() === name.toLowerCase()) && !window.confirm('Replace the existing view with this name?')) return;
    const snapshot = {
      id: savedViews.find(item => item.name.toLowerCase() === name.toLowerCase())?.id || `${Date.now()}`,
      name,
      includedFields,
      filters: buildFilterSnapshot(chosenFilters || filters, includedFields),
      ...(includedFields.includes('focusMode') ? { focusMode } : {}),
      ...(includedFields.includes('view') ? { view } : {}),
    };
    if (!persist([snapshot, ...savedViews.filter((item) => item.name.toLowerCase() !== name.toLowerCase())].slice(0, 10))) return;
    setDialogOpen(false);
  };

  const applyView = (saved) => {
    const isLegacy = !Array.isArray(saved.includedFields);
    Object.entries(FILTER_DEFAULTS).forEach(([key, empty]) => setters[key]?.(saved.filters?.[key] ?? empty));
    setFocusMode(isLegacy || saved.includedFields.includes('focusMode') ? saved.focusMode || '' : '');
    if (isLegacy || saved.includedFields.includes('view')) setView(saved.view || 'list');
    setMenuOpen(false);
  };

  applyRef.current = applyView;
  useEffect(() => {
    const id = localStorage.getItem(`${storageKey}:default`) || '';
    setDefaultId(id);
    const saved = readViews(storageKey).find(item => item.id === id);
    if (saved) applyRef.current(saved);
  }, [storageKey]);

  return (
    <div className="relative z-[90] flex items-center gap-2">
      <div className="relative" ref={menuRef}>
        <button type="button" aria-expanded={menuOpen} onClick={() => setMenuOpen((current) => !current)} className={`flex h-8 items-center gap-1.5 rounded-xl border px-3 text-[11px] font-bold transition ${menuOpen ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300'}`}>
          Saved views <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">{savedViews.length}</span><span aria-hidden="true">⌄</span>
        </button>
        {menuOpen && (
          <div className="absolute left-0 top-[calc(100%+9px)] z-[120] w-[230px] rounded-xl border border-slate-200 bg-white p-2 shadow-[0_18px_45px_rgba(15,23,42,0.20)]">
            <p className="px-2 pb-1.5 text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-400">Your saved views</p>
            {!savedViews.length && <p className="rounded-lg bg-slate-50 px-3 py-3 text-[10px] leading-relaxed text-slate-500">No saved views yet. Save your current setup to find it here.</p>}
            {savedViews.map((saved) => (
              <div key={saved.id} className="flex items-center rounded-lg hover:bg-indigo-50"><button type="button" onClick={() => applyView(saved)} className="min-w-0 flex-1 truncate px-2.5 py-2 text-left text-[11px] font-bold text-slate-700">{saved.name}</button><button type="button" className="px-2 text-xs text-blue-600" onClick={() => { const name = window.prompt('Rename view', saved.name)?.trim().slice(0, 32); if (name && !savedViews.some(item => item.id !== saved.id && item.name.toLowerCase() === name.toLowerCase())) persist(savedViews.map(item => item.id === saved.id ? { ...item, name } : item)); }}>Rename</button><button type="button" title="Open this view automatically for this team" className="px-2 text-xs text-indigo-700" onClick={() => { try { const id = defaultId === saved.id ? '' : saved.id; localStorage.setItem(`${storageKey}:default`, id); setDefaultId(id); } catch { alert('Could not save the default view.'); } }}>{defaultId === saved.id ? '★' : '☆'}</button><button type="button" aria-label={`Delete ${saved.name} view`} onClick={() => window.confirm(`Delete saved view ${saved.name}?`) && persist(savedViews.filter((item) => item.id !== saved.id))} className="px-2 py-2 text-slate-400 hover:text-red-600">×</button></div>
            ))}
          </div>
        )}
      </div>
      <div className="group relative">
        <button type="button" aria-describedby="saved-view-help" onClick={() => setDialogOpen(true)} className="h-8 rounded-xl border border-dashed border-indigo-300 bg-white px-2.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-50 focus:outline-none focus:ring-4 focus:ring-indigo-500/10">+ Save view</button>
        <div id="saved-view-help" role="tooltip" className="pointer-events-none absolute bottom-[calc(100%+10px)] left-0 z-[100] w-[250px] translate-y-1 rounded-xl border border-slate-200 bg-slate-900 px-3.5 py-3 text-left opacity-0 shadow-[0_16px_38px_rgba(15,23,42,0.28)] transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
          <span className="block text-[11px] font-extrabold text-white">Why save this view?</span>
          <span className="mt-1 block text-[10px] font-medium leading-relaxed text-slate-300">Choose the filters and layout you want to reopen later with one click.</span>
          <i className="absolute -bottom-1.5 left-5 h-3 w-3 rotate-45 border-b border-r border-slate-700 bg-slate-900" />
        </div>
      </div>
      <SavedViewDialog members={members} clientNameOptions={clientNameOptions} open={dialogOpen} filters={filters} focusMode={focusMode} onClose={() => setDialogOpen(false)} onSave={saveCurrent} />
    </div>
  );
};

export default SavedViewsBar;
