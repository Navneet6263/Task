import React from 'react';
import { timeLabel } from './dates';
import { toneOf } from './items';

// Compact one-line item used in month cells and the all-day row.
export default function ItemChip({ item, onOpen }) {
  const tone = toneOf(item);
  return (
    <button type="button" title={item.raw?.assigned_to_name ? `${item.title} · ${item.raw.assigned_to_name}` : item.title} onClick={(event) => { event.stopPropagation(); onOpen(item); }}
      className={`flex w-full min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-xs hover:brightness-95 ${tone.chip} ${item.declined || item.done ? 'opacity-60' : ''}`}>
      {!item.allDay && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />}
      {!item.allDay && <span className="shrink-0 font-mono text-[10px] opacity-80">{timeLabel(item.start)}</span>}
      <span className={`truncate font-medium ${item.done || item.declined ? 'line-through' : ''}`}>{item.kind === 'task' ? `✓ ${item.title}` : item.title}</span>
    </button>
  );
}
