import React, { useCallback, useEffect, useState } from 'react';
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

const ACTIVITY_OPTIONS = [
  { value: 'all', label: 'All Activities' },
  { value: 'Task Created', label: 'Task Created' },
  { value: 'Task Assigned', label: 'Task Assigned' },
  { value: 'Task Updated', label: 'Task Updated' },
  { value: 'Task Completed', label: 'Task Completed' },
  { value: 'Task Commented', label: 'Task Commented' },
  { value: 'Overdue Alert', label: 'Overdue Alert' },
];

const AuditLogs = () => {
  const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  const isAdmin = user.role === 'admin' || user.role === 'manager' || user.role === 'company_admin';

  const [teamList, setTeamList] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);

  // Pagination & Filter state
  const [logList, setLogList] = useState([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [actorFilter, setActorFilter] = useState('all');
  const [activityFilter, setActivityFilter] = useState('all');

  // Stats & metadata from server
  const [stats, setStats] = useState({ total: 0, assigned: 0, completed: 0, alerts: 0 });
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, total_pages: 1 });
  const [actorOptions, setActorOptions] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch paginated logs from backend
  const fetchLogs = useCallback(async (team, pageNum = 1, pageSize = 20, actor = 'all', actFilter = 'all') => {
    if (!team) return;
    setLoading(true);
    try {
      const response = await logs.getByTeam(team.id, pageNum, pageSize, actor, actFilter);
      const resData = response.data;

      if (resData && typeof resData === 'object' && resData.data) {
        setLogList(resData.data || []);
        setPagination(resData.pagination || { total: 0, page: pageNum, limit: pageSize, total_pages: 1 });
        if (resData.stats) setStats(resData.stats);
        if (resData.actors) {
          const formattedActors = (resData.actors || []).map((a) => {
            const key = a.user_id ? `u-${a.user_id}` : a.user_name ? `n-${String(a.user_name).toLowerCase()}` : `a-${String(a.automated_by || 'system').toLowerCase()}`;
            return {
              key,
              name: a.user_name || 'System',
              subtitle: a.automated_by || 'Automation',
            };
          });
          setActorOptions(formattedActors);
        }
      } else if (Array.isArray(resData)) {
        // Fallback for array format
        setLogList(resData);
        setPagination({ total: resData.length, page: 1, limit: resData.length || 20, total_pages: 1 });
      }
    } catch (error) {
      console.error('[AuditLogs] Error fetching logs:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTeams = useCallback(async () => {
    try {
      const response = await teams.getAll();
      const list = Array.isArray(response.data) ? response.data : [];
      setTeamList(list);
      if (list.length > 0) {
        setSelectedTeam(list[0]);
        fetchLogs(list[0], 1, limit, 'all', 'all');
      }
    } catch (error) {}
  }, [fetchLogs, limit]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  // Handlers for filter/team/pagination changes
  const handleTeamChange = (team) => {
    setSelectedTeam(team);
    setPage(1);
    setActorFilter('all');
    setActivityFilter('all');
    fetchLogs(team, 1, limit, 'all', 'all');
  };

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > pagination.total_pages) return;
    setPage(newPage);
    fetchLogs(selectedTeam, newPage, limit, actorFilter, activityFilter);
  };

  const handleLimitChange = (newLimit) => {
    setLimit(newLimit);
    setPage(1);
    fetchLogs(selectedTeam, 1, newLimit, actorFilter, activityFilter);
  };

  const handleActorChange = (actorKey) => {
    setActorFilter(actorKey);
    setPage(1);
    fetchLogs(selectedTeam, 1, limit, actorKey, activityFilter);
  };

  const handleActivityChange = (actValue) => {
    setActivityFilter(actValue);
    setPage(1);
    fetchLogs(selectedTeam, 1, limit, actorFilter, actValue);
  };

  const handleResetFilters = () => {
    setActorFilter('all');
    setActivityFilter('all');
    setPage(1);
    fetchLogs(selectedTeam, 1, limit, 'all', 'all');
  };

  // Compute records range text
  const startRecord = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const endRecord = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <div className="audit-page">
      <div className="audit-head">
        <h1>Audit Logs</h1>
        <p>Team activity timeline with clear traceability and server-side pagination.</p>
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
            onClick={() => handleTeamChange(team)}
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
              {selectedTeam ? `${selectedTeam.name} team` : 'Select a team'} | Page {pagination.page} of {pagination.total_pages} ({pagination.total} total records)
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Activity Filter Dropdown */}
            <select
              className="h-[36px] rounded-xl border border-gray-300 bg-white text-slate-700 text-xs font-bold px-3 outline-none focus:border-blue-500 cursor-pointer"
              value={activityFilter}
              onChange={(e) => handleActivityChange(e.target.value)}
            >
              {ACTIVITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {(actorFilter !== 'all' || activityFilter !== 'all') && (
              <button type="button" className="audit-clear-btn" onClick={handleResetFilters}>
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {isAdmin && actorOptions.length > 0 && (
          <div className="audit-member-filter">
            <button
              type="button"
              className={`audit-member-chip ${actorFilter === 'all' ? 'is-active' : ''}`}
              onClick={() => handleActorChange('all')}
            >
              <strong>All Members</strong>
              <span>Entire Team</span>
            </button>

            {actorOptions.map((actor) => (
              <button
                key={actor.key}
                type="button"
                className={`audit-member-chip ${actorFilter === actor.key ? 'is-active' : ''}`}
                onClick={() => handleActorChange(actor.key)}
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
              {loading && (
                <tr>
                  <td colSpan={7} className="audit-empty">
                    Loading audit logs...
                  </td>
                </tr>
              )}

              {!loading && logList.map((log) => (
                <tr key={log.id}>
                  <td>
                    <button
                      type="button"
                      className="audit-member-cell"
                      onClick={() => isAdmin && handleActorChange(actorKey(log))}
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

              {!loading && logList.length === 0 && (
                <tr>
                  <td colSpan={7} className="audit-empty">
                    No logs available for the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Server-side Pagination Bar */}
        <div className="audit-pagination">
          <div className="audit-pagination-info">
            Showing <strong>{startRecord}</strong> to <strong>{endRecord}</strong> of <strong>{pagination.total}</strong> records
          </div>

          <div className="audit-pagination-controls">
            {/* Page Size Selector */}
            <div className="audit-page-size">
              <span>Per page:</span>
              <select
                value={limit}
                onChange={(e) => handleLimitChange(Number(e.target.value))}
                className="audit-page-select"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            {/* Page Buttons */}
            <div className="audit-page-buttons">
              <button
                type="button"
                className="audit-page-btn"
                disabled={page <= 1 || loading}
                onClick={() => handlePageChange(1)}
                title="First Page"
              >
                «
              </button>
              <button
                type="button"
                className="audit-page-btn"
                disabled={page <= 1 || loading}
                onClick={() => handlePageChange(page - 1)}
                title="Previous Page"
              >
                ‹ Prev
              </button>

              <span className="audit-page-indicator">
                Page <strong>{page}</strong> of <strong>{pagination.total_pages}</strong>
              </span>

              <button
                type="button"
                className="audit-page-btn"
                disabled={page >= pagination.total_pages || loading}
                onClick={() => handlePageChange(page + 1)}
                title="Next Page"
              >
                Next ›
              </button>
              <button
                type="button"
                className="audit-page-btn"
                disabled={page >= pagination.total_pages || loading}
                onClick={() => handlePageChange(pagination.total_pages)}
                title="Last Page"
              >
                »
              </button>
            </div>
          </div>
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
