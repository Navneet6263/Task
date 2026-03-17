import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { logs, teams } from '../services/api';
import './AuditLogs.css';

const activityTone = {
  'Task Assigned': 'info',
  'Task Completed': 'success',
  'Task Commented': 'warning',
  'Overdue Alert': 'danger',
  'Task Created': 'violet',
  'Task Updated': 'sky',
};

const AuditLogs = () => {
  const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  const isAdmin = user.role === 'admin' || user.role === 'manager' || user.role === 'company_admin';

  const [teamList, setTeamList] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [logList, setLogList] = useState([]);
  const [actorFilter, setActorFilter] = useState('all');

  const fetchLogs = useCallback(async (team) => {
    setSelectedTeam(team);
    setActorFilter('all');
    try {
      const response = await logs.getByTeam(team.id);
      setLogList(Array.isArray(response.data) ? response.data : []);
    } catch (error) {}
  }, []);

  const fetchTeams = useCallback(async () => {
    try {
      const response = await teams.getAll();
      const list = Array.isArray(response.data) ? response.data : [];
      setTeamList(list);
      if (list.length > 0) {
        await fetchLogs(list[0]);
      }
    } catch (error) {}
  }, [fetchLogs]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  const actorOptions = useMemo(() => {
    const map = new Map();

    logList.forEach((log) => {
      const key = actorKey(log);
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: log.user_name || 'System',
          subtitle: log.automated_by || 'Automation',
        });
      }
    });

    return Array.from(map.values());
  }, [logList]);

  const visibleLogs = useMemo(() => {
    if (actorFilter === 'all') return logList;
    return logList.filter((log) => actorKey(log) === actorFilter);
  }, [actorFilter, logList]);

  const stats = useMemo(
    () => ({
      total: logList.length,
      assigned: logList.filter((log) => log.activity === 'Task Assigned').length,
      completed: logList.filter((log) => log.activity === 'Task Completed').length,
      alerts: logList.filter((log) => log.activity === 'Overdue Alert').length,
    }),
    [logList]
  );

  return (
    <div className="audit-page">
      <div className="audit-head">
        <h1>Audit Logs</h1>
        <p>Team activity timeline with clear traceability.</p>
      </div>

      <section className="audit-stats-grid">
        <article className="audit-stat-card tone-blue">
          <p>Total Logs</p>
          <h3>{stats.total}</h3>
          <span>Events captured in current team</span>
        </article>

        <article className="audit-stat-card tone-amber">
          <p>Assignments</p>
          <h3>{stats.assigned}</h3>
          <span>Tasks assigned to members</span>
        </article>

        <article className="audit-stat-card tone-green">
          <p>Completions</p>
          <h3>{stats.completed}</h3>
          <span>Completed task events</span>
        </article>

        <article className="audit-stat-card tone-coral">
          <p>System Alerts</p>
          <h3>{stats.alerts}</h3>
          <span>Deadline and escalation alerts</span>
        </article>
      </section>

      <section className="audit-teams">
        {teamList.map((team) => (
          <button
            key={team.id}
            type="button"
            className={`audit-team-chip ${selectedTeam?.id === team.id ? 'is-active' : ''}`}
            onClick={() => fetchLogs(team)}
          >
            {team.name}
          </button>
        ))}
      </section>

      <section className="audit-card">
        <div className="audit-card-head">
          <div>
            <h2>Activity Feed</h2>
            <span>
              {selectedTeam ? `${selectedTeam.name} team` : 'Select a team'} | {visibleLogs.length} records
            </span>
          </div>
          <button type="button" className="audit-clear-btn" onClick={() => setActorFilter('all')}>
            Clear Member Filter
          </button>
        </div>

        {isAdmin && (
          <div className="audit-member-filter">
            <button
              type="button"
              className={`audit-member-chip ${actorFilter === 'all' ? 'is-active' : ''}`}
              onClick={() => setActorFilter('all')}
            >
              All Members
            </button>

            {actorOptions.map((actor) => (
              <button
                key={actor.key}
                type="button"
                className={`audit-member-chip ${actorFilter === actor.key ? 'is-active' : ''}`}
                onClick={() => setActorFilter(actor.key)}
              >
                <strong>{actor.name}</strong>
                <span>{actor.subtitle}</span>
              </button>
            ))}
          </div>
        )}

        <div className="audit-table-wrap">
          <table className="audit-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Team</th>
                <th>Activity</th>
                <th>Task</th>
                <th>Timestamp</th>
                <th>Automated By</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {visibleLogs.map((log) => (
                <tr key={log.id}>
                  <td>
                    <button
                      type="button"
                      className="audit-member-cell"
                      onClick={() => isAdmin && setActorFilter(actorKey(log))}
                    >
                      <span>{initials(log.user_name)}</span>
                      <b>{log.user_name || 'System'}</b>
                    </button>
                  </td>
                  <td>{log.team_name || '-'}</td>
                  <td>
                    <span className={`audit-badge ${activityTone[log.activity] || 'neutral'}`}>
                      {log.activity}
                    </span>
                  </td>
                  <td>{log.task_details || '-'}</td>
                  <td>{formatTime(log.created_at)}</td>
                  <td>
                    <span className="audit-automation-pill">{log.automated_by || '-'}</span>
                  </td>
                  <td>{log.description || '-'}</td>
                </tr>
              ))}

              {visibleLogs.length === 0 && (
                <tr>
                  <td colSpan={7} className="audit-empty">
                    No logs available for this filter.
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

const actorKey = (log) => {
  if (log.user_id) return `u-${log.user_id}`;
  if (log.user_name) return `n-${String(log.user_name).toLowerCase()}`;
  return `a-${String(log.automated_by || 'system').toLowerCase()}`;
};

const initials = (name) => {
  if (!name) return 'SY';
  const parts = String(name).split(' ').filter(Boolean);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

const formatTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

export default AuditLogs;
