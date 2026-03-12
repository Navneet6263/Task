import React, { useEffect, useMemo, useState } from 'react';
import { logs } from '../services/api';
import './PmsHub.css';

const PmsHub = () => {
  const [logList, setLogList] = useState([]);
  const [focus, setFocus] = useState({ f1: '', f2: '', f3: '' });
  const [kpiResult, setKpiResult] = useState('');

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const response = await logs.getMy();
      setLogList(Array.isArray(response.data) ? response.data : []);
    } catch (error) {}
  };

  const completed = useMemo(
    () => logList.filter((entry) => entry.activity === 'Task Completed').length,
    [logList]
  );

  const score = Math.min(100, 60 + completed * 2);
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const handleKpiPredict = (event) => {
    event.preventDefault();
    const areas = [focus.f1, focus.f2, focus.f3].filter(Boolean);
    const predicted = Math.min(100, 60 + completed * 2 + areas.length * 5);
    setKpiResult(
      `Focus areas: ${areas.length > 0 ? areas.join(', ') : 'none selected'} | Predicted KPI: ${predicted}/100 | Completed tasks: ${completed}`
    );
  };

  return (
    <div className="pms-page">
      <header className="pms-head">
        <h1>PMS Hub</h1>
        <p>Personal performance insights and month end task evidence. {today}</p>
      </header>

      <section className="pms-top">
        <article className="pms-focus-card">
          <h2>Monthly Focus Planner</h2>
          <p>Define top focus themes and estimate KPI confidence.</p>

          <form onSubmit={handleKpiPredict}>
            <input placeholder="Focus Area 1" value={focus.f1} onChange={(event) => setFocus({ ...focus, f1: event.target.value })} />
            <input placeholder="Focus Area 2" value={focus.f2} onChange={(event) => setFocus({ ...focus, f2: event.target.value })} />
            <input placeholder="Focus Area 3" value={focus.f3} onChange={(event) => setFocus({ ...focus, f3: event.target.value })} />

            {kpiResult && <div className="pms-result">{kpiResult}</div>}

            <button type="submit">Predict KPI</button>
          </form>
        </article>

        <article className="pms-score-card">
          <p>Performance Score</p>
          <h3>{score}/100</h3>
          <span>{completed} completed tasks mapped</span>
        </article>
      </section>

      <section className="pms-card">
        <div className="pms-card-head">
          <h2>Month End Activity Report</h2>
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
                      {log.activity === 'Task Completed' ? 'Completed' : 'In Progress'}
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
