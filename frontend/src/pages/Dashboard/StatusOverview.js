import React from 'react';

const SEGMENTS = [
  { key: 'todo', label: 'To do', bar: 'bg-muted/40' },
  { key: 'inProgress', label: 'In progress', bar: 'bg-info' },
  { key: 'pending', label: 'Pending', bar: 'bg-warn' },
  { key: 'done', label: 'Done', bar: 'bg-accent' },
];

// One stacked bar of the whole team's work by status, drawn to scale.
export default function StatusOverview({ stats }) {
  const total = SEGMENTS.reduce((sum, segment) => sum + Number(stats[segment.key] || 0), 0);
  return (
    <section className="rounded-lg border border-line bg-surface px-4 py-3" aria-label="Work by status">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Work by status</h3>
        <span className="font-mono text-xs text-muted">{total} tasks</span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-subtle">
        {total > 0 && SEGMENTS.map((segment) => {
          const value = Number(stats[segment.key] || 0);
          return value ? <div key={segment.key} className={`${segment.bar} h-full`} style={{ width: `${(value / total) * 100}%` }} title={`${segment.label}: ${value}`} /> : null;
        })}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1">
        {SEGMENTS.map((segment) => (
          <li key={segment.key} className="flex items-center gap-1.5 text-xs text-muted">
            <span className={`h-2 w-2 rounded-full ${segment.bar}`} />
            {segment.label} <b className="font-mono font-semibold text-ink">{Number(stats[segment.key] || 0)}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}
