import React from 'react';
import { Meter } from '../../ui';

// `tone` keeps the historical class names (tested); `meter` is the UI kit colour.
const MetricCards = ({ stats, teamList }) => {
  const share = (value) => (stats.total ? Math.round((value / stats.total) * 100) : 0);
  const metrics = [
    { label: 'Total Tasks', value: stats.total, note: `${teamList.length} ${teamList.length === 1 ? 'team' : 'teams'}`, tone: 'blue' },
    { label: 'Open Queue', value: stats.open, note: `${stats.inProgress} in progress`, progress: share(stats.open), tone: 'amber', meter: 'warn' },
    { label: 'Completed', value: `${stats.completion}%`, note: `${stats.done} finished`, progress: stats.completion, tone: 'green', meter: 'accent' },
    { label: 'Overdue', value: stats.overdue, note: stats.overdue ? 'Needs attention' : 'On track', progress: share(stats.overdue), tone: 'coral', meter: 'danger' },
  ];

  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {metrics.map((card) => (
        <article key={card.label} className={`dashboard-metric-card dashboard-metric-${card.tone} flex flex-col gap-2 rounded-lg border border-line bg-surface px-4 py-3`}>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{card.label}</p>
            {card.progress !== undefined && <span className="font-mono text-xs text-muted">{card.progress}%</span>}
          </div>
          <h3 className={`font-mono text-[26px] font-semibold leading-none tabular-nums ${card.tone === 'coral' && stats.overdue ? 'text-danger' : ''}`}>{card.value}</h3>
          {card.meter ? <Meter value={card.progress} tone={card.meter} label={`${card.label} share`} /> : <div className="h-1.5" />}
          <span className="text-xs text-muted">{card.note}</span>
        </article>
      ))}
    </section>
  );
};

export default MetricCards;
