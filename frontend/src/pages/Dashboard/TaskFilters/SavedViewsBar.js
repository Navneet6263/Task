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

  const renameView = (saved) => {
    const name = window.prompt('Rename view', saved.name)?.trim().slice(0, 32);
    if (name && !savedViews.some((item) => item.id !== saved.id && item.name.toLowerCase() === name.toLowerCase())) {
      persist(savedViews.map((item) => (item.id === saved.id ? { ...item, name } : item)));
    }
  };
  const toggleDefault = (saved) => {
    try {
      const id = defaultId === saved.id ? '' : saved.id;
      localStorage.setItem(`${storageKey}:default`, id);
      setDefaultId(id);
    } catch { alert('Could not save the default view.'); }
  };

  return (
    <div className="relative z-[90] flex items-center gap-2">
      <div className="relative" ref={menuRef}>
        <button type="button" aria-expanded={menuOpen} onClick={() => setMenuOpen((current) => !current)}
          className={`flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold ${menuOpen ? 'border-accent/60 bg-accent-soft text-accent' : 'border-line bg-surface text-muted hover:text-ink'}`}>
          Saved views <span className="rounded-full bg-subtle px-1.5 font-mono text-[10px] text-muted">{savedViews.length}</span><span aria-hidden="true">&#8964;</span>
        </button>
        {menuOpen && (
          <div className="absolute left-0 top-[calc(100%+8px)] z-[120] w-[250px] rounded-md border border-line bg-surface p-1.5 shadow-pop">
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Your saved views</p>
            {!savedViews.length && <p className="rounded bg-subtle px-3 py-3 text-xs text-muted">No saved views yet. Save your current setup to find it here.</p>}
            {savedViews.map((saved) => (
              <div key={saved.id} className="flex items-center rounded hover:bg-subtle">
                <button type="button" onClick={() => applyView(saved)} className="min-w-0 flex-1 truncate px-2.5 py-2 text-left text-xs font-semibold">{saved.name}</button>
                <button type="button" className="px-1.5 text-xs text-muted hover:text-ink" onClick={() => renameView(saved)}>Rename</button>
                <button type="button" title="Open this view automatically for this team" aria-label={`Make ${saved.name} the default view`} aria-pressed={defaultId === saved.id}
                  className={`px-1.5 text-sm ${defaultId === saved.id ? 'text-warn' : 'text-muted hover:text-ink'}`} onClick={() => toggleDefault(saved)}>{defaultId === saved.id ? '\u2605' : '\u2606'}</button>
                <button type="button" aria-label={`Delete ${saved.name} view`} onClick={() => window.confirm(`Delete saved view ${saved.name}?`) && persist(savedViews.filter((item) => item.id !== saved.id))}
                  className="px-2 py-2 text-muted hover:text-danger">&times;</button>
              </div>
            ))}
          </div>
        )}
      </div>
      <button type="button" title="Choose the filters and layout you want to reopen later with one click." onClick={() => setDialogOpen(true)}
        className="h-8 rounded-md border border-dashed border-accent/60 bg-surface px-2.5 text-xs font-semibold text-accent hover:bg-accent-soft">
        + Save view
      </button>
      <SavedViewDialog members={members} clientNameOptions={clientNameOptions} open={dialogOpen} filters={filters} focusMode={focusMode} onClose={() => setDialogOpen(false)} onSave={saveCurrent} />
    </div>
  );
};

export default SavedViewsBar;
