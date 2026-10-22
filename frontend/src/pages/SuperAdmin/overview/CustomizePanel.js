import React, { useState } from 'react';
import useDialog from '../../../components/useDialog';
import { Button, Segmented, Switch } from '../../../ui';
import { WIDGETS } from './layoutPrefs';

const META = Object.fromEntries(WIDGETS.map(([key, title, help]) => [key, { title, help }]));

// Side panel to show, hide, resize and reorder overview widgets. Changes apply and save immediately.
export default function CustomizePanel({ layout, toggle, resize, move, reset, onClose }) {
  const ref = useDialog(true, onClose);
  const [dragging, setDragging] = useState(null);
  const visible = layout.order.length - layout.hidden.length;

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/40 motion-safe:animate-fade-in" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section ref={ref} role="dialog" aria-modal="true" aria-label="Customize overview" tabIndex={-1}
        className="flex h-full w-full max-w-md flex-col border-l border-line bg-surface text-ink shadow-pop motion-safe:animate-slide-in">
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[17px] font-semibold">Customize overview</h2>
            <p className="text-sm text-muted">Drag to reorder. Changes save automatically for your account in this browser.</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-lg text-muted hover:bg-subtle hover:text-ink">×</button>
        </header>
        <ol className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
          {layout.order.map((key, index) => {
            const shown = !layout.hidden.includes(key);
            return (
              <li key={key} draggable onDragStart={(e) => { setDragging(key); e.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={(e) => { e.preventDefault(); if (dragging && dragging !== key) move(dragging, key); }}
                onDragEnd={() => setDragging(null)} onDrop={(e) => e.preventDefault()}
                className={`rounded-xl border bg-surface p-3 transition-all duration-200 ${dragging === key ? 'scale-[0.98] border-accent opacity-60 shadow-lg' : 'border-line'} ${shown ? '' : 'bg-subtle'}`}>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 cursor-grab select-none text-lg leading-none text-muted active:cursor-grabbing" title="Drag to reorder" aria-hidden="true">⠿</span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold ${shown ? '' : 'text-muted'}`}>{META[key].title}</p>
                    <p className="text-xs text-muted">{META[key].help}</p>
                  </div>
                  <Switch checked={shown} onChange={() => toggle(key)} label={`Show ${META[key].title}`} disabled={shown && visible === 1} />
                </div>
                <div className="mt-2.5 flex items-center gap-2 pl-7">
                  <Segmented label={`${META[key].title} width`} value={layout.size[key]} onChange={(size) => resize(key, size)} options={[['half', 'Half'], ['full', 'Full']]} />
                  <span className="flex-1" />
                  <button type="button" disabled={index === 0} onClick={() => move(key, index - 1)} aria-label={`Move ${META[key].title} up`}
                    className="grid h-7 w-7 place-items-center rounded-md border border-line text-muted hover:text-ink disabled:opacity-40">↑</button>
                  <button type="button" disabled={index === layout.order.length - 1} onClick={() => move(key, index + 1)} aria-label={`Move ${META[key].title} down`}
                    className="grid h-7 w-7 place-items-center rounded-md border border-line text-muted hover:text-ink disabled:opacity-40">↓</button>
                </div>
              </li>
            );
          })}
        </ol>
        <footer className="flex items-center gap-2 border-t border-line bg-subtle px-5 py-3">
          <Button variant="ghost" onClick={reset}>Reset to default</Button>
          <span className="flex-1 text-xs text-muted">{visible} of {layout.order.length} shown</span>
          <Button variant="primary" onClick={onClose}>Done</Button>
        </footer>
      </section>
    </div>
  );
}
