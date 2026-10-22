import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardHeader } from '../../ui';
import { fromKey, timeLabel, todayKey } from '../Calendar/dates';
import { TYPE_LABEL, toneOf } from '../Calendar/items';

function DateBlock({ dayKey }) {
  const day = fromKey(dayKey);
  const isToday = dayKey === todayKey();
  return (
    <span className={`flex w-11 shrink-0 flex-col items-center rounded-md py-1 ${isToday ? 'bg-accent text-accent-fg' : 'bg-subtle text-ink'}`}>
      <span className="text-[10px] font-semibold uppercase">{isToday ? 'Today' : day.toLocaleDateString('en-US', { weekday: 'short' })}</span>
      <span className="font-mono text-base font-semibold leading-tight">{day.getDate()}</span>
    </span>
  );
}

// Next items from the calendar: meetings, events, reminders and tasks due this week.
export default function UpNext({ agenda }) {
  const navigate = useNavigate();
  return (
    <Card>
      <CardHeader title="Up next" aside={<Link to="/calendar" className="text-xs font-semibold text-accent hover:underline">Open calendar</Link>} />
      <div className="flex flex-col gap-1 p-2">
        {!agenda.loaded && <p role="status" className="px-2 py-4 text-sm text-muted">Loading your week...</p>}
        {agenda.loaded && !agenda.upcoming.length && (
          <div className="px-2 py-5 text-center">
            <p className="text-sm text-muted">Nothing scheduled for the next 7 days.</p>
            <button type="button" onClick={() => navigate('/calendar')} className="mt-2 text-sm font-semibold text-accent hover:underline">Schedule something</button>
          </div>
        )}
        {agenda.upcoming.map((item) => (
          <button key={item.key} type="button" onClick={() => navigate(item.kind === 'task' ? `/dashboard?task=${item.id}` : '/calendar')}
            className="flex items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-subtle">
            <DateBlock dayKey={item.start.slice(0, 10) < todayKey() ? todayKey() : item.start.slice(0, 10)} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{item.title}</span>
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <span className={`h-1.5 w-1.5 rounded-full ${toneOf(item).dot}`} />
                {TYPE_LABEL[item.type]} · {item.allDay ? 'All day' : timeLabel(item.start)}
              </span>
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}
