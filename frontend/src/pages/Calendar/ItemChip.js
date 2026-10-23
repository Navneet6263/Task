import React from 'react';
import { timeLabel } from './dates';
import { toneOf } from './items';
import HoverCard from './HoverCard';
import ItemDetails from './ItemDetails';

// Compact one-line item used in month cells and the all-day row. Hover shows the details;
// tasks open straight away on click and say so.
export default function ItemChip({ item, onOpen }) {
  const tone = toneOf(item);
  const isTask = item.kind === 'task';
  return (
    <HoverCard content={<ItemDetails item={item} />} className="block min-w-0">
      <button type="button" aria-label={isTask ? `Open task: ${item.title}` : item.title} onClick={(event) => { event.stopPropagation(); onOpen(item); }}
        className={`group flex w-full min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-xs transition hover:brightness-95 ${tone.chip} ${item.declined || item.done ? 'opacity-60' : ''}`}>
        {!item.allDay && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />}
        {!item.allDay && <span className="shrink-0 font-mono text-[10px] opacity-80">{timeLabel(item.start)}</span>}
        <span className={`min-w-0 flex-1 truncate font-medium ${item.done || item.declined ? 'line-through' : ''}`}>{isTask ? `✓ ${item.title}` : item.title}</span>
        {isTask && <span className="shrink-0 rounded bg-surface/80 px-1 text-[9px] font-bold uppercase tracking-wide text-accent opacity-80 transition group-hover:opacity-100">Open ↗</span>}
      </button>
    </HoverCard>
  );
}
