import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useDialog from '../../../components/useDialog';
import MultiSelectFilter from './MultiSelectFilter';
import { STATUS_OPTIONS, PRIORITY_OPTIONS, TYPE_OPTIONS } from './filterOptions';

const OPTIONS = [
  { id: 'statuses', label: 'Statuses', note: 'To Do, In Progress, Pending or Done' },
  { id: 'priorities', label: 'Priorities', note: 'High, Medium or Low' },
  { id: 'issueTypes', label: 'Task types', note: 'Task, Bug, Story, Feature or Enhancement' },
  { id: 'assignees', label: 'Members', note: 'Selected assignees' },
  { id: 'clientNames', label: 'Clients', note: 'Selected client names' },
  { id: 'search', label: 'Search text', note: 'Current task search' },
  { id: 'dates', label: 'Created dates', note: 'Created from and created to' },
  { id: 'focusMode', label: 'Focus shortcut', note: 'My Day, Due Today or Overdue' },
  { id: 'view', label: 'Layout', note: 'List, Board or Timeline' },
];

const getDefaults = (filters, focusMode) => {
  const selected = OPTIONS.filter(({ id }) => {
    if (id === 'dates') return filters.createdFrom || filters.createdTo;
    if (id === 'focusMode') return Boolean(focusMode);
    if (id === 'view') return true;
    return Array.isArray(filters[id]) ? filters[id].length > 0 : Boolean(filters[id]);
  }).map(({ id }) => id);
  return selected.length ? selected : ['view'];
};

const SavedViewDialog = ({ open, filters, focusMode, onClose, onSave, members = [], clientNameOptions = [] }) => {
  const latest = useRef({ filters, focusMode });
  latest.current = { filters, focusMode };
  const [name, setName] = useState('');
  const [included, setIncluded] = useState([]);
  const [draft, setDraft] = useState(filters);
  const dialogRef = useDialog(open, onClose);

  useEffect(() => {
    if (!open) return;
    setName('');
    setIncluded(getDefaults(latest.current.filters, latest.current.focusMode));
    setDraft(latest.current.filters);
  }, [open]);

  if (!open || typeof document === 'undefined') return null;
  const toggle = (id) => setIncluded((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const submit = (event) => {
    event.preventDefault();
    const cleanName = name.replace(/\s+/g, ' ').trim().slice(0, 32);
    if (!cleanName || included.length === 0) return;
    onSave({ name: cleanName, includedFields: included, filters: draft });
  };

  return createPortal(
    <div className="fixed inset-0 z-[220] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-[3px]" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form ref={dialogRef} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="save-view-heading" className="w-[min(560px,94vw)] overflow-hidden rounded-[24px] border border-white/80 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.34)]">
        <header className="flex items-start justify-between border-b border-indigo-100 bg-gradient-to-r from-indigo-50 to-blue-50 px-5 py-4">
          <div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-indigo-600">Personal workspace</p><h3 id="save-view-heading" className="mt-1 text-lg font-extrabold text-slate-900">Save current view</h3><p className="mt-1 text-[11px] text-slate-500">Choose exactly what this shortcut should remember.</p></div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-lg text-slate-500">×</button>
        </header>

        <div className="max-h-[65vh] overflow-y-auto px-5 py-4">
          <label className="block"><span className="text-xs font-bold text-slate-700">View name</span><input autoFocus maxLength={32} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. My urgent bugs" className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3.5 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10" /></label>
          <div className="mt-4 flex items-center justify-between"><span className="text-xs font-extrabold text-slate-800">What should be saved?</span><button type="button" onClick={() => setIncluded(included.length === OPTIONS.length ? [] : OPTIONS.map((item) => item.id))} className="text-[10px] font-bold text-indigo-600">{included.length === OPTIONS.length ? 'Clear all' : 'Select all'}</button></div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {OPTIONS.map((option) => {
              const checked = included.includes(option.id);
              return (
                <label key={option.id} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition ${checked ? 'border-indigo-300 bg-indigo-50/70' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(option.id)} className="mt-0.5 h-4 w-4 accent-indigo-600" />
                  <span><strong className="block text-[11px] text-slate-800">{option.label}</strong><small className="mt-0.5 block text-[9px] leading-relaxed text-slate-500">{option.note}</small></span>
                </label>
              );
            })}
          </div>
          <div className="mt-4 space-y-2">
            <p className="text-xs text-slate-500">Edit the actual selections below. These changes only affect the saved shortcut.</p>
            {[['statuses', 'Statuses', STATUS_OPTIONS], ['priorities', 'Priorities', PRIORITY_OPTIONS], ['issueTypes', 'Types', TYPE_OPTIONS], ['assignees', 'Members', members.map(m => ({ value: String(m.id), label: m.name }))], ['clientNames', 'Clients', clientNameOptions.map(name => ({ value: name, label: name }))]].filter(([key]) => included.includes(key)).map(([key, label, options]) => <div key={key}><MultiSelectFilter label={label} values={draft[key] || []} onChange={value => setDraft(prev => ({ ...prev, [key]: value }))} options={options} /><p className="mt-1 text-xs text-slate-500">{(draft[key] || []).map(value => options.find(o => o.value === value)?.label || value).join(', ') || 'All options'}</p></div>)}
            {included.includes('search') && <input aria-label="Saved search" value={draft.search} onChange={e => setDraft({ ...draft, search: e.target.value })} className="w-full rounded-lg border p-2" />}
            {included.includes('dates') && <div className="flex gap-2"><input aria-label="Saved created from" type="date" max={draft.createdTo || undefined} value={draft.createdFrom} onChange={e => setDraft({ ...draft, createdFrom: e.target.value })} /><input aria-label="Saved created to" type="date" min={draft.createdFrom || undefined} value={draft.createdTo} onChange={e => setDraft({ ...draft, createdTo: e.target.value })} /></div>}
          </div>
          <p className="mt-3 rounded-xl bg-slate-100 px-3 py-2.5 text-[10px] leading-relaxed text-slate-600">This view stays private to your account on this browser and applies only to the current team.</p>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5"><button type="button" onClick={onClose} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600">Cancel</button><button type="submit" disabled={!name.trim() || included.length === 0} className="h-10 rounded-xl bg-indigo-600 px-5 text-xs font-extrabold text-white shadow-[0_8px_18px_rgba(79,70,229,0.25)] disabled:opacity-40">Save view</button></footer>
      </form>
    </div>,
    document.body
  );
};

export default SavedViewDialog;
