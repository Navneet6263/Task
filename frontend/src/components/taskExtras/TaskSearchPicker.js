import React, { useEffect, useRef, useState } from 'react';
import { taskExtras } from '../../services/api';
import { useTaskMeta } from './taskExtrasStore';

const STATUS_DOT = { DONE: 'bg-accent', IN_PROGRESS: 'bg-info', PENDING: 'bg-warn', TODO: 'bg-muted' };

// Find a task by its key (ACC-142), number or title. `exclude` hides tasks that cannot be picked.
export default function TaskSearchPicker({ onPick, placeholder = 'Search by key or title…', teamId, exclude = [], onlyMain = false, label = 'Find a task' }) {
  const { keyOf } = useTaskMeta();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const timer = setTimeout(() => {
      taskExtras.search(query.trim(), teamId).then(({ data }) => setResults(data)).catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [query, open, teamId]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const shown = results.filter((t) => !exclude.map(String).includes(String(t.id)) && (!onlyMain || !t.is_subtask));
  return (
    <div ref={box} className="relative">
      <input aria-label={label} placeholder={placeholder} value={query} onFocus={() => setOpen(true)} onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent" />
      {open && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-pop">
          {shown.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => { onPick(t); setOpen(false); setQuery(''); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-subtle">
                <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[t.status] || 'bg-muted'}`} />
                <span className="shrink-0 font-mono text-[11px] font-semibold text-muted">{keyOf(t.id)}</span>
                <span className={`min-w-0 flex-1 truncate text-sm ${t.status === 'DONE' ? 'text-muted line-through' : ''}`}>{t.title}</span>
              </button>
            </li>
          ))}
          {!shown.length && <li className="px-2 py-3 text-center text-xs text-muted">No matching task.</li>}
        </ul>
      )}
    </div>
  );
}
