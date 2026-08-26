import React from 'react';
import MultiSelectFilter from './MultiSelectFilter';
import { PRIORITY_OPTIONS, STATUS_OPTIONS, TYPE_OPTIONS } from './filterOptions';

const SearchInput = ({ value, onChange }) => (
  <div className="relative flex-1 min-w-[180px] max-w-[260px]">
    <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
    <input
      type="text"
      placeholder="Search tasks..."
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full h-[34px] pl-8 pr-7 rounded-lg border border-slate-200 bg-white/80 text-slate-700 text-[11px] font-medium shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none placeholder:text-slate-400"
    />
    {value && (
      <button type="button" onClick={() => onChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label="Clear task search">
        ×
      </button>
    )}
  </div>
);

const DateFilter = ({ id, label, value, min, max, onChange }) => (
  <div className="flex items-center gap-1.5 h-[34px] rounded-lg border border-slate-200 bg-white/80 px-2.5 shadow-sm">
    <label htmlFor={id} className="text-[10px] font-bold text-slate-500 whitespace-nowrap">{label}</label>
    <input id={id} type="date" value={value} min={min || undefined} max={max || undefined} onChange={(event) => onChange(event.target.value)} className="bg-transparent text-slate-700 text-[11px] font-medium outline-none w-[112px]" />
  </div>
);

const TaskFilterBar = ({ filters, setters, members, clientNameOptions, onClear }) => {
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
    <div className="relative z-30 flex flex-wrap gap-2 items-center">
      <SearchInput value={filters.search} onChange={setters.search} />
      <div className="h-[18px] w-[1px] bg-slate-200 hidden sm:block" />
      <MultiSelectFilter label="All Statuses" values={filters.statuses} onChange={setters.statuses} options={STATUS_OPTIONS} />
      <MultiSelectFilter label="All Priorities" values={filters.priorities} onChange={setters.priorities} options={PRIORITY_OPTIONS} />
      <MultiSelectFilter label="All Types" values={filters.issueTypes} onChange={setters.issueTypes} options={TYPE_OPTIONS} />
      <MultiSelectFilter label="All Members" values={filters.assignees} onChange={setters.assignees} options={memberOptions} disabled={!memberOptions.length} />
      <MultiSelectFilter label="All Clients" values={filters.clientNames} onChange={setters.clientNames} options={clientOptions} disabled={!clientOptions.length} />
      <DateFilter id="created-from" label="Created from" value={filters.createdFrom} max={filters.createdTo} onChange={setCreatedFrom} />
      <DateFilter id="created-to" label="Created to" value={filters.createdTo} min={filters.createdFrom} onChange={setCreatedTo} />
      {filters.activeCount > 0 && (
        <button type="button" onClick={onClear} className="h-[34px] px-3 rounded-lg border border-red-200 bg-red-50 text-red-600 text-[11px] font-bold hover:bg-red-100 flex items-center gap-1.5 whitespace-nowrap shadow-sm">
          <span aria-hidden="true">×</span> Clear All
        </button>
      )}
    </div>
  );
};

export default TaskFilterBar;
