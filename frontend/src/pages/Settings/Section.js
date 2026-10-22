import React from 'react';

// Every settings section opens with a plain-language title and one line on what it does.
export default function Section({ title, description, actions, children }) {
  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">{description}</p>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

// A labelled row: label and help on the left, the control on the right.
export function SettingRow({ label, help, children }) {
  return (
    <div className="grid grid-cols-1 gap-2 border-b border-line py-4 last:border-b-0 md:grid-cols-[240px_minmax(0,1fr)] md:gap-6">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {help && <p className="mt-0.5 text-xs text-muted">{help}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
