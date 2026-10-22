import React from 'react';

const CHOICES = [
  [true, 'Yes — only from this list', 'In Create task, Client becomes a dropdown of this list. Employees can’t type a new name; they see “Client names are added by your manager or admin”. Managers and admins can still add one from the form.'],
  [false, 'No — people can type any name', 'Anyone can type a client name. New names are added to this list automatically, so you can tidy them up here.'],
];

// The one rule for the client field on every task form.
export default function ClientRule({ pickOnly, onChange, busy }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">Rule for Create task</p>
      <h3 className="mt-1 text-[15px] font-semibold">When someone creates a task, should they pick the client only from this list?</h3>
      <div role="radiogroup" aria-label="Client rule" className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
        {CHOICES.map(([value, title, help]) => {
          const active = pickOnly === value;
          return (
            <button key={String(value)} type="button" role="radio" aria-checked={active} disabled={busy} onClick={() => !active && onChange(value)}
              className={`flex gap-3 rounded-lg border p-3.5 text-left transition duration-200 ${active ? 'border-accent bg-accent-soft ring-2 ring-accent/15' : 'border-line hover:border-muted'} disabled:opacity-60`}>
              <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${active ? 'border-accent' : 'border-line'}`}>
                {active && <span className="h-2 w-2 rounded-full bg-accent" />}
              </span>
              <span><span className="block text-sm font-semibold">{title}</span><span className="mt-0.5 block text-xs leading-relaxed text-muted">{help}</span></span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
