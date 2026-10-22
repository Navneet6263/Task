import React, { useCallback, useEffect, useState } from 'react';
import { Button, Chip, EmptyState, ErrorText, Loading, Select, Textarea } from '../../ui';
import { changed, dateTime, errorText, updatesApi } from './updatesApi';

const statuses = { TODO: 'To Do', IN_PROGRESS: 'In Progress', PENDING: 'Pending', DONE: 'Done' };
const STATUS_TONE = { TODO: 'neutral', IN_PROGRESS: 'info', PENDING: 'warn', DONE: 'ok' };
const PRIORITY_TONE = { LOW: 'neutral', MEDIUM: 'warn', HIGH: 'danger' };

function ReportCard({ report, refresh }) {
  const [status, setStatus] = useState(report.status), [note, setNote] = useState(report.resolution_note);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const submit = async event => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      await updatesApi.saveReport(report.id, { status, resolution_note: note, version: report.version });
      changed(); refresh();
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  };
  return (
    <details className="group rounded-lg border border-line bg-surface">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
        <span className="font-mono text-xs text-muted">REPORT-{report.id}</span>
        <strong className="min-w-0 flex-1 truncate text-sm">{report.title}</strong>
        <Chip tone={PRIORITY_TONE[report.priority] || 'neutral'}>{report.priority}</Chip>
        <Chip tone={STATUS_TONE[report.status] || 'neutral'}>{statuses[report.status]}</Chip>
        <span className="w-full text-xs text-muted">{dateTime(report.created_at)} · From {report.reporter_name || `User #${report.reported_by}`}</span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-line px-4 py-4">
        <p className="text-xs text-muted">Update: {report.update_title} · Version {report.update_version}</p>
        <div><h4 className="text-sm font-semibold">Problem</h4><p className="mt-0.5 whitespace-pre-line text-sm text-muted">{report.description}</p></div>
        {report.steps && <div><h4 className="text-sm font-semibold">Steps / expected result</h4><p className="mt-0.5 whitespace-pre-line text-sm text-muted">{report.steps}</p></div>}
        <form className="updates-form flex flex-col gap-3 rounded-md bg-subtle p-3" onSubmit={submit}>
          <label className="flex flex-col gap-1 sm:max-w-[220px]"><span className="text-xs font-medium text-muted">Status</span>
            <Select value={status} onChange={e => setStatus(e.target.value)}>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></label>
          <label className="flex flex-col gap-1"><span className="text-xs font-medium text-muted">Private progress / resolution note</span>
            <Textarea maxLength={3000} rows={3} value={note || ''} onChange={e => setNote(e.target.value)} /></label>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <div><Button type="submit" size="sm" variant="primary" className="updates-primary" disabled={busy || (status === report.status && note === report.resolution_note)}>{busy ? 'Saving...' : 'Save report task'}</Button></div>
        </form>
      </div>
    </details>
  );
}

// Bug reports from product updates that are assigned to the current user.
export default function PrivateReports() {
  const [page, setPage] = useState(1), [status, setStatus] = useState(''), [revision, setRevision] = useState(0);
  const [rows, setRows] = useState([]), [total, setTotal] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(''); setRows([]);
    updatesApi.reports(page, status, controller.signal).then(({ data }) => {
      if (controller.signal.aborted) return;
      setRows(data.data); setTotal(data.total);
      if (page > 1 && !data.data.length) setPage(Math.max(1, Math.ceil(data.total / 20)));
    }).catch(err => { if (!controller.signal.aborted) setError(errorText(err)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, status, revision]);
  return (
    <section className="private-reports flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0"><h2 className="text-[15px] font-semibold">My private reports</h2>
          <p className="text-sm text-muted">Bug tasks from Updates, visible only to you as the assignee. Not counted in team totals.</p></div>
        <div className="flex items-center gap-2">
          <Select aria-label="Report status" className="!w-auto py-1.5" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </Select>
          <Button size="sm" className="h-9" disabled={loading} onClick={refresh}>Refresh</Button>
        </div>
      </div>
      {loading && <Loading>Loading private reports...</Loading>}
      {error && <ErrorText onRetry={refresh}>{error}</ErrorText>}
      {!loading && !error && !rows.length && <EmptyState title={`No private reports${status ? ' with this status' : ''}`}>When someone reports a problem and picks you, it shows up here.</EmptyState>}
      {rows.map(report => <ReportCard key={`${report.id}-${report.version}`} report={report} refresh={refresh} />)}
      {!error && total > 20 && (
        <div className="flex items-center justify-center gap-3 pt-1 text-sm">
          <Button size="sm" disabled={loading || page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="text-muted">Page {page} of {Math.ceil(total / 20)}</span>
          <Button size="sm" disabled={loading || page * 20 >= total} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </section>
  );
}
