import React, { useEffect, useMemo, useState } from 'react';
import { analytics, teams } from '../../services/api';
import { readPreference, writePreference } from '../../services/preferences';
import { exportCsv } from '../../services/exportCsv';
import { notify } from '../../services/feedback';
import { Banner, Button, ErrorText, Input, Loading, PageHeader, Select, Tabs } from '../../ui';
import { PERIODS, periodLabel } from './periods';
import { DEFAULT_TASK_COLUMNS, TASK_COLUMNS, applyTaskFilters, statusText } from './reportColumns';
import { overview, topClients, weeklyTrend } from './reportMath';
import { exportReport } from './buildWorkbook';
import OverviewTab from './OverviewTab';
import MembersTab from './MembersTab';
import TasksTab from './TasksTab';
import CustomReportTab from './custom/CustomReportTab';

const EMPTY_FILTERS = { statuses: [], priorities: [], types: [], overdueOnly: false, search: '' };
const DownloadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
);

export default function Reports() {
  const [teamList, setTeamList] = useState([]);
  const [teamId, setTeamId] = useState('');
  const [periodId, setPeriodId] = useState(() => readPreference('report-period', '30d'));
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [tab, setTab] = useState('overview');
  const [report, setReport] = useState(null);
  const [rowsState, setRowsState] = useState({ rows: [], truncated: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [groupBy, setGroupBy] = useState('');
  const [columns, setColumnsState] = useState(() => readPreference('report-columns', DEFAULT_TASK_COLUMNS));
  const [exporting, setExporting] = useState(false);

  const period = PERIODS.find((p) => p.id === periodId) || PERIODS[1];
  const [from, to] = period.range ? period.range() : [custom.from, custom.to];

  useEffect(() => {
    teams.getAll().then((response) => {
      setTeamList(response.data);
      setTeamId((prev) => prev || String(response.data.find((t) => t.id === readPreference('team', null))?.id || response.data[0]?.id || ''));
    }).catch(() => setError('Could not load teams. Please retry.'));
  }, [retry]);

  useEffect(() => {
    if (!teamId) return undefined;
    const controller = new AbortController();
    const params = { ...(from ? { created_from: from } : {}), ...(to ? { created_to: to } : {}) };
    setLoading(true); setError('');
    Promise.all([analytics.report(teamId, params, controller.signal), analytics.reportTasks(teamId, { ...params, sort: 'newest' }, controller.signal)])
      .then(([members, tasks]) => { if (!controller.signal.aborted) { setReport(members.data); setRowsState(tasks.data); } })
      .catch((err) => { if (!controller.signal.aborted && err.name !== 'CanceledError') setError(err.response?.data?.error || 'Could not load the report.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [teamId, from, to, retry]);

  const allRows = rowsState.rows;
  const stats = useMemo(() => overview(allRows), [allRows]);
  const weeks = useMemo(() => weeklyTrend(allRows), [allRows]);
  const clients = useMemo(() => topClients(allRows), [allRows]);
  const taskRows = useMemo(() => applyTaskFilters(allRows, filters), [allRows, filters]);
  const team = teamList.find((t) => String(t.id) === teamId);

  const setColumns = (next) => { setColumnsState(next); writePreference('report-columns', next); };
  const choosePeriod = (id) => { setPeriodId(id); writePreference('report-period', id); };
  const filtersText = [
    filters.statuses.length && `status ${filters.statuses.map(statusText).join(', ')}`,
    filters.priorities.length && `priority ${filters.priorities.join(', ')}`,
    filters.types.length && `type ${filters.types.join(', ')}`,
    filters.overdueOnly && 'overdue only', filters.search && `search "${filters.search}"`,
  ].filter(Boolean).join(' · ');

  const downloadExcel = async () => {
    setExporting(true);
    try {
      await exportReport({ team, from, to, stats, weeks, report, taskRows, columns, groupBy, filtersText });
      notify('Excel report downloaded.', 'success');
    } catch { notify('Could not create the Excel file. Please retry.'); }
    finally { setExporting(false); }
  };
  const downloadCsv = () => {
    const chosen = TASK_COLUMNS.filter((column) => columns.includes(column.key)).map((column) => ({ key: column.key, label: column.label }));
    const flat = taskRows.map((row) => Object.fromEntries(TASK_COLUMNS.map((c) => [c.key, c.value ? c.value(row) : row[c.key]])));
    exportCsv(`${team?.name || 'team'}-tasks.csv`, chosen, flat);
  };

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-4">
      <PageHeader title="Reports" subtitle={`${team?.name || 'Team'} · ${periodLabel(from, to)}`} actions={<>
        <Button onClick={downloadCsv} disabled={!taskRows.length || loading}>CSV</Button>
        <Button variant="primary" onClick={downloadExcel} disabled={loading || exporting || !report}><DownloadIcon />{exporting ? 'Preparing…' : 'Download Excel'}</Button>
      </>} />
      <section className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">Team
          <Select className="min-w-[180px]" value={teamId} onChange={(e) => setTeamId(e.target.value)} aria-label="Report team">
            {teamList.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Period (task created date)</span>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Report period">
            {PERIODS.map((p) => (
              <button key={p.id} type="button" aria-pressed={periodId === p.id} onClick={() => choosePeriod(p.id)}
                className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold ${periodId === p.id ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface text-muted hover:text-ink'}`}>{p.label}</button>
            ))}
          </div>
        </div>
        {periodId === 'custom' && (
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">From<Input type="date" value={custom.from} max={custom.to || undefined} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">To<Input type="date" value={custom.to} min={custom.from || undefined} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></label>
          </div>
        )}
        {loading && <span role="status" className="pb-2 text-xs text-muted">Updating…</span>}
      </section>
      <ErrorText onRetry={() => setRetry((v) => v + 1)}>{error}</ErrorText>
      {rowsState.truncated && <Banner tone="warn">This period has more than {rowsState.limit} tasks. Only the newest {rowsState.limit} are included; pick a shorter period.</Banner>}
      <Tabs tabs={[['overview', 'Overview'], ['custom', 'Custom report'], ['members', 'Team members'], ['tasks', 'Task details', <span key="c" className="font-mono text-[10px] text-muted">{taskRows.length}</span>]]} value={tab} onChange={setTab} label="Report sections" />
      {!report && loading && <Loading>Building report…</Loading>}
      {report && tab === 'overview' && <OverviewTab stats={stats} weeks={weeks} clients={clients} />}
      {report && tab === 'custom' && <CustomReportTab taskRows={allRows} from={from} to={to} team={team} />}
      {report && tab === 'members' && <MembersTab report={report} />}
      {report && tab === 'tasks' && (
        <TasksTab rows={taskRows} filters={filters} setFilters={setFilters} groupBy={groupBy} setGroupBy={setGroupBy} columns={columns} setColumns={setColumns} />
      )}
    </div>
  );
}
