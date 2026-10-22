import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useDialog from '../../../components/useDialog';
import MultiSelectFilter from './MultiSelectFilter';
import { STATUS_OPTIONS, PRIORITY_OPTIONS, TYPE_OPTIONS } from './filterOptions';
import { Button, Input } from '../../../ui';

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

  const editable = [
    ['statuses', 'Statuses', STATUS_OPTIONS], ['priorities', 'Priorities', PRIORITY_OPTIONS], ['issueTypes', 'Types', TYPE_OPTIONS],
    ['assignees', 'Members', members.map((m) => ({ value: String(m.id), label: m.name }))],
    ['clientNames', 'Clients', clientNameOptions.map((value) => ({ value, label: value }))],
  ].filter(([key]) => included.includes(key));

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-start justify-center overflow-y-auto bg-black/50 p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form ref={dialogRef} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="save-view-heading"
        className="my-6 w-[min(560px,94vw)] overflow-hidden rounded-xl border border-line bg-surface text-ink shadow-pop">
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
          <div>
            <h3 id="save-view-heading" className="text-[17px] font-semibold">Save current view</h3>
            <p className="text-sm text-muted">Choose exactly what this shortcut should remember.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-md text-lg text-muted hover:bg-subtle hover:text-ink">&times;</button>
        </header>
        <div className="max-h-[65vh] overflow-y-auto px-5 py-4">
          <label htmlFor="saved-view-name" className="text-xs font-medium text-muted">View name</label>
          <Input id="saved-view-name" autoFocus maxLength={32} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. My urgent bugs" className="mt-1" />
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm font-semibold">What should be saved?</span>
            <button type="button" onClick={() => setIncluded(included.length === OPTIONS.length ? [] : OPTIONS.map((item) => item.id))} className="text-xs font-semibold text-accent">
              {included.length === OPTIONS.length ? 'Clear all' : 'Select all'}
            </button>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {OPTIONS.map((option) => {
              const checked = included.includes(option.id);
              return (
                <label key={option.id} className={`flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5 ${checked ? 'border-accent/60 bg-accent-soft' : 'border-line hover:bg-subtle'}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(option.id)} className="mt-0.5 h-4 w-4 accent-accent" />
                  <span><strong className="block text-xs font-semibold">{option.label}</strong><small className="block text-[11px] text-muted">{option.note}</small></span>
                </label>
              );
            })}
          </div>
          <div className="mt-4 space-y-2">
            <p className="text-xs text-muted">Edit the actual selections below. These changes only affect the saved shortcut.</p>
            {editable.map(([key, label, options]) => (
              <div key={key}>
                <MultiSelectFilter label={label} values={draft[key] || []} onChange={(value) => setDraft((prev) => ({ ...prev, [key]: value }))} options={options} />
                <p className="mt-1 text-xs text-muted">{(draft[key] || []).map((value) => options.find((o) => o.value === value)?.label || value).join(', ') || 'All options'}</p>
              </div>
            ))}
            {included.includes('search') && <Input aria-label="Saved search" value={draft.search} onChange={(event) => setDraft({ ...draft, search: event.target.value })} />}
            {included.includes('dates') && (
              <div className="flex gap-2">
                <Input aria-label="Saved created from" type="date" max={draft.createdTo || undefined} value={draft.createdFrom} onChange={(event) => setDraft({ ...draft, createdFrom: event.target.value })} />
                <Input aria-label="Saved created to" type="date" min={draft.createdFrom || undefined} value={draft.createdTo} onChange={(event) => setDraft({ ...draft, createdTo: event.target.value })} />
              </div>
            )}
          </div>
          <p className="mt-3 rounded-md bg-subtle px-3 py-2.5 text-xs text-muted">This view stays private to your account on this browser and applies only to the current team.</p>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-line bg-subtle px-5 py-3">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!name.trim() || included.length === 0}>Save view</Button>
        </footer>
      </form>
    </div>,
    document.body
  );
};

export default SavedViewDialog;
