import React, { useState } from 'react';
import MultiSelectFilter from './MultiSelectFilter';
import { PRIORITY_OPTIONS, STATUS_OPTIONS, TYPE_OPTIONS } from './filterOptions';
import { Button } from '../../../ui';

const SearchInput = ({ value, onChange }) => (
  <div className="relative min-w-[210px] flex-1">
    <svg className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
    <input type="text" aria-label="Search tasks" placeholder="Search tasks..." value={value} onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full rounded-md border border-line bg-surface pl-8 pr-8 text-xs text-ink placeholder:text-muted" />
    {value && <button type="button" onClick={() => onChange('')} aria-label="Clear task search" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink">×</button>}
  </div>
);

const DateFilter = ({ id, label, value, min, max, onChange }) => (
  <div className="flex h-9 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5">
    <label htmlFor={id} className="whitespace-nowrap text-[11px] font-medium text-muted">{label}</label>
    <input id={id} type="date" value={value} min={min || undefined} max={max || undefined} onChange={(event) => onChange(event.target.value)} className="w-[118px] bg-transparent text-xs text-ink outline-none" />
  </div>
);

const TaskFilterBar = ({ filters: applied, setters: applySetters, members, clientNameOptions }) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(applied);
  const filters = open ? draft : applied;
  const setters = Object.fromEntries(Object.keys(applySetters).map((key) => [key, (value) => setDraft((prev) => ({ ...prev, [key]: value }))]));
  const toggle = () => { if (!open) setDraft(applied); setOpen(!open); };
  const apply = () => { Object.keys(applySetters).forEach((key) => applySetters[key](draft[key])); setOpen(false); };
  const onClear = () => setDraft((prev) => Object.fromEntries(Object.entries(prev).map(([key, value]) => [key, Array.isArray(value) ? [] : key === 'activeCount' ? 0 : ''])));
  const memberOptions = members.map((member) => ({ value: String(member.id), label: member.name }));
  const clientOptions = clientNameOptions.map((name) => ({ value: name, label: name }));
  const setCreatedFrom = (value) => {
    setters.createdFrom(value);
    if (value && filters.createdTo && value > filters.createdTo) setters.createdTo(value);
  };
  const setCreatedTo = (value) => {
    setters.createdTo(value);
    if (value && filters.createdFrom && value < filters.createdFrom) setters.createdFrom(value);
  };
  const highlighted = open || filters.activeCount;

  return (
    <>
      <div className="relative z-[80]">
        <button type="button" aria-expanded={open} onClick={toggle}
          className={`flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-semibold ${highlighted ? 'border-accent/60 bg-accent-soft text-accent' : 'border-line bg-surface text-muted hover:text-ink'}`}>
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M7 12h10m-7 6h4" /></svg>
          Filters
          {filters.activeCount > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[9px] text-accent-fg">{filters.activeCount}</span>}
        </button>
      </div>
      {open && (
        <section className="relative z-[75] mt-1 w-full basis-full rounded-lg border border-line bg-surface p-4 shadow-pop">
          <header className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Filter tasks</h3>
              <p className="mt-0.5 text-xs text-muted">Combine multiple options to narrow the workspace.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close filters" className="grid h-8 w-8 place-items-center rounded-md text-lg text-muted hover:bg-subtle hover:text-ink">×</button>
          </header>
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={filters.search} onChange={setters.search} />
            <MultiSelectFilter label="All Statuses" values={filters.statuses} onChange={setters.statuses} options={STATUS_OPTIONS} />
            <MultiSelectFilter label="All Priorities" values={filters.priorities} onChange={setters.priorities} options={PRIORITY_OPTIONS} />
            <MultiSelectFilter label="All Types" values={filters.issueTypes} onChange={setters.issueTypes} options={TYPE_OPTIONS} />
            <MultiSelectFilter label="All Members" values={filters.assignees} onChange={setters.assignees} options={memberOptions} disabled={!memberOptions.length} />
            <MultiSelectFilter label="All Clients" values={filters.clientNames} onChange={setters.clientNames} options={clientOptions} disabled={!clientOptions.length} />
            <DateFilter id="created-from" label="Created from" value={filters.createdFrom} max={filters.createdTo} onChange={setCreatedFrom} />
            <DateFilter id="created-to" label="Created to" value={filters.createdTo} min={filters.createdFrom} onChange={setCreatedTo} />
          </div>
          <footer className="mt-4 flex justify-end gap-2 border-t border-line pt-3">
            <Button size="sm" variant="danger" onClick={onClear}>Clear all</Button>
            <Button size="sm" variant="primary" onClick={apply}>Show results</Button>
          </footer>
        </section>
      )}
    </>
  );
};

export default TaskFilterBar;
