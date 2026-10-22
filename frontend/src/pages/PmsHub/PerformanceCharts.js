import React from 'react';
import { Card, CardHeader } from '../../ui';

const weekLabel = (key) => new Date(`${key}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

// Your completions per week (bars) against the team's per-person average (marker).
export function WeeklyChart({ weeks }) {
  const max = Math.max(1, ...weeks.flatMap((w) => [w.mine, w.teamAverage || 0]));
  return (
    <Card>
      <CardHeader title="Tasks completed per week" aside={
        <span className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-accent" />You</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 bg-warn" />Team average</span>
        </span>} />
      {!weeks.length ? <p className="px-4 py-10 text-center text-sm text-muted">No completed tasks in this period.</p> : (
        <div className="overflow-x-auto px-4 pb-3 pt-4">
          <div className="flex h-44 min-w-[420px] items-end gap-2 border-b border-line">
            {weeks.map((w) => (
              <div key={w.week} className="relative flex h-full flex-1 flex-col items-center justify-end" title={`Week of ${weekLabel(w.week)}: you ${w.mine}, team average ${w.teamAverage ?? 0}`}>
                <span className="mb-0.5 font-mono text-[10px] text-muted">{w.mine || ''}</span>
                <div className="w-full max-w-[28px] rounded-t bg-accent" style={{ height: `${(w.mine / max) * 85}%`, minHeight: w.mine ? 3 : 0 }} />
                {w.teamAverage > 0 && <div className="absolute left-1/2 h-0.5 w-[70%] max-w-[36px] -translate-x-1/2 bg-warn" style={{ bottom: `${(w.teamAverage / max) * 85}%` }} />}
              </div>
            ))}
          </div>
          <div className="flex min-w-[420px] gap-2 pt-1.5">{weeks.map((w) => <span key={w.week} className="flex-1 text-center text-[10px] text-muted">{weekLabel(w.week)}</span>)}</div>
        </div>
      )}
    </Card>
  );
}

// How long your tasks took, grouped into ranges.
export function DurationChart({ buckets }) {
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <Card>
      <CardHeader title="How long your tasks took" aside={`${total} tasks`} />
      <div className="flex flex-col gap-2.5 p-4">
        {buckets.map((b) => (
          <div key={b.label} className="grid grid-cols-[96px_minmax(0,1fr)_56px] items-center gap-3 text-sm">
            <span className="text-muted">{b.label}</span>
            <div className="h-2.5 overflow-hidden rounded-full bg-subtle"><div className="h-full rounded-full bg-info" style={{ width: `${(b.count / max) * 100}%` }} /></div>
            <span className="text-right font-mono text-xs">{b.count}{total ? ` · ${Math.round((b.count / total) * 100)}%` : ''}</span>
          </div>
        ))}
        <p className="pt-1 text-xs text-muted">Measured from the start date (or assigned or created date) to the day it was completed.</p>
      </div>
    </Card>
  );
}
