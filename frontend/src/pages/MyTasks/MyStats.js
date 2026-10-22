import React from 'react';
import { Meter } from '../../ui';

// Clickable summary tiles: each one applies the matching filter.
export default function MyStats({ summary, status, focus, onPick }) {
  const n = (key) => Number(summary[key] || 0);
  const total = n('total');
  const open = n('todo') + n('in_progress') + n('pending');
  const completion = total ? Math.round((n('done') / total) * 100) : 0;
  const tiles = [
    { id: 'open', label: 'Open', value: open, note: `${total} total`, active: !status && !focus, pick: { status: '', focus: '' } },
    { id: 'todo', label: 'To do', value: n('todo'), note: 'Not started', active: status === 'TODO', pick: { status: 'TODO', focus: '' } },
    { id: 'progress', label: 'In progress', value: n('in_progress'), note: `${n('pending')} pending`, active: status === 'IN_PROGRESS', pick: { status: 'IN_PROGRESS', focus: '' } },
    { id: 'done', label: 'Completed', value: n('done'), note: `${completion}% of all`, meter: completion, active: status === 'DONE', pick: { status: 'DONE', focus: '' } },
    { id: 'overdue', label: 'Overdue', value: n('overdue'), note: n('overdue') ? 'Needs attention' : 'On track', danger: n('overdue') > 0, active: focus === 'OVERDUE', pick: { status: '', focus: 'OVERDUE' } },
  ];
  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {tiles.map((tile) => (
        <button key={tile.id} type="button" aria-pressed={tile.active} onClick={() => onPick(tile.pick)}
          className={`flex flex-col gap-1.5 rounded-lg border bg-surface px-4 py-3 text-left transition hover:border-muted ${tile.active ? 'border-accent ring-1 ring-accent/40' : 'border-line'}`}>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{tile.label}</span>
          <span className={`font-mono text-2xl font-semibold leading-none tabular-nums ${tile.danger ? 'text-danger' : ''}`}>{tile.value}</span>
          {tile.meter !== undefined ? <Meter value={tile.meter} label="Completion" /> : <span className="h-1.5" />}
          <span className="text-xs text-muted">{tile.note}</span>
        </button>
      ))}
    </section>
  );
}
