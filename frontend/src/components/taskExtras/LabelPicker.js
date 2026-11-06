import React, { useEffect, useRef, useState } from 'react';
import { taskExtras } from '../../services/api';
import { notify } from '../../services/feedback';
import LabelChip from './LabelChip';
import { LABEL_HEX, useTaskMeta } from './taskExtrasStore';

// Pick labels from the organization's list, or type a new one and choose its colour.
export default function LabelPicker({ value = [], onChange, id = 'labels' }) {
  const meta = useTaskMeta();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [color, setColor] = useState('blue');
  const [busy, setBusy] = useState(false);
  const box = useRef(null);
  const chosen = meta.labels.filter((l) => value.includes(l.id));

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const q = query.trim().toLowerCase();
  const shown = meta.labels.filter((l) => !q || l.name.toLowerCase().includes(q));
  const exact = meta.labels.some((l) => l.name.toLowerCase() === q);
  const toggle = (label) => onChange(value.includes(label.id) ? value.filter((v) => v !== label.id) : [...value, label.id]);
  const create = async () => {
    if (!query.trim() || busy) return;
    setBusy(true);
    try {
      const { data } = await taskExtras.createLabel({ name: query.trim(), color });
      await meta.reload();
      if (!value.includes(data.id)) onChange([...value, data.id]);
      setQuery('');
    } catch (err) { notify(err.response?.data?.error || 'Could not create the label.'); }
    finally { setBusy(false); }
  };

  return (
    <div ref={box} className="relative">
      <div className="flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1.5">
        {chosen.map((l) => <LabelChip key={l.id} label={l} onRemove={toggle} />)}
        <button id={id} type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="rounded-full border border-dashed border-line px-2 py-0.5 text-xs font-semibold text-muted hover:border-accent hover:text-accent">
          {chosen.length ? '+ Label' : '+ Add labels'}
        </button>
      </div>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded-lg border border-line bg-surface p-2 shadow-pop motion-safe:animate-fade-in">
          <input autoFocus aria-label="Find or create a label" placeholder="Find or create a label…" value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (!exact) create(); else { const hit = meta.labels.find((l) => l.name.toLowerCase() === q); if (hit) toggle(hit); } } }}
            className="mb-2 w-full rounded-md border border-line bg-canvas px-2.5 py-1.5 text-sm outline-none focus:border-accent" />
          <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
            {shown.map((l) => (
              <li key={l.id}>
                <button type="button" onClick={() => toggle(l)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-subtle">
                  <span className={`grid h-4 w-4 place-items-center rounded border text-[10px] ${value.includes(l.id) ? 'border-accent bg-accent text-accent-fg' : 'border-line text-transparent'}`}>✓</span>
                  <LabelChip label={l} />
                </button>
              </li>
            ))}
            {!shown.length && !query && <li className="px-2 py-2 text-xs text-muted">No labels yet. Type a name to create one.</li>}
          </ul>
          {query.trim() && !exact && (
            <div className="mt-2 border-t border-line pt-2">
              <div className="mb-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Label colour">
                {Object.entries(LABEL_HEX).map(([name, hex]) => (
                  <button key={name} type="button" role="radio" aria-checked={color === name} aria-label={name} onClick={() => setColor(name)}
                    className={`h-5 w-5 rounded-full ring-offset-2 ring-offset-surface ${color === name ? 'ring-2 ring-accent' : ''}`} style={{ backgroundColor: hex }} />
                ))}
              </div>
              <button type="button" disabled={busy} onClick={create} className="w-full rounded-md bg-accent px-2 py-1.5 text-sm font-semibold text-accent-fg hover:brightness-110 disabled:opacity-60">
                {busy ? 'Creating…' : <>Create label “{query.trim()}”</>}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
