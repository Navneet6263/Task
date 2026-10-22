import React, { useState } from 'react';
import { Button, Segmented } from '../../ui';
import { addMonths, monthGrid, toKey, todayKey } from './dates';
import { TONE } from './items';

const FILTERS = [['EVENT', 'Events'], ['MEETING', 'Meetings'], ['REMINDER', 'Reminders'], ['TASK', 'Tasks due']];

function MiniMonth({ selected, onPick }) {
  const [month, setMonth] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
  const today = todayKey(), selectedKey = toKey(selected);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-semibold">{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
        <span className="flex">
          <button type="button" aria-label="Previous month" className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-subtle hover:text-ink" onClick={() => setMonth(addMonths(month, -1))}>‹</button>
          <button type="button" aria-label="Next month" className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-subtle hover:text-ink" onClick={() => setMonth(addMonths(month, 1))}>›</button>
        </span>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-muted">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i} className="py-1">{d}</span>)}
      </div>
      <div className="grid grid-cols-7 text-center text-xs">
        {monthGrid(month).map((day) => {
          const key = toKey(day);
          const tone = key === selectedKey ? 'bg-accent text-accent-fg' : key === today ? 'font-bold text-accent' : day.getMonth() !== month.getMonth() ? 'text-muted/50' : 'text-ink';
          return (
            <button key={key} type="button" aria-label={day.toDateString()} onClick={() => onPick(day)}
              className={`mx-auto my-0.5 grid h-7 w-7 place-items-center rounded-full hover:bg-subtle ${tone}`}>{day.getDate()}</button>
          );
        })}
      </div>
    </div>
  );
}

export default function CalendarSidebar({ cursor, onPick, onCreate, filters, setFilter, counts, scope, setScope }) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col gap-5 lg:flex">
      <Button variant="primary" className="w-full justify-start py-2.5" onClick={onCreate}>+ Create</Button>
      <MiniMonth key={`${cursor.getFullYear()}-${cursor.getMonth()}`} selected={cursor} onPick={onPick} />
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Show</p>
        <div className="flex flex-col gap-1">
          {FILTERS.map(([type, text]) => (
            <label key={type} className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 text-sm hover:bg-subtle">
              <input type="checkbox" className="h-4 w-4 accent-accent" checked={filters[type]} onChange={(event) => setFilter(type, event.target.checked)} />
              <span className={`h-2.5 w-2.5 rounded-full ${TONE[type].dot}`} />
              <span className="flex-1">{text}</span>
              <span className="font-mono text-xs text-muted">{counts[type] || 0}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Tasks to show</p>
        <Segmented label="Tasks to show" value={scope} onChange={setScope} options={[['mine', 'My tasks'], ['team', 'All team tasks']]} className="w-full [&>button]:flex-1" />
      </div>
      <p className="text-xs text-muted">Events are visible only to the organizer and invited people. Tasks appear on their due date.</p>
    </aside>
  );
}
