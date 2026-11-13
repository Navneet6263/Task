import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { Banner, Loading } from '../../ui';

// Status colours match the status dots used across the app; text stays in ink tokens.
const STATUSES = [['todo', 'To do', 'bg-muted'], ['in_progress', 'In progress', 'bg-info'], ['pending', 'Pending', 'bg-warn'], ['done', 'Done', 'bg-accent']];
const PRIORITIES = [['high', 'High', 'bg-danger'], ['medium', 'Medium', 'bg-warn'], ['low', 'Low', 'bg-info']];
const TYPE_NAMES = { task: 'Task', bug: 'Bug', story: 'Story', feature: 'Feature', enhancement: 'Improvement' };
const when = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const minutes = Math.round((Date.now() - d.getTime()) / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} h ago`;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

function Tile({ value, label, sub, icon, onClick }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      className="flex items-center gap-3.5 rounded-xl border border-line bg-surface p-4 text-left transition enabled:hover:border-accent/50 enabled:hover:shadow-sm">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-subtle text-lg" aria-hidden="true">{icon}</span>
      <span><span className="block text-[15px] font-semibold"><span className="font-mono">{value}</span> {label}</span><span className="block text-xs text-muted">{sub}</span></span>
    </button>
  );
}

function Panel({ title, sub, children, className = '' }) {
  return (
    <section className={`rounded-xl border border-line bg-surface p-5 ${className}`}>
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {sub && <p className="mb-4 text-xs text-muted">{sub}</p>}
      {children}
    </section>
  );
}

// One horizontal bar per row, single hue, value labelled at the end. Hover shows the exact figure.
function Bars({ rows, tone = 'bg-accent', unit = 'tasks' }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[110px_minmax(0,1fr)_36px] items-center gap-3 text-sm" title={`${r.label}: ${r.value} ${unit}${r.extra ? ` · ${r.extra}` : ''}`}>
          <span className="truncate text-muted">{r.label}</span>
          <span className="h-2.5 overflow-hidden rounded-r-full bg-subtle"><span className={`block h-full rounded-r-full ${r.tone || tone} transition-all duration-700`} style={{ width: `${(r.value / max) * 100}%` }} /></span>
          <span className="text-right font-mono text-xs font-semibold">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

// Space → Summary: what moved in the last 7 days and where the work stands, like a Jira summary.
export default function SpaceSummary({ teamId, onGo }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setData(null); setError('');
    api.get(`/teams/${teamId}/summary`).then((r) => setData(r.data)).catch((err) => setError(err.response?.data?.error || 'Could not load the summary.'));
  }, [teamId]);
  if (error) return <Banner tone="danger">{error}</Banner>;
  if (!data) return <Loading>Loading the summary…</Loading>;
  const c = data.counts;
  const total = c.total || 0;
  const open = (c.todo || 0) + (c.in_progress || 0) + (c.pending || 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile icon="✅" value={c.done_7d} label="completed" sub="in the last 7 days" onClick={() => onGo('list')} />
        <Tile icon="✏️" value={c.updated_7d} label="updated" sub="in the last 7 days" onClick={() => onGo('list')} />
        <Tile icon="➕" value={c.created_7d} label="created" sub="in the last 7 days" onClick={() => onGo('list')} />
        <Tile icon="📅" value={c.due_7d} label="due soon" sub={c.overdue ? `in the next 7 days · ${c.overdue} overdue` : 'in the next 7 days'} onClick={() => onGo('calendar')} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Status overview" sub={`Where all ${total} tasks stand.`}>
          {total ? (
            <>
              <div className="flex h-4 w-full overflow-hidden rounded-full bg-subtle" role="img" aria-label={STATUSES.map(([k, l]) => `${l} ${c[k] || 0}`).join(', ')}>
                {STATUSES.filter(([k]) => c[k]).map(([k, label, tone]) => (
                  <span key={k} title={`${label}: ${c[k]} (${Math.round((c[k] / total) * 100)}%)`} className={`${tone} h-full border-r-2 border-surface last:border-r-0 transition-all duration-700`} style={{ width: `${(c[k] / total) * 100}%` }} />
                ))}
              </div>
              <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {STATUSES.map(([k, label, tone]) => (
                  <li key={k} className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-1.5 text-xs text-muted"><span className={`h-2.5 w-2.5 rounded-sm ${tone}`} />{label}</span>
                    <span className="font-mono text-xl font-semibold">{c[k] || 0}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">{open} open · {total ? Math.round(((c.done || 0) / total) * 100) : 0}% done overall</p>
            </>
          ) : <p className="text-sm text-muted">No tasks in this space yet.</p>}
        </Panel>

        <Panel title="Recent activity" sub="The latest changes in this space.">
          {data.activity.length ? (
            <ul className="flex max-h-64 flex-col gap-3 overflow-y-auto pr-1">
              {data.activity.map((a) => (
                <li key={a.id} className="flex gap-3 text-sm">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">{String(a.user_name || 'S').slice(0, 1).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block"><strong className="font-semibold">{a.user_name || 'System'}</strong> <span className="text-muted">{String(a.activity || '').toLowerCase()}</span>{a.task_details && <> · <span className="font-medium">{a.task_details}</span></>}</span>
                    <span className="text-xs text-muted">{when(a.created_at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">Nothing has happened here yet.</p>}
        </Panel>

        <Panel title="Priority breakdown" sub="Open tasks by priority.">
          <Bars rows={PRIORITIES.map(([k, label, tone]) => ({ label, value: c[k] || 0, tone }))} />
        </Panel>

        <Panel title="Types of work" sub="All tasks by type.">
          {data.types.length ? <Bars rows={data.types.map((t) => ({ label: TYPE_NAMES[t.type] || t.type, value: t.count }))} /> : <p className="text-sm text-muted">No tasks yet.</p>}
        </Panel>

        <Panel title="Team workload" sub="Open tasks per person; hover for overdue and done in 30 days." className="xl:col-span-2">
          {data.workload.length ? (
            <Bars unit="open tasks" rows={data.workload.map((w) => ({ label: w.name, value: w.open, extra: `${w.overdue} overdue, ${w.done_30d} done in 30 days`, tone: w.overdue ? 'bg-warn' : 'bg-accent' }))} />
          ) : <p className="text-sm text-muted">No one has tasks here yet.</p>}
          {data.workload.some((w) => w.overdue) && <p className="mt-3 flex items-center gap-1.5 text-xs text-muted"><span className="h-2.5 w-2.5 rounded-sm bg-warn" />Has overdue tasks</p>}
        </Panel>
      </div>
    </div>
  );
}
