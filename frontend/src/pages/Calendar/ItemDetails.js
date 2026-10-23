import React from 'react';
import { whenText } from './dates';
import { TYPE_LABEL, toneOf } from './items';

const STATUS = { TODO: 'To do', IN_PROGRESS: 'In progress', PENDING: 'Pending', DONE: 'Done' };
const PRIORITY_TONE = { HIGH: 'text-danger', MEDIUM: 'text-warn', LOW: 'text-muted' };
const dateText = (value) => { const d = new Date(value); return value && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; };

function Person({ label, name }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-[72px] shrink-0 text-muted">{label}</span>
      {name ? <span className="flex min-w-0 items-center gap-1.5 font-medium"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[10px] font-bold text-accent">{name[0]?.toUpperCase()}</span><span className="truncate">{name}</span></span> : <span className="text-muted">—</span>}
    </div>
  );
}
const Line = ({ label, children }) => (
  <div className="flex gap-2 text-xs"><span className="w-[72px] shrink-0 text-muted">{label}</span><span className="min-w-0 truncate font-medium">{children}</span></div>
);

// The details shown when hovering an item on the calendar.
export default function ItemDetails({ item }) {
  const tone = toneOf(item);
  const raw = item.raw || {};
  if (item.kind === 'task') {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone.chip}`}>{item.overdue ? 'Overdue' : 'Task due'}</span>
          <span className="rounded-full bg-subtle px-2 py-0.5 text-[11px] font-semibold text-muted">{STATUS[raw.status] || raw.status}</span>
          {raw.priority && <span className={`text-[11px] font-bold ${PRIORITY_TONE[raw.priority] || ''}`}>{raw.priority}</span>}
          <span className="ml-auto font-mono text-[11px] text-muted">#{raw.id}</span>
        </div>
        <p className="text-sm font-semibold leading-snug">{item.title}</p>
        <div className="flex flex-col gap-1.5 border-t border-line pt-2">
          <Line label="Due">{dateText(raw.due_date)}</Line>
          <Person label="Assigned to" name={raw.assigned_to_name} />
          <Person label="Created by" name={raw.created_by_name} />
          {raw.client_name && <Line label="Client">{raw.client_name}</Line>}
          {raw.team_name && <Line label="Team">{raw.team_name}</Line>}
          {raw.created_at && <Line label="Created">{dateText(raw.created_at)}</Line>}
        </div>
        <p className="rounded-md bg-accent-soft px-2 py-1 text-center text-[11px] font-semibold text-accent">Click to open the task →</p>
      </div>
    );
  }
  const guests = raw.attendees || [];
  return (
    <div className="flex flex-col gap-2">
      <span className={`w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone.chip}`}>{TYPE_LABEL[item.type] || 'Event'}</span>
      <p className="text-sm font-semibold leading-snug">{item.title}</p>
      <div className="flex flex-col gap-1.5 border-t border-line pt-2">
        <Line label="When">{whenText(item)}</Line>
        <Person label="Organizer" name={raw.is_organizer ? 'You' : raw.created_by_name} />
        {raw.location && <Line label="Where">{raw.location}</Line>}
        {guests.length > 0 && <Line label="Guests">{guests.slice(0, 3).map((g) => g.name).join(', ')}{guests.length > 3 ? ` +${guests.length - 3}` : ''}</Line>}
      </div>
      <p className="text-center text-[11px] text-muted">Click for full details</p>
    </div>
  );
}
