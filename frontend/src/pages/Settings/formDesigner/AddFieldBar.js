import React, { useState } from 'react';
import { CUSTOM_TYPES, TYPE_META } from './designerUtils';

// "+ Add question" with the answer types, plus hidden fields that can be brought back.
export default function AddFieldBar({ hidden, onAdd, onShow }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-dashed border-line bg-surface p-3">
        {!open ? (
          <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-accent transition hover:bg-accent-soft">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-base leading-none text-accent-fg">+</span> Add question
          </button>
        ) : (
          <div className="motion-safe:animate-fade-in">
            <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold">Choose an answer type</p>
              <button type="button" onClick={() => setOpen(false)} className="text-xs font-medium text-muted hover:text-ink">Cancel</button></div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {CUSTOM_TYPES.map(([type, help]) => (
                <button key={type} type="button" onClick={() => { onAdd(type); setOpen(false); }}
                  className="flex items-center gap-2.5 rounded-lg border border-line p-2.5 text-left transition hover:border-accent hover:bg-accent-soft/50">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-subtle font-mono text-sm text-muted">{TYPE_META[type][1]}</span>
                  <span className="min-w-0"><span className="block text-sm font-semibold">{TYPE_META[type][0]}</span><span className="block truncate text-[11px] text-muted">{help}</span></span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {hidden.length > 0 && (
        <div className="rounded-xl border border-line bg-surface p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Hidden fields · {hidden.length}</p>
          <div className="flex flex-wrap gap-1.5">
            {hidden.map((f) => (
              <button key={f.key} type="button" onClick={() => onShow(f.key)} title="Show on the form again"
                className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-muted transition hover:border-accent hover:text-accent">+ {f.label}</button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted">Hidden fields keep their saved answers on older tasks.</p>
        </div>
      )}
    </div>
  );
}
