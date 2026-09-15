import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { logs } from '../services/api';
import { readPreference, writePreference } from '../services/preferences';
import './PmsHub.css';

const PmsHub = () => {
  const [logList, setLogList] = useState([]);
  const [focus, setFocus] = useState(() => readPreference('focus-plan', { f1: '', f2: '', f3: '' }));
  const [kpiResult, setKpiResult] = useState('');
  const [error, setError] = useState('');
  const [page, setPage] = useState(1), [pages, setPages] = useState(1);

  const fetchLogs = useCallback(async () => {
    try {
      const response = await logs.getMy(page);
      setPages(response.data.pagination?.total_pages || 1); setError('');
      setLogList(Array.isArray(response.data?.data) ? response.data.data : Array.isArray(response.data) ? response.data : []);
    } catch (error) { setError('Could not load activity. Please retry.'); }
  }, [page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const completed = useMemo(
    () => logList.filter((entry) => entry.activity === 'Task Completed').length,
    [logList]
  );


  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const handleKpiPredict = (event) => {
    event.preventDefault();
    const areas = [focus.f1, focus.f2, focus.f3].filter(Boolean);
    const stored = writePreference('focus-plan', focus);
    setKpiResult(
      `${stored ? 'Plan saved on this browser' : 'Storage unavailable; plan not saved'}: ${areas.length > 0 ? areas.join(', ') : 'none selected'}`
    );
  };

  return (
    <div className="pms-page">
      <header className="pms-head">
        <h1>PMS Hub</h1>
        <p>Personal focus plan and activity evidence. {today}</p>
      </header>

      <section className="pms-top">
        <article className="pms-focus-card">
          <h2>Monthly Focus Planner</h2>
          <p>Choose three focus themes. Your plan is private to this account on this browser.</p>

          <form onSubmit={handleKpiPredict}>
            <input placeholder="Focus Area 1" value={focus.f1} onChange={(event) => setFocus({ ...focus, f1: event.target.value })} />
            <input placeholder="Focus Area 2" value={focus.f2} onChange={(event) => setFocus({ ...focus, f2: event.target.value })} />
            <input placeholder="Focus Area 3" value={focus.f3} onChange={(event) => setFocus({ ...focus, f3: event.target.value })} />

            {kpiResult && <div className="pms-result">{kpiResult}</div>}

            <button type="submit">Save focus plan</button>
          </form>
        </article>

        <article className="pms-score-card">
          <p>Completion events on this page</p>
          <h3>{completed}</h3>
          <span>Activity events, not a performance rating</span>
        </article>
      </section>

      {error && <p role="alert">{error} <button onClick={fetchLogs}>Retry</button></p>}
      <section className="pms-card">
        <div className="pms-card-head">
          <h2>Activity history</h2>
          <span>{logList.length} records</span>
        </div>

        <div className="pms-table-wrap">
          <table className="pms-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Activity</th>
                <th>Task Details</th>
                <th>Team</th>
                <th>Automated By</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {logList.map((log) => (
                <tr key={log.id}>
                  <td>{timeLabel(log.created_at)}</td>
                  <td>
                    <span className={`pms-badge ${activityClass(log.activity)}`}>{log.activity}</span>
                  </td>
                  <td>{log.task_details || '-'}</td>
                  <td>{log.team_name || '-'}</td>
                  <td>{log.automated_by || '-'}</td>
                  <td>
                    <span className={`pms-status ${log.activity === 'Task Completed' ? 'done' : 'progress'}`}>
                      {log.activity === 'Task Completed' ? 'Completed event' : 'Recorded event'}
                    </span>
                  </td>
                </tr>
              ))}
              {logList.length === 0 && (
                <tr>
                  <td colSpan={6} className="pms-empty">
                    No activity logs available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <div className="flex justify-center gap-3"><button disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {pages}</span><button disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div>
    </div>
  );
};

const timeLabel = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

const activityClass = (activity) => {
  if (activity === 'Task Completed') return 'success';
  if (activity === 'Task Assigned') return 'info';
  if (activity === 'Overdue Alert') return 'danger';
  if (activity === 'Task Commented') return 'warning';
  return 'neutral';
};

export default PmsHub;
