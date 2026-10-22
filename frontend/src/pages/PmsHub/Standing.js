import React from 'react';
import { Card, CardHeader, Chip, Meter } from '../../ui';
import { fmtDays, standing, versus } from './insights';

function Compare({ value, suffix }) {
  if (value === null) return <span className="text-xs text-muted">No team comparison yet</span>;
  if (Math.abs(value) < 5) return <span className="text-xs text-muted">Same as the team</span>;
  return <span className={`text-xs font-semibold ${value > 0 ? 'text-accent' : 'text-warn'}`}>{value > 0 ? '▲' : '▼'} {Math.abs(value)}% {value > 0 ? suffix[0] : suffix[1]}</span>;
}

// Headline tiles: each shows your number, the team's, and how you compare.
export function KpiTiles({ data }) {
  const { me, team, now } = data;
  const tiles = [
    { label: 'Tasks completed', value: me.completed, team: team.completed !== null ? `Team average ${team.completed}` : null, cmp: versus(me.completed, team.completed), suffix: ['more than team', 'fewer than team'] },
    { label: 'Typical time per task', value: fmtDays(me.medianDays), team: team.medianDays !== null ? `Team ${fmtDays(team.medianDays)}` : null, cmp: versus(me.medianDays, team.medianDays, true), suffix: ['faster than team', 'slower than team'] },
    { label: 'Finished on time', value: me.onTimeRate === null ? '—' : `${me.onTimeRate}%`, team: team.onTimeRate !== null ? `Team ${team.onTimeRate}%` : null, cmp: versus(me.onTimeRate, team.onTimeRate), suffix: ['better than team', 'below team'] },
    { label: 'Open right now', value: now.open, team: `${now.inProgress} in progress`, overdue: now.overdue },
  ];
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => (
        <article key={tile.label} className="flex flex-col gap-1 rounded-lg border border-line bg-surface px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{tile.label}</p>
          <p className="font-mono text-[26px] font-semibold leading-tight">{tile.value}</p>
          <p className="text-xs text-muted">{tile.team || ' '}</p>
          {tile.overdue !== undefined
            ? <span className={`text-xs font-semibold ${tile.overdue ? 'text-danger' : 'text-accent'}`}>{tile.overdue ? `${tile.overdue} overdue` : 'Nothing overdue'}</span>
            : <Compare value={tile.cmp} suffix={tile.suffix} />}
        </article>
      ))}
    </section>
  );
}

// Where you stand against the team on output, speed and reliability.
export function StandingCard({ data }) {
  const rows = [
    ['Output', 'tasks completed', data.rank.completed],
    ['Speed', 'time per task', data.rank.speed],
    ['Reliability', 'on-time completion', data.rank.onTime],
  ];
  return (
    <Card>
      <CardHeader title="Where you stand" aside={`Compared with ${data.team.people} teammate${data.team.people === 1 ? '' : 's'}`} />
      <div className="flex flex-col gap-4 p-4">
        {rows.map(([label, about, pct]) => {
          const tag = standing(pct);
          return (
            <div key={label}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-sm"><b className="font-semibold">{label}</b> <span className="text-muted">· {about}</span></span>
                {tag ? <Chip tone={tag.tone}>{tag.label}</Chip> : <Chip>Not enough data</Chip>}
              </div>
              <Meter value={pct ?? 0} tone={pct >= 60 ? 'accent' : pct >= 40 ? 'info' : 'warn'} label={`${label} percentile`} />
              <p className="mt-1 text-xs text-muted">{pct === null ? 'Needs at least two people with completed tasks.' : `Ahead of ${pct}% of your team`}</p>
            </div>
          );
        })}
        <p className="text-xs text-muted">Your teammates are never shown by name. Numbers cannot capture task size or complexity, so use them as a guide for conversations, not a verdict.</p>
      </div>
    </Card>
  );
}
