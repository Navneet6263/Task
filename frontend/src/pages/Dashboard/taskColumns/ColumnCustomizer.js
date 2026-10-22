import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../../../ui';
import { COLUMN_BY_ID, PRESETS } from './columns';
import useFlip from './useFlip';

export const GripIcon = () => (
  <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor" aria-hidden="true">
    {[2, 7, 12].map((y) => <React.Fragment key={y}><circle cx="3.5" cy={y} r="1.3" /><circle cx="8.5" cy={y} r="1.3" /></React.Fragment>)}
  </svg>
);
const ColumnsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v16" /></svg>
);
const LockIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
);

// "Columns" button with a panel: tick to show, drag the grip to reorder (items slide into place).
export default function ColumnCustomizer({ columns }) {
  const { layout, toggle, move, applyPreset, reset } = columns;
  const [open, setOpen] = useState(false);
  const [dragId, setDragId] = useState(null);
  const rootRef = useRef(null);
  const flip = useFlip(layout.map((entry) => entry.id).join('|'));
  const visibleCount = layout.filter((entry) => entry.visible).length;

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    const escape = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape); };
  }, [open]);

  const neighbour = (id, step) => {
    const movable = layout.filter((entry) => !COLUMN_BY_ID[entry.id].pinned);
    const index = movable.findIndex((entry) => entry.id === id);
    return movable[index + step]?.id;
  };

  return (
    <div className="relative" ref={rootRef}>
      <Button size="sm" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}>
        <ColumnsIcon /> Columns <span className="font-mono text-[10px] text-muted">{visibleCount}/{layout.length}</span>
      </Button>
      {open && (
        <div role="dialog" aria-label="Customize columns" className="absolute right-0 top-[calc(100%+6px)] z-[60] w-[300px] rounded-lg border border-line bg-surface shadow-pop">
          <div className="border-b border-line px-4 py-3">
            <h3 className="text-sm font-semibold">Customize columns</h3>
            <p className="text-xs text-muted">Tick to show. Drag <span className="inline-block align-middle text-muted"><GripIcon /></span> to reorder.</p>
            <div className="mt-2 flex gap-1.5">
              {Object.keys(PRESETS).map((name) => <Button key={name} size="sm" variant="ghost" className="!px-2" onClick={() => applyPreset(name)}>{name}</Button>)}
            </div>
          </div>
          <ul className="max-h-[360px] overflow-y-auto p-1.5" onDragOver={(event) => event.preventDefault()}>
            {layout.map((entry) => {
              const column = COLUMN_BY_ID[entry.id];
              const dragging = dragId === entry.id;
              return (
                <li key={entry.id} ref={flip(entry.id)} draggable={!column.pinned}
                  onDragStart={(event) => { setDragId(entry.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', entry.id); }}
                  onDragEnter={() => { if (dragId) move(dragId, entry.id); }}
                  onDragEnd={() => setDragId(null)}
                  className={`group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${dragging ? 'bg-accent-soft shadow-sm ring-1 ring-accent/40' : 'hover:bg-subtle'} ${column.pinned ? '' : 'cursor-grab active:cursor-grabbing'}`}>
                  <span className={`shrink-0 ${column.pinned ? 'text-muted/50' : 'text-muted group-hover:text-ink'}`}>{column.pinned ? <LockIcon /> : <GripIcon />}</span>
                  <label className="flex min-w-0 flex-1 cursor-[inherit] items-center gap-2">
                    <input type="checkbox" className="h-4 w-4 accent-accent" checked={entry.visible} disabled={column.pinned} onChange={() => toggle(entry.id)} />
                    <span className={`truncate ${entry.visible ? '' : 'text-muted'}`}>{column.label}</span>
                  </label>
                  {!column.pinned && (
                    <span className="flex opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <button type="button" aria-label={`Move ${column.label} up`} disabled={!neighbour(entry.id, -1)} onClick={() => move(entry.id, neighbour(entry.id, -1))}
                        className="grid h-6 w-6 place-items-center rounded text-xs text-muted hover:bg-surface hover:text-ink disabled:opacity-30">↑</button>
                      <button type="button" aria-label={`Move ${column.label} down`} disabled={!neighbour(entry.id, 1)} onClick={() => move(entry.id, neighbour(entry.id, 1))}
                        className="grid h-6 w-6 place-items-center rounded text-xs text-muted hover:bg-surface hover:text-ink disabled:opacity-30">↓</button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between border-t border-line px-3 py-2">
            <Button size="sm" variant="ghost" onClick={reset}>Reset to default</Button>
            <Button size="sm" variant="primary" onClick={() => setOpen(false)}>Done</Button>
          </div>
        </div>
      )}
    </div>
  );
}
