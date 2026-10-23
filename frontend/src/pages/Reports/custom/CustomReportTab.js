import React, { useEffect, useMemo, useState } from 'react';
import { timesheet } from '../../../services/api';
import useTaskFormLayout from '../../../components/taskForm/useTaskFormLayout';
import { readPreference, writePreference } from '../../../services/preferences';
import { localDate } from '../../../services/localDate';
import { notify } from '../../../services/feedback';
import { Banner, Button, Card, Input, Segmented, Select } from '../../../ui';
import { periodLabel } from '../periods';
import { DIMENSIONS, METRICS, TEMPLATES, buildPivot, dimensionsFor, metricsFor } from './customReport';
import CustomResult from './CustomResult';
import { exportCustomReport, reportTitle } from './exportCustom';
import useTimeRows from './useTimeRows';

const DEFAULT = TEMPLATES.find((t) => t.id === 'tasksPerClient').config;
const yearAgo = () => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); d.setDate(d.getDate() + 1); return localDate(d); };
const Step = ({ n, title, help, children }) => (
  <div>
    <p className="flex items-center gap-2 text-sm font-semibold"><span className="grid h-5 w-5 place-items-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">{n}</span>{title}</p>
    {help && <p className="mb-1.5 mt-0.5 pl-7 text-xs text-muted">{help}</p>}
    <div className="pl-7">{children}</div>
  </div>
);

// Build any report: pick what to count, how to group rows and columns, and which numbers to show.
export default function CustomReportTab({ taskRows, from, to, team }) {
  const [config, setConfigState] = useState(() => ({ ...DEFAULT, ...readPreference('custom-report-config', {}) }));
  const [saved, setSaved] = useState(() => readPreference('custom-reports', []));
  const [saveName, setSaveName] = useState('');
  const [exporting, setExporting] = useState(false);
  const [include, setInclude] = useState(() => readPreference('custom-report-hours-from', 'all'));

  const [timesheetOn, setTimesheetOn] = useState(false);
  useEffect(() => { timesheet.status().then((r) => setTimesheetOn(Boolean(r.data?.enabled))).catch(() => {}); }, []);
  const taskLogsOn = Boolean(useTaskFormLayout()?.can_edit);
  const hoursOn = timesheetOn || taskLogsOn;
  const timeFrom = from || yearAgo(), timeTo = to || localDate();
  const time = useTimeRows({ active: config.source === 'time', from: timeFrom, to: timeTo, timesheetOn, taskLogsOn, include });

  const setConfig = (patch) => setConfigState((prev) => { const next = { ...prev, ...patch }; writePreference('custom-report-config', next); return next; });
  const setSource = (source) => setConfig({ source, rowDim: source === 'time' ? 'person' : 'client', splitDim: '', metrics: [metricsFor(source)[0].id] });
  const toggleMetric = (id) => setConfig({ metrics: config.metrics.includes(id) ? config.metrics.filter((m) => m !== id) : [...config.metrics, id] });
  const persistSaved = (next) => { setSaved(next); writePreference('custom-reports', next); };
  const chooseInclude = (value) => { setInclude(value); writePreference('custom-report-hours-from', value); };

  const source = config.source === 'time' && !hoursOn ? 'task' : config.source;
  const view = source === config.source ? config : DEFAULT;
  const rows = source === 'time' ? time.rows : taskRows;
  const pivot = useMemo(() => buildPivot(rows, view), [rows, view]);
  const dims = dimensionsFor(source), metrics = metricsFor(source);
  const title = reportTitle(view);
  const hoursLabel = include === 'timesheet' ? 'Timesheet hours' : include === 'task' ? 'Hours logged on tasks' : 'All hours worked';
  const scopeLabel = source === 'time' ? `${hoursLabel} · whole organization` : `Tasks · ${team?.name || 'team'}`;
  const ready = TEMPLATES.filter((t) => !t.needsTime || hoursOn);
  const savedName = saved.find((s) => JSON.stringify(s.config) === JSON.stringify(view))?.name;

  const download = async () => {
    setExporting(true);
    try {
      await exportCustomReport({ pivot, config: view, name: savedName, scopeLabel, from: source === 'time' ? timeFrom : from, to: source === 'time' ? timeTo : to, rawRows: rows });
      notify('Excel report downloaded.', 'success');
    } catch { notify('Could not create the Excel file. Please retry.'); }
    finally { setExporting(false); }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="flex h-fit flex-col gap-5 p-4">
        <Step n="1" title="Start from a ready report" help="One click, then change anything below.">
          <div className="flex flex-wrap gap-1.5">
            {ready.map((t) => (
              <button key={t.id} type="button" onClick={() => setConfig(t.config)} aria-pressed={JSON.stringify(t.config) === JSON.stringify(view)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${JSON.stringify(t.config) === JSON.stringify(view) ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface text-muted hover:border-accent/60 hover:text-accent'}`}>{t.label}</button>
            ))}
          </div>
        </Step>
        <Step n="2" title="What do you want to count?">
          <Segmented label="Data" value={source} onChange={setSource} options={[['task', 'Tasks'], ...(hoursOn ? [['time', 'Hours worked']] : [])]} className="w-full [&>button]:flex-1" />
          {source === 'time' && timesheetOn && taskLogsOn && (
            <div className="mt-2"><p className="mb-1 text-xs text-muted">Hours from</p>
              <Segmented label="Hours from" value={include} onChange={chooseInclude} options={[['all', 'Both'], ['timesheet', 'Timesheet'], ['task', 'Task logs']]} className="w-full [&>button]:flex-1" /></div>
          )}
          {!hoursOn && <p className="mt-1 text-xs text-muted">Hours appear here once your company uses the Timesheet or logs time on tasks.</p>}
        </Step>
        <Step n="3" title="One row for each…">
          <Select aria-label="Rows" value={view.rowDim} onChange={(e) => setConfig({ rowDim: e.target.value, splitDim: view.splitDim === e.target.value ? '' : view.splitDim })}>
            {dims.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </Select>
        </Step>
        <Step n="4" title="Split into columns by…" help="Optional. Example: people as rows, clients as columns.">
          <Select aria-label="Split columns by" value={view.splitDim} onChange={(e) => setConfig({ splitDim: e.target.value })}>
            <option value="">No split</option>{dims.filter((d) => d.id !== view.rowDim).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </Select>
        </Step>
        <Step n="5" title="Numbers to show" help={view.splitDim ? 'With a split, the first number is spread across the columns.' : null}>
          <div className="flex flex-col gap-0.5">
            {metrics.map((m) => (
              <label key={m.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-subtle">
                <input type="checkbox" className="h-4 w-4 accent-accent" checked={view.metrics.includes(m.id)} disabled={view.metrics.length === 1 && view.metrics[0] === m.id} onChange={() => toggleMetric(m.id)} />
                {m.label}{view.metrics[0] === m.id && <span className="ml-auto text-[10px] font-semibold uppercase text-accent">main</span>}
              </label>
            ))}
          </div>
        </Step>
        <div className="grid grid-cols-2 gap-2 pl-7">
          <label className="text-xs text-muted">Sort<Select value={view.sort} onChange={(e) => setConfig({ sort: e.target.value })}><option value="metric">Highest first</option><option value="name">A–Z / oldest first</option></Select></label>
          <label className="text-xs text-muted">Show<Select value={view.limit} onChange={(e) => setConfig({ limit: Number(e.target.value) })}><option value={0}>All rows</option><option value={10}>Top 10</option><option value={25}>Top 25</option></Select></label>
        </div>
        <div className="border-t border-line pt-3">
          <p className="mb-1.5 text-sm font-semibold">Save this report</p>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const name = saveName.trim().slice(0, 40); if (!name) return; persistSaved([{ name, config: view }, ...saved.filter((s) => s.name !== name)].slice(0, 12)); setSaveName(''); notify(`Saved "${name}".`, 'success'); }}>
            <Input aria-label="Report name" placeholder="e.g. Monthly hours per client" value={saveName} onChange={(e) => setSaveName(e.target.value)} />
            <Button type="submit" size="sm" disabled={!saveName.trim()}>Save</Button>
          </form>
          {saved.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {saved.map((s) => (
                <li key={s.name} className="flex items-center rounded hover:bg-subtle">
                  <button type="button" className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm font-medium" onClick={() => setConfig(s.config)}>{s.name}</button>
                  <button type="button" aria-label={`Delete ${s.name}`} className="px-2 text-muted hover:text-danger" onClick={() => persistSaved(saved.filter((x) => x.name !== s.name))}>&times;</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
      <div className="flex min-w-0 flex-col gap-3">
        <Card className="flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold first-letter:uppercase">{savedName || title}</h2>
            <p className="mt-0.5 text-sm text-muted">
              Showing <b className="text-ink">{METRICS[view.metrics[0]]?.label}</b> for each <b className="text-ink">{DIMENSIONS[view.rowDim]?.label.toLowerCase()}</b>
              {view.splitDim && <>, split by <b className="text-ink">{DIMENSIONS[view.splitDim]?.label.toLowerCase()}</b></>}
              {' · '}{scopeLabel} · {periodLabel(source === 'time' ? timeFrom : from, source === 'time' ? timeTo : to)} · {pivot.groups.length} rows
            </p>
          </div>
          <Button variant="primary" disabled={exporting || !pivot.groups.length} onClick={download}>{exporting ? 'Preparing…' : 'Download Excel'}</Button>
        </Card>
        {time.loading && source === 'time' && <p role="status" className="text-sm text-muted">Loading hours…</p>}
        {time.error && source === 'time' && <Banner tone="warn">{time.error}</Banner>}
        <CustomResult pivot={pivot} config={view} />
        <p className="text-xs text-muted">Hours come from submitted timesheet entries and the time people log on tasks. “Days to complete” counts calendar days from creation to completion, for completed tasks only.</p>
      </div>
    </div>
  );
}
