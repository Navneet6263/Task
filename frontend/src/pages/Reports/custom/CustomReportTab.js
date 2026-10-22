import React, { useEffect, useMemo, useState } from 'react';
import { taskForm, timesheet } from '../../../services/api';
import useTaskFormLayout from '../../../components/taskForm/useTaskFormLayout';
import { readPreference, writePreference } from '../../../services/preferences';
import { localDate } from '../../../services/localDate';
import { notify } from '../../../services/feedback';
import { Banner, Button, Card, CardHeader, Input, Segmented, Select } from '../../../ui';
import { TEMPLATES, buildPivot, dimensionsFor, metricsFor } from './customReport';
import CustomResult from './CustomResult';
import { exportCustomReport, reportTitle } from './exportCustom';

const DEFAULT = TEMPLATES.find((t) => t.id === 'tasksPerClient').config;
const yearAgo = () => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); d.setDate(d.getDate() + 1); return localDate(d); };
const label = (text) => <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">{text}</span>;

export default function CustomReportTab({ taskRows, from, to, team }) {
  const [config, setConfigState] = useState(() => ({ ...DEFAULT, ...readPreference('custom-report-config', {}) }));
  const [saved, setSaved] = useState(() => readPreference('custom-reports', []));
  const [saveName, setSaveName] = useState('');
  const [timeRows, setTimeRows] = useState({ rows: [], loading: false, error: '' });
  const [exporting, setExporting] = useState(false);

  // Hours come from the Timesheet module when it is on, otherwise from time logged on tasks.
  const [tsModule, setTsModule] = useState(false);
  useEffect(() => { timesheet.status().then((r) => setTsModule(Boolean(r.data?.enabled))).catch(() => {}); }, []);
  const formState = useTaskFormLayout();
  const taskHours = Boolean(formState?.layout?.settings?.time_tracking) && Boolean(formState?.can_edit);
  const tsEnabled = tsModule || taskHours;
  const timeFrom = from || yearAgo(), timeTo = to || localDate();
  useEffect(() => {
    if (config.source !== 'time' || !tsEnabled) return undefined;
    let active = true;
    setTimeRows((s) => ({ ...s, loading: true, error: '' }));
    (tsModule ? timesheet.report : taskForm.timeReport)({ from: timeFrom, to: timeTo })
      .then((r) => { if (active) setTimeRows({ rows: r.data.rows, loading: false, error: r.data.truncated ? 'Over 10,000 time entries: only the first 10,000 are included.' : '' }); })
      .catch((err) => { if (active) setTimeRows({ rows: [], loading: false, error: err.response?.data?.error || 'Could not load logged hours.' }); });
    return () => { active = false; };
  }, [config.source, tsEnabled, tsModule, timeFrom, timeTo]);

  const setConfig = (patch) => setConfigState((prev) => { const next = { ...prev, ...patch }; writePreference('custom-report-config', next); return next; });
  const setSource = (source) => setConfig({ source, rowDim: 'client', splitDim: '', metrics: [metricsFor(source)[0].id] });
  const toggleMetric = (id) => setConfig({ metrics: config.metrics.includes(id) ? config.metrics.filter((m) => m !== id) : [...config.metrics, id] });
  const persistSaved = (next) => { setSaved(next); writePreference('custom-reports', next); };

  const rows = config.source === 'time' ? timeRows.rows : taskRows;
  const pivot = useMemo(() => buildPivot(rows, config), [rows, config]);
  const dims = dimensionsFor(config.source), metrics = metricsFor(config.source);
  const title = reportTitle(config);
  const scopeLabel = config.source === 'time' ? (tsModule ? 'Timesheet hours · whole organization' : 'Hours logged on tasks · whole organization') : `Tasks · ${team?.name || 'team'}`;

  const download = async () => {
    setExporting(true);
    try { await exportCustomReport({ pivot, config, name: saved.find((s) => JSON.stringify(s.config) === JSON.stringify(config))?.name, scopeLabel, from: config.source === 'time' ? timeFrom : from, to: config.source === 'time' ? timeTo : to, rawRows: rows }); notify('Excel report downloaded.', 'success'); }
    catch { notify('Could not create the Excel file. Please retry.'); }
    finally { setExporting(false); }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <Card className="flex h-fit flex-col gap-4 p-4">
        <div>
          {label('Start from a template')}
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATES.filter((t) => !t.needsTime || tsEnabled).map((t) => (
              <button key={t.id} type="button" onClick={() => setConfig(t.config)} className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-muted hover:border-accent/60 hover:text-accent">{t.label}</button>
            ))}
          </div>
        </div>
        <div>
          {label('Data')}
          <Segmented label="Data source" value={config.source} onChange={setSource} options={[['task', 'Tasks'], ...(tsEnabled ? [['time', 'Hours logged']] : [])]} className="w-full [&>button]:flex-1" />
          {!tsEnabled && <p className="mt-1 text-xs text-muted">Hours per client come from the Timesheet, or from hours logged on tasks (Settings → Task form designer → Track hours per person).</p>}
        </div>
        <label className="block">{label('Rows')}<Select value={config.rowDim} onChange={(e) => setConfig({ rowDim: e.target.value })}>{dims.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</Select></label>
        <label className="block">{label('Split columns by')}<Select value={config.splitDim} onChange={(e) => setConfig({ splitDim: e.target.value })}>
          <option value="">No split</option>{dims.filter((d) => d.id !== config.rowDim).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</Select></label>
        <div>
          {label('Values')}
          <div className="flex flex-col gap-1">
            {metrics.map((m) => (
              <label key={m.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-subtle">
                <input type="checkbox" className="h-4 w-4 accent-accent" checked={config.metrics.includes(m.id)} disabled={config.metrics.length === 1 && config.metrics[0] === m.id} onChange={() => toggleMetric(m.id)} />
                {m.label}{config.metrics[0] === m.id && <span className="ml-auto text-[10px] font-semibold uppercase text-accent">main</span>}
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label>{label('Sort')}<Select value={config.sort} onChange={(e) => setConfig({ sort: e.target.value })}><option value="metric">Highest first</option><option value="name">Name A–Z</option></Select></label>
          <label>{label('Show')}<Select value={config.limit} onChange={(e) => setConfig({ limit: Number(e.target.value) })}><option value={0}>All rows</option><option value={10}>Top 10</option><option value={25}>Top 25</option></Select></label>
        </div>
        <div className="border-t border-line pt-3">
          {label('Save this report')}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const name = saveName.trim().slice(0, 40); if (!name) return; persistSaved([{ name, config }, ...saved.filter((s) => s.name !== name)].slice(0, 12)); setSaveName(''); notify(`Saved "${name}".`, 'success'); }}>
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
        <Card>
          <CardHeader title={<span className="capitalize">{title}</span>} aside={<Button size="sm" variant="primary" disabled={exporting || !pivot.groups.length} onClick={download}>{exporting ? 'Preparing…' : 'Download Excel'}</Button>} />
          <p className="px-4 py-2 text-xs text-muted">{scopeLabel} · {config.source === 'time' && !from ? 'last 12 months' : 'selected period'} · {pivot.groups.length} rows</p>
        </Card>
        {timeRows.loading && config.source === 'time' && <p role="status" className="text-sm text-muted">Loading hours…</p>}
        {timeRows.error && config.source === 'time' && <Banner tone="warn">{timeRows.error}</Banner>}
        <CustomResult pivot={pivot} config={config} />
        <p className="text-xs text-muted">Days to complete counts calendar days from creation to completion, for completed tasks only. Hours come from submitted timesheet entries, or from the time people log on tasks.</p>
      </div>
    </div>
  );
}
