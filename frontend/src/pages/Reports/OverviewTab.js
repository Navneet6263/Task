import React from 'react';
import { Card, CardHeader, Meter, StatTile } from '../../ui';
import StatusOverview from '../Dashboard/StatusOverview';

function WeeklyChart({ weeks }) {
  const max = Math.max(1, ...weeks.flatMap((w) => [w.created, w.completed]));
  const label = (key) => new Date(`${key}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  return (
    <Card>
      <CardHeader title="Created vs completed per week" aside={
        <span className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-info" />Created</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-accent" />Completed</span>
        </span>} />
      {!weeks.length ? <p className="px-4 py-10 text-center text-sm text-muted">No activity in this period.</p> : (
        <div className="overflow-x-auto px-4 pb-3 pt-4">
          <div className="flex h-48 min-w-[480px] items-end gap-3 border-b border-line">
            {weeks.map((w) => (
              <div key={w.week} className="flex h-full flex-1 flex-col justify-end">
                <div className="flex h-full items-end justify-center gap-1">
                  {[['created', 'bg-info'], ['completed', 'bg-accent']].map(([key, color]) => (
                    <div key={key} className="flex h-full w-1/2 max-w-[22px] flex-col justify-end" title={`${key === 'created' ? 'Created' : 'Completed'}: ${w[key]}`}>
                      <span className="mb-0.5 text-center font-mono text-[10px] text-muted">{w[key] || ''}</span>
                      <div className={`rounded-t ${color}`} style={{ height: `${(w[key] / max) * 85}%`, minHeight: w[key] ? 3 : 0 }} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex min-w-[480px] gap-3 pt-1.5">
            {weeks.map((w) => <span key={w.week} className="flex-1 text-center text-[10px] text-muted">{label(w.week)}</span>)}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function OverviewTab({ stats, weeks, clients }) {
  const maxClient = clients[0]?.total || 1;
  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Tasks" value={stats.total} />
        <StatTile label="Completed" value={stats.done} />
        <StatTile label="Completion" value={`${stats.completion}%`} />
        <StatTile label="On time" value={stats.measured ? `${stats.onTime}%` : '—'} />
        <StatTile label="Overdue" value={stats.overdue} />
        <StatTile label="Blocked" value={stats.blocked} />
      </section>
      <StatusOverview stats={stats.status} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <WeeklyChart weeks={weeks} />
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Priority" />
            <div className="flex flex-col gap-3 p-4">
              {[['HIGH', 'High', 'danger'], ['MEDIUM', 'Medium', 'warn'], ['LOW', 'Low', 'accent']].map(([key, text, tone]) => (
                <div key={key}>
                  <div className="mb-1 flex justify-between text-sm"><span>{text}</span><span className="font-mono text-xs text-muted">{stats.priority[key]}</span></div>
                  <Meter value={stats.priority[key]} max={stats.total || 1} tone={tone} label={`${text} priority`} />
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader title="Top clients" />
            <div className="flex flex-col gap-2.5 p-4">
              {!clients.length && <p className="text-sm text-muted">No client names on these tasks.</p>}
              {clients.map((client) => (
                <div key={client.name}>
                  <div className="mb-1 flex justify-between gap-2 text-sm"><span className="truncate">{client.name}</span><span className="font-mono text-xs text-muted">{client.total}</span></div>
                  <Meter value={client.total} max={maxClient} tone="info" label={`${client.name} tasks`} />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
      <p className="text-xs text-muted">On time compares the completion date with the due date, for completed tasks that have both. Overdue counts open tasks past their due date.</p>
    </div>
  );
}
