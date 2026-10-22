import React, { useEffect, useState } from 'react';
import { Button, Chip } from '../../../ui';
import { ACTION_TONE, actionLabel, initials, ROUTINE_ACTIONS, timeAgo } from '../consoleUtils';

// Counts up to `value` once; shows the final number straight away for reduced-motion users.
function useCountUp(value) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const reduce = !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !window.requestAnimationFrame) { setShown(value); return undefined; }
    let frame; const start = performance.now();
    const tick = (now) => { const t = Math.min(1, (now - start) / 700); setShown(Math.round(value * (1 - (1 - t) ** 3))); if (t < 1) frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return shown;
}

const Dot = ({ tone }) => <span className={`h-2 w-2 shrink-0 rounded-full ${{ ok: 'bg-accent', warn: 'bg-warn', danger: 'bg-danger', info: 'bg-info' }[tone] || 'bg-muted'}`} />;
const Avatar = ({ name }) => <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent">{initials(name)}</span>;

function Kpi({ label, value, hint, tone, onClick }) {
  const shown = useCountUp(Number(value) || 0);
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
      className={`group rounded-xl border bg-surface p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${tone === 'warn' && value > 0 ? 'border-warn/40' : 'border-line'}`}>
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted"><Dot tone={tone} />{label}</p>
      <p className="mt-2 font-mono text-3xl font-semibold tabular-nums">{shown.toLocaleString('en-IN')}</p>
      <p className="mt-1 text-xs text-muted">{hint}{onClick && <span className="ml-1 text-accent opacity-0 transition group-hover:opacity-100">→</span>}</p>
    </Tag>
  );
}

export function KpiRow({ data, counts, go }) {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Kpi label="Companies" value={data.admins.length} hint={`${counts.approved} approved`} tone="ok" onClick={() => go('companies', { status: 'all' })} />
      <Kpi label="Organizations" value={data.total_orgs} hint="Workspaces across all companies" tone="info" />
      <Kpi label="Users" value={data.total_users} hint="Active people on the platform" tone="info" />
      <Kpi label="Pending" value={data.pending_count} hint={data.pending_count ? 'Waiting for your decision' : 'Nothing waiting'} tone="warn" onClick={() => go('companies', { status: 'pending' })} />
    </div>
  );
}

export function ApprovalQueue({ admins, go }) {
  const pending = admins.filter((a) => a.status === 'pending').sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  if (!pending.length) return (
    <div className="grid place-items-center py-8 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-accent-soft text-xl text-accent">✓</span>
      <p className="mt-3 font-semibold">All caught up</p><p className="text-sm text-muted">No company is waiting for approval.</p>
    </div>
  );
  return (
    <ul className="flex flex-col divide-y divide-line">
      {pending.slice(0, 5).map((admin) => (
        <li key={admin.id} className="flex items-center gap-3 py-2.5">
          <Avatar name={admin.name} />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{admin.name}</span><span className="block truncate text-xs text-muted">{admin.email}</span></span>
          <span className="hidden text-xs text-muted sm:block">waiting {timeAgo(admin.created_at).replace(' ago', '')}</span>
          <Button size="sm" variant="primary" onClick={() => go('companies', { status: 'pending', id: admin.id })}>Review</Button>
        </li>
      ))}
      {pending.length > 5 && <li className="pt-2.5"><button type="button" className="text-sm font-semibold text-accent hover:underline" onClick={() => go('companies', { status: 'pending' })}>See all {pending.length} pending →</button></li>}
    </ul>
  );
}

export function StatusDonut({ counts, go }) {
  const total = counts.approved + counts.pending + counts.rejected;
  const parts = [['approved', 'Approved', 'var(--c-accent)'], ['pending', 'Pending', 'var(--c-warn)'], ['rejected', 'Rejected', 'var(--c-danger)']];
  let from = 0;
  const stops = parts.map(([key, , color]) => { const to = from + (total ? (counts[key] / total) * 360 : 0); const stop = `rgb(${color}) ${from}deg ${to}deg`; from = to; return stop; });
  return (
    <div className="flex flex-wrap items-center gap-6 py-2">
      <div className="relative h-36 w-36 shrink-0 rounded-full motion-safe:animate-fade-in" style={{ background: total ? `conic-gradient(${stops.join(',')})` : 'rgb(var(--c-line))' }}>
        <div className="absolute inset-[18px] grid place-items-center rounded-full bg-surface text-center">
          <span><span className="block font-mono text-2xl font-semibold">{total}</span><span className="text-xs text-muted">companies</span></span>
        </div>
      </div>
      <ul className="flex min-w-[160px] flex-1 flex-col gap-1">
        {parts.map(([key, label, color]) => (
          <li key={key}>
            <button type="button" onClick={() => go('companies', { status: key })} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-subtle">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: `rgb(${color})` }} />{label}
              <span className="ml-auto font-mono font-semibold">{counts[key]}</span>
              <span className="w-10 text-right text-xs text-muted">{total ? Math.round((counts[key] / total) * 100) : 0}%</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GrowthBars({ admins }) {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1); return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString('en-IN', { month: 'short' }), count: 0 }; });
  admins.forEach((a) => { const d = new Date(a.created_at); const m = months.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`); if (m) m.count += 1; });
  const max = Math.max(1, ...months.map((m) => m.count));
  const total = months.reduce((s, m) => s + m.count, 0);
  return (
    <div>
      <p className="mb-3 text-sm text-muted"><strong className="font-mono text-ink">{total}</strong> new in the last six months</p>
      <div className="flex h-40 items-end gap-3">
        {months.map((m, i) => (
          <div key={m.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <span className="font-mono text-xs font-semibold">{m.count}</span>
            <div className={`w-full max-w-[44px] origin-bottom rounded-t-md motion-safe:animate-grow-y ${i === 5 ? 'bg-accent' : 'bg-accent/35'}`}
              style={{ height: `${Math.max(4, (m.count / max) * 100)}%`, animationDelay: `${i * 70}ms` }} />
            <span className={`text-xs ${i === 5 ? 'font-semibold text-ink' : 'text-muted'}`}>{m.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LargestCompanies({ admins, go }) {
  const top = [...admins].sort((a, b) => Number(b.total_users || 0) - Number(a.total_users || 0)).slice(0, 5);
  const max = Math.max(1, ...top.map((a) => Number(a.total_users || 0)));
  if (!top.length) return <p className="py-6 text-center text-sm text-muted">No companies yet.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {top.map((admin, i) => (
        <li key={admin.id}>
          <button type="button" onClick={() => go('companies', { status: 'all', id: admin.id })} className="w-full text-left">
            <span className="flex items-center justify-between gap-3 text-sm"><span className="truncate font-medium">{admin.name}</span>
              <span className="shrink-0 text-xs text-muted"><strong className="font-mono text-ink">{admin.total_users || 0}</strong> users · {admin.org_count || 0} orgs</span></span>
            <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-subtle">
              <span className="block h-full origin-left rounded-full bg-accent motion-safe:animate-grow-x" style={{ width: `${(Number(admin.total_users || 0) / max) * 100}%`, animationDelay: `${i * 80}ms` }} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function RecentActivity({ logs, go }) {
  const rows = logs.filter((log) => !ROUTINE_ACTIONS.includes(log.action)).slice(0, 8);
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted">No changes yet. Approvals, limits and module changes appear here.</p>;
  return (
    <ol className="relative flex flex-col gap-3 before:absolute before:bottom-2 before:left-[17px] before:top-2 before:w-px before:bg-line">
      {rows.map((log) => (
        <li key={log.id} className="relative flex items-start gap-3">
          <span className="relative z-[1] grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-surface text-[11px] font-bold text-muted">{initials(log.actor_name || log.actor_email)}</span>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-sm"><strong className="font-semibold">{log.actor_name || log.actor_email}</strong> <Chip tone={ACTION_TONE[log.action] || 'neutral'}>{actionLabel(log.action)}</Chip></p>
            <p className="truncate text-xs text-muted">{log.description}</p>
          </div>
          <span className="shrink-0 pt-1 text-xs text-muted">{timeAgo(log.created_at)}</span>
        </li>
      ))}
      <li><button type="button" className="ml-12 text-sm font-semibold text-accent hover:underline" onClick={() => go('activity')}>View all activity →</button></li>
    </ol>
  );
}
