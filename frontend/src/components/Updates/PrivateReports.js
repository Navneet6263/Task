import React, { useCallback, useEffect, useState } from 'react';
import { changed, dateTime, errorText, updatesApi } from './updatesApi';
import './Updates.css';
const statuses = { TODO: 'To Do', IN_PROGRESS: 'In Progress', PENDING: 'Pending', DONE: 'Done' };

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
  return <details className="updates-card">
    <summary><span className="updates-kicker">REPORT-{report.id} · BUG · {report.priority} · {statuses[report.status]}</span><strong>{report.title}</strong>
      <small>{dateTime(report.created_at)} · From {report.reporter_name || `User #${report.reported_by}`}</small></summary>
    <p className="updates-hint">Update: {report.update_title} · Version {report.update_version}</p>
    <h4>Problem</h4><p className="updates-prose">{report.description}</p>
    {report.steps && <><h4>Steps / expected result</h4><p className="updates-prose">{report.steps}</p></>}
    <form className="updates-form" onSubmit={submit}>
      <label>Status<select value={status} onChange={e => setStatus(e.target.value)}>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Private progress / resolution note<textarea maxLength={3000} rows={3} value={note} onChange={e => setNote(e.target.value)} /></label>
      {error && <p role="alert" className="updates-error">{error}</p>}
      <button className="updates-primary" disabled={busy || (status === report.status && note === report.resolution_note)}>{busy ? 'Saving...' : 'Save report task'}</button>
    </form>
  </details>;
}

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
  return <section className="private-reports">
    <div className="updates-section-head"><div><h2>My private reports</h2><p>Bug tasks from Updates, visible only to you as the assignee. Separate from shared team totals.</p></div>
      <button type="button" disabled={loading} onClick={refresh}>Refresh</button></div>
    <label className="updates-filter">Report status <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">All statuses</option>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    {loading && <p role="status">Loading private reports...</p>}
    {error && <p role="alert" className="updates-error">{error} <button onClick={refresh}>Retry</button></p>}
    {!loading && !error && !rows.length && <p className="updates-empty">No private reports assigned to you{status ? ' with this status' : ''}.</p>}
    {rows.map(report => <ReportCard key={`${report.id}-${report.version}`} report={report} refresh={refresh} />)}
    {!error && total > 20 && <div className="updates-pagination"><button disabled={loading || page === 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {Math.ceil(total / 20)}</span><button disabled={loading || page * 20 >= total} onClick={() => setPage(page + 1)}>Next</button></div>}
  </section>;
}
