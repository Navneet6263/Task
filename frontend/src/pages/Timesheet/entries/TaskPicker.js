import React, { useEffect, useRef, useState } from 'react';
import { timesheet } from '../../../services/api';
import { Button, Chip, Input } from '../../../ui';
import { fmtDate } from '../format';

const STATUS = { TODO: ['To do', 'neutral'], IN_PROGRESS: ['In progress', 'info'], PENDING: ['Pending', 'warn'], DONE: ['Done', 'ok'] };
const status = (s) => STATUS[s] || [s || '—', 'neutral'];

// Pick the task this timesheet entry is for. Employees see tasks assigned to them or in their teams.
export default function TaskPicker({ id, value, onPick, disabled = false }) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!open || value) return undefined;
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      timesheet.tasks({ q: query.trim() || undefined })
        .then((r) => { if (active) setRows(Array.isArray(r.data) ? r.data : []); })
        .catch(() => { if (active) setRows([]); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [open, query, value]);
  useEffect(() => {
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (value) {
    const [label, tone] = status(value.status);
    return (
      <div className="flex items-start gap-3 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2.5">
        <span className="mt-0.5 rounded bg-surface px-1.5 font-mono text-[11px] text-muted">#{value.id}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{value.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted">
            {value.status && <Chip tone={tone}>{label}</Chip>}
            {value.client_name && <span>{value.client_name}</span>}
            {value.assigned_to_name && <span>· {value.assigned_to_name}</span>}
            {value.due_date && <span>· due {fmtDate(value.due_date)}</span>}
          </p>
        </div>
        {!disabled && <Button size="sm" variant="ghost" onClick={() => { onPick(null); setOpen(true); }}>Change</Button>}
      </div>
    );
  }

  return (
    <div ref={box} className="relative">
      <Input id={id} disabled={disabled} autoComplete="off" placeholder="Search your tasks by title, client or #number" value={query}
        onFocus={() => setOpen(true)} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} />
      {open && (
        <ul role="listbox" aria-label="Tasks" className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-surface py-1 shadow-pop motion-safe:animate-fade-in">
          {loading && <li className="px-3 py-2 text-sm text-muted">Loading tasks…</li>}
          {!loading && !rows.length && <li className="px-3 py-2 text-sm text-muted">No tasks found. Ask your manager to create the task first.</li>}
          {!loading && rows.map((task) => {
            const [label, tone] = status(task.status);
            return (
              <li key={task.id}>
                <button type="button" role="option" aria-selected="false" onClick={() => { onPick(task); setOpen(false); setQuery(''); }}
                  className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-subtle">
                  <span className="mt-0.5 font-mono text-[11px] text-muted">#{task.id}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{task.title}</span>
                    <span className="block truncate text-xs text-muted">{[task.client_name, task.assigned_to_name, task.team_name].filter(Boolean).join(' · ') || 'No client'}</span>
                  </span>
                  <Chip tone={tone}>{label}</Chip>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
