import React, { useState } from 'react';
import MultiSelectFilter from './MultiSelectFilter';
import { PRIORITY_OPTIONS, STATUS_OPTIONS, TYPE_OPTIONS } from './filterOptions';

const SearchInput = ({ value, onChange }) => (
  <div className="relative min-w-[210px] flex-1">
    <svg className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
    <input type="text" placeholder="Search tasks..." value={value} onChange={(event) => onChange(event.target.value)} className="h-[34px] w-full rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-[11px] font-medium text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" />
    {value && <button type="button" onClick={() => onChange('')} aria-label="Clear task search" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">×</button>}
  </div>
);

const DateFilter = ({ id, label, value, min, max, onChange }) => (
  <div className="flex h-[34px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5">
    <label htmlFor={id} className="whitespace-nowrap text-[10px] font-bold text-slate-500">{label}</label>
    <input id={id} type="date" value={value} min={min || undefined} max={max || undefined} onChange={(event) => onChange(event.target.value)} className="w-[112px] bg-transparent text-[11px] font-medium text-slate-700 outline-none" />
  </div>
);

const TaskFilterBar = ({ filters: applied, setters: applySetters, members, clientNameOptions }) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(applied);
  const filters = open ? draft : applied;
  const setters = Object.fromEntries(Object.keys(applySetters).map(key => [key, value => setDraft(prev => ({ ...prev, [key]: value }))]));
  const toggle = () => { if (!open) setDraft(applied); setOpen(!open); };
  const apply = () => { Object.keys(applySetters).forEach(key => applySetters[key](draft[key])); setOpen(false); };
  const onClear = () => setDraft(prev => Object.fromEntries(Object.entries(prev).map(([key, value]) => [key, Array.isArray(value) ? [] : key === 'activeCount' ? 0 : ''])));
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

  return (
    <>
      <div className="relative z-[80]">
        <button type="button" aria-expanded={open} onClick={toggle} className={`flex h-8 items-center gap-2 rounded-xl border px-3 text-[11px] font-extrabold transition ${open || filters.activeCount ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'}`}>
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M7 12h10m-7 6h4" /></svg>
          Filters
          {filters.activeCount > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-blue-600 px-1 text-[9px] text-white">{filters.activeCount}</span>}
        </button>
      </div>

      {open && (
        <section className="relative z-[75] mt-1 w-full basis-full rounded-2xl border border-blue-100 bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.10)]">
          <header className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-extrabold text-slate-900">Filter tasks</h3><p className="mt-0.5 text-[10px] text-slate-500">Combine multiple options to narrow the workspace.</p></div><button type="button" onClick={() => setOpen(false)} aria-label="Close filters" className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500">×</button></header>
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
          <footer className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">{<button type="button" onClick={onClear} className="h-9 rounded-lg border border-red-200 bg-red-50 px-3 text-[11px] font-bold text-red-600">Clear all</button>}<button type="button" onClick={apply} className="h-9 rounded-lg bg-blue-600 px-4 text-[11px] font-extrabold text-white">Show results</button></footer>
        </section>
      )}
    </>
  );
};

export default TaskFilterBar;
