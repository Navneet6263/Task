import React, { useCallback, useEffect, useState } from 'react';
import { logs, teams } from '../../services/api';
import { notify } from '../../services/feedback';
import { Button, Input, PageHeader, Select, StatTile } from '../../ui';
import { buildActorOptions } from '../auditActors';
import LogTable from './LogTable';
import { exportLogs } from './exportLogs';

const ACTIVITIES = ['Task Created', 'Task Assigned', 'Task Updated', 'Task Completed', 'Task Commented', 'Overdue Alert'];
const EMPTY_EXTRA = { q: '', from: '', to: '' };

export default function AuditLogs() {
  const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  const isLead = ['admin', 'manager', 'company_admin'].includes(user.role);
  const [teamList, setTeamList] = useState([]);
  const [team, setTeam] = useState(null);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [actor, setActor] = useState('all');
  const [activity, setActivity] = useState('all');
  const [extra, setExtra] = useState(EMPTY_EXTRA);
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState({ total: 0, assigned: 0, completed: 0, alerts: 0 });
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, total_pages: 1 });
  const [actors, setActors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const fetchLogs = useCallback(async (target, pageNum, size, who, what, more) => {
    if (!target) return;
    setLoading(true);
    try {
      const hasExtra = Object.values(more).some(Boolean);
      const response = await logs.getByTeam(target.id, pageNum, size, who, what, ...(hasExtra ? [more] : []));
      const data = response.data;
      if (data?.data) {
        setRows(data.data);
        setPagination(data.pagination || { total: 0, page: pageNum, limit: size, total_pages: 1 });
        if (data.stats) setStats(data.stats);
        setActors(buildActorOptions(data.actors || []));
      } else if (Array.isArray(data)) {
        setRows(data); setPagination({ total: data.length, page: 1, limit: data.length || 20, total_pages: 1 });
      }
    } catch (err) { notify(err.response?.data?.error || 'Could not load the audit log.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    teams.getAll().then((response) => {
      const list = Array.isArray(response.data) ? response.data : [];
      setTeamList(list);
      if (list[0]) { setTeam(list[0]); fetchLogs(list[0], 1, 20, 'all', 'all', EMPTY_EXTRA); }
    }).catch(() => {});
  }, [fetchLogs]);

  // Every filter change goes back to page 1 and fetches once.
  const apply = (changes) => {
    const next = { team, limit, actor, activity, extra, ...changes };
    setTeam(next.team); setLimit(next.limit); setActor(next.actor); setActivity(next.activity); setExtra(next.extra); setPage(1);
    fetchLogs(next.team, 1, next.limit, next.actor, next.activity, next.extra);
  };
  useEffect(() => {
    if (search === extra.q) return undefined;
    const timer = setTimeout(() => apply({ extra: { ...extra, q: search.trim() } }), 350);
    return () => clearTimeout(timer);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const goTo = (next) => { if (next < 1 || next > pagination.total_pages) return; setPage(next); fetchLogs(team, next, limit, actor, activity, extra); };
  const filtered = actor !== 'all' || activity !== 'all' || Object.values(extra).some(Boolean);
  const reset = () => { setSearch(''); apply({ actor: 'all', activity: 'all', extra: EMPTY_EXTRA }); };
  const start = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const end = Math.min(pagination.page * pagination.limit, pagination.total);
  const filtersText = [activity !== 'all' && `activity ${activity}`, actor !== 'all' && `person ${actors.find((a) => a.key === actor)?.name || actor}`,
    extra.q && `search "${extra.q}"`, extra.from && `from ${extra.from}`, extra.to && `to ${extra.to}`].filter(Boolean).join(' · ');

  const download = async () => {
    setExporting(true);
    try { const count = await exportLogs({ team, actor, activity, extra, filtersText: filtersText && `Filters: ${filtersText}` }); notify(`Exported ${count} events.`, 'success'); }
    catch { notify('Could not create the Excel file. Please retry.'); }
    finally { setExporting(false); }
  };

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-4">
      <PageHeader title="Audit logs" subtitle="A record of who did what, and when, in each team. Use it to trace changes and review work."
        actions={<Button onClick={download} disabled={!team || exporting || !pagination.total}>{exporting ? 'Preparing…' : 'Export Excel'}</Button>} />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="All events" value={stats.total} />
        <StatTile label="Assignments" value={stats.assigned} />
        <StatTile label="Completions" value={stats.completed} />
        <StatTile label="Overdue alerts" value={stats.alerts} />
      </section>
      <section className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">Team
          <Select className="min-w-[170px]" value={team?.id || ''} onChange={(e) => apply({ team: teamList.find((t) => String(t.id) === e.target.value), actor: 'all' })}>
            {teamList.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">Activity
          <Select className="min-w-[160px]" value={activity} onChange={(e) => apply({ activity: e.target.value })}>
            <option value="all">All activity</option>{ACTIVITIES.map((a) => <option key={a} value={a}>{a}</option>)}
          </Select>
        </label>
        <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs font-medium text-muted">Search
          <Input placeholder="Task name or details" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">From<Input type="date" value={extra.from} max={extra.to || undefined} onChange={(e) => apply({ extra: { ...extra, from: e.target.value } })} /></label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">To<Input type="date" value={extra.to} min={extra.from || undefined} onChange={(e) => apply({ extra: { ...extra, to: e.target.value } })} /></label>
        {filtered && <Button variant="ghost" onClick={reset}>Clear filters</Button>}
      </section>
      {isLead && actors.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter by person">
          {[{ key: 'all', name: 'All Members', subtitle: 'Entire team' }, ...actors].map((option) => (
            <button key={option.key} type="button" aria-pressed={actor === option.key} onClick={() => apply({ actor: option.key })}
              className={`audit-member-chip flex shrink-0 flex-col rounded-md border px-3 py-1.5 text-left ${actor === option.key ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-subtle'}`}>
              <strong className="text-sm font-semibold">{option.name}</strong>
              <span className="text-[11px] text-muted">{option.subtitle}</span>
            </button>
          ))}
        </div>
      )}
      <LogTable rows={rows} loading={loading} canFilterActor={isLead} onActor={(key) => apply({ actor: key })} />
      <footer className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-muted">Showing <b className="text-ink">{start}</b>–<b className="text-ink">{end}</b> of <b className="text-ink">{pagination.total}</b></span>
        <div className="flex items-center gap-2">
          <Select aria-label="Rows per page" className="!w-auto py-1 text-xs" value={limit} onChange={(e) => apply({ limit: Number(e.target.value) })}>
            {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n} per page</option>)}
          </Select>
          <Button size="sm" disabled={page <= 1 || loading} onClick={() => goTo(1)} aria-label="First page">«</Button>
          <Button size="sm" disabled={page <= 1 || loading} onClick={() => goTo(page - 1)}>Previous</Button>
          <span className="font-mono text-xs text-muted">{page} / {pagination.total_pages}</span>
          <Button size="sm" disabled={page >= pagination.total_pages || loading} onClick={() => goTo(page + 1)}>Next</Button>
          <Button size="sm" disabled={page >= pagination.total_pages || loading} onClick={() => goTo(pagination.total_pages)} aria-label="Last page">»</Button>
        </div>
      </footer>
    </div>
  );
}
