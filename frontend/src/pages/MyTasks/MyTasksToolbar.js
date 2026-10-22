import React from 'react';
import { Input, Segmented, Select } from '../../ui';
import { STATUSES } from './taskMeta';

const FOCUS = [['', 'All'], ['MY_DAY', 'My day'], ['DUE_TODAY', 'Due today'], ['OVERDUE', 'Overdue']];
const PRIORITIES = [['HIGH', 'High'], ['MEDIUM', 'Medium'], ['LOW', 'Low']];
const VIEWS = [['agenda', 'Agenda'], ['board', 'Board'], ['list', 'List']];

const pill = (active) => `rounded-full border px-2.5 py-1 text-xs font-semibold ${active ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface text-muted hover:text-ink'}`;

export default function MyTasksToolbar({ view, setView, status, setStatus, focus, setFocus, priorities, setPriorities, search, setSearch, sort, setSort }) {
  const flip = (key) => setPriorities(priorities.includes(key) ? priorities.filter((p) => p !== key) : [...priorities, key]);
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <Input aria-label="Search my tasks" placeholder="Search my tasks" className="pl-8" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <Select aria-label="Sort tasks" className="!w-auto py-1.5" value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="due">Due date</option><option value="priority">Priority</option><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="title">Title A–Z</option>
        </Select>
        <Segmented label="View" value={view} onChange={setView} options={VIEWS} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Status">
          <span className="mr-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Status</span>
          {[['', 'All'], ...STATUSES].map(([key, label]) => <button key={key || 'all'} type="button" aria-pressed={status === key} onClick={() => setStatus(key)} className={pill(status === key)}>{label}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Focus">
          <span className="mr-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Focus</span>
          {FOCUS.map(([key, label]) => <button key={key || 'all'} type="button" aria-pressed={focus === key} onClick={() => setFocus(key)} className={pill(focus === key)}>{label}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Priority">
          <span className="mr-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Priority</span>
          {PRIORITIES.map(([key, label]) => <button key={key} type="button" aria-pressed={priorities.includes(key)} onClick={() => flip(key)} className={pill(priorities.includes(key))}>{label}</button>)}
        </div>
      </div>
    </div>
  );
}
