import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './SuperAdminDashboard.css';

const sa = () =>
  axios.create({
    baseURL: 'http://localhost:5000/api/sa',
    headers: { Authorization: `Bearer ${localStorage.getItem('sa_token')}` },
  });

const SuperAdminDashboard = () => {
  const navigate = useNavigate();
  const saUser = JSON.parse(localStorage.getItem('sa_user') || '{}');
  const isMaster = Boolean(saUser.is_master);

  const [data, setData] = useState({ admins: [], pending_count: 0, total_orgs: 0, total_users: 0 });
  const [selectedAdminId, setSelectedAdminId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [limits, setLimits] = useState({
    max_companies: 3,
    max_managers_per_company: 10,
    max_staff_per_company: 50,
  });
  const [rejectReason, setRejectReason] = useState('');

  const [logs, setLogs] = useState([]);
  const [logActor, setLogActor] = useState('');

  const [subUsers, setSubUsers] = useState([]);
  const [newSubEmail, setNewSubEmail] = useState('');
  const [newSubName, setNewSubName] = useState('');

  const [leftFilter, setLeftFilter] = useState('pending');
  const [rightTab, setRightTab] = useState('detail');

  const fetchDashboard = useCallback(async () => {
    try {
      const response = await sa().get('/dashboard');
      const payload = response.data || {};
      setData({
        admins: Array.isArray(payload.admins) ? payload.admins : [],
        pending_count: payload.pending_count || 0,
        total_orgs: payload.total_orgs || 0,
        total_users: payload.total_users || 0,
      });
    } catch (error) {
      if (error.response?.status === 401) navigate('/sa-login');
    }
  }, [navigate]);

  const fetchLogs = useCallback(async (actor = '') => {
    try {
      const response = await sa().get(`/logs${actor ? `?actor=${encodeURIComponent(actor)}` : ''}`);
      setLogs(Array.isArray(response.data) ? response.data : []);
    } catch (error) {}
  }, []);

  const fetchSubUsers = useCallback(async () => {
    try {
      const response = await sa().get('/sub-users');
      setSubUsers(Array.isArray(response.data) ? response.data : []);
    } catch (error) {}
  }, []);

  useEffect(() => {
    fetchDashboard();
    fetchLogs();
    if (isMaster) fetchSubUsers();
  }, [fetchDashboard, fetchLogs, fetchSubUsers, isMaster]);

  const fetchDetail = async (id) => {
    try {
      const response = await sa().get(`/company-admins/${id}`);
      const next = response.data;
      setDetail(next);
      setSelectedAdminId(id);
      setLimits({
        max_companies: next.max_companies || 3,
        max_managers_per_company: next.max_managers_per_company || 10,
        max_staff_per_company: next.max_staff_per_company || 50,
      });
      setRightTab('detail');
    } catch (error) {}
  };

  const handleApprove = async (id) => {
    try {
      await sa().patch(`/company-admins/${id}/approve`, limits);
      await Promise.all([fetchDashboard(), fetchDetail(id), fetchLogs(logActor)]);
    } catch (error) {}
  };

  const handleReject = async (id) => {
    if (!rejectReason.trim()) {
      alert('Rejection reason is required');
      return;
    }

    try {
      await sa().patch(`/company-admins/${id}/reject`, { reason: rejectReason });
      setRejectReason('');
      await Promise.all([fetchDashboard(), fetchDetail(id), fetchLogs(logActor)]);
    } catch (error) {}
  };

  const handleUpdateLimits = async (id) => {
    try {
      await sa().patch(`/company-admins/${id}/limits`, limits);
      await Promise.all([fetchDashboard(), fetchDetail(id), fetchLogs(logActor)]);
    } catch (error) {}
  };

  const handleAddSubUser = async (event) => {
    event.preventDefault();
    try {
      await sa().post('/sub-users', { email: newSubEmail, name: newSubName });
      setNewSubEmail('');
      setNewSubName('');
      await Promise.all([fetchSubUsers(), fetchLogs(logActor)]);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to add sub-user');
    }
  };

  const handleRemoveSubUser = async (id) => {
    try {
      await sa().delete(`/sub-users/${id}`);
      await Promise.all([fetchSubUsers(), fetchLogs(logActor)]);
    } catch (error) {}
  };

  const handleLogout = () => {
    localStorage.removeItem('sa_token');
    localStorage.removeItem('sa_user');
    navigate('/sa-login');
  };

  const filteredAdmins = useMemo(
    () =>
      data.admins.filter((admin) => {
        if (leftFilter === 'all') return true;
        return admin.status === leftFilter;
      }),
    [data.admins, leftFilter]
  );

  const activeSubUsers = subUsers.filter((user) => user.is_active);

  return (
    <div className="sa-page">
      <aside className="sa-sidebar">
        <div className="sa-brand">
          <div className="sa-brand-mark">SA</div>
          <div>
            <p>Control Console</p>
            <h2>Super Admin</h2>
          </div>
        </div>

        <div className="sa-profile">
          <div className="sa-profile-avatar">{initials(saUser.name)}</div>
          <div>
            <strong>{saUser.name || 'Super Admin'}</strong>
            <span>{saUser.email || '-'}</span>
            {isMaster && <b>Master Access</b>}
          </div>
        </div>

        <div className="sa-side-metrics">
          <div>
            <p>Company Admins</p>
            <h3>{data.admins.length}</h3>
          </div>
          <div>
            <p>Pending Approvals</p>
            <h3>{data.pending_count}</h3>
          </div>
        </div>

        <div className="sa-filter-tabs">
          <button type="button" className={leftFilter === 'pending' ? 'is-active' : ''} onClick={() => setLeftFilter('pending')}>
            Pending
          </button>
          <button type="button" className={leftFilter === 'approved' ? 'is-active' : ''} onClick={() => setLeftFilter('approved')}>
            Approved
          </button>
          <button type="button" className={leftFilter === 'all' ? 'is-active' : ''} onClick={() => setLeftFilter('all')}>
            All
          </button>
        </div>

        <div className="sa-admin-list">
          {filteredAdmins.map((admin) => (
            <button
              key={admin.id}
              type="button"
              className={`sa-admin-item ${selectedAdminId === admin.id ? 'is-selected' : ''}`}
              onClick={() => fetchDetail(admin.id)}
            >
              <span className="sa-admin-avatar">{initials(admin.name)}</span>
              <div>
                <strong>{admin.name}</strong>
                <small>{admin.email}</small>
              </div>
              <em className={`sa-status ${admin.status}`}>{admin.status}</em>
            </button>
          ))}

          {filteredAdmins.length === 0 && <p className="sa-empty">No records</p>}
        </div>

        <button type="button" className="sa-logout-btn" onClick={handleLogout}>
          Logout
        </button>
      </aside>

      <main className="sa-main">
        <section className="sa-top-cards">
          <article>
            <p>Total Organizations</p>
            <h3>{data.total_orgs || 0}</h3>
          </article>
          <article>
            <p>Total Users</p>
            <h3>{data.total_users || 0}</h3>
          </article>
          <article>
            <p>Pending Companies</p>
            <h3>{data.pending_count || 0}</h3>
          </article>
        </section>

        <section className="sa-content-card">
          <div className="sa-content-head">
            <div className="sa-tab-row">
              <button type="button" className={rightTab === 'detail' ? 'is-active' : ''} onClick={() => setRightTab('detail')}>
                Company Detail
              </button>
              <button type="button" className={rightTab === 'logs' ? 'is-active' : ''} onClick={() => setRightTab('logs')}>
                Activity Logs
              </button>
              {isMaster && (
                <button type="button" className={rightTab === 'subusers' ? 'is-active' : ''} onClick={() => setRightTab('subusers')}>
                  Sub Users
                </button>
              )}
            </div>
          </div>

          {rightTab === 'detail' && !detail && (
            <div className="sa-placeholder">
              <h3>Select a company admin</h3>
              <p>Choose an entry from the left list to review details and approval controls.</p>
            </div>
          )}

          {rightTab === 'detail' && detail && (
            <div className="sa-scroll-area">
              <section className="sa-detail-head">
                <div>
                  <h2>{detail.name}</h2>
                  <p>{detail.email}</p>
                </div>
                <span className={`sa-status ${detail.status}`}>{String(detail.status).toUpperCase()}</span>
              </section>

              <section className="sa-detail-grid">
                <article className="sa-block">
                  <h4>Registration Info</h4>
                  <div className="sa-info-list">
                    <div>
                      <span>Description</span>
                      <b>{detail.company_description || '-'}</b>
                    </div>
                    <div>
                      <span>Expected Companies</span>
                      <b>{detail.expected_companies || '-'}</b>
                    </div>
                    <div>
                      <span>Expected Managers</span>
                      <b>{detail.expected_managers || '-'}</b>
                    </div>
                    <div>
                      <span>Expected Staff</span>
                      <b>{detail.expected_staff || '-'}</b>
                    </div>
                    <div>
                      <span>Registered On</span>
                      <b>{dateLabel(detail.created_at)}</b>
                    </div>
                  </div>
                </article>

                <article className="sa-block">
                  <h4>Account Limits</h4>
                  <div className="sa-limit-grid">
                    <label>
                      <span>Max Companies</span>
                      <input
                        type="number"
                        min="1"
                        value={limits.max_companies}
                        onChange={(event) => setLimits({ ...limits, max_companies: Number(event.target.value) })}
                      />
                    </label>

                    <label>
                      <span>Managers Per Company</span>
                      <input
                        type="number"
                        min="1"
                        value={limits.max_managers_per_company}
                        onChange={(event) =>
                          setLimits({ ...limits, max_managers_per_company: Number(event.target.value) })
                        }
                      />
                    </label>

                    <label>
                      <span>Staff Per Company</span>
                      <input
                        type="number"
                        min="1"
                        value={limits.max_staff_per_company}
                        onChange={(event) =>
                          setLimits({ ...limits, max_staff_per_company: Number(event.target.value) })
                        }
                      />
                    </label>
                  </div>

                  {detail.status === 'approved' && (
                    <button type="button" className="sa-primary-btn" onClick={() => handleUpdateLimits(detail.id)}>
                      Save Limit Updates
                    </button>
                  )}
                </article>
              </section>

              {detail.status === 'pending' && (
                <section className="sa-block">
                  <h4>Approval Decision</h4>
                  <div className="sa-approval-row">
                    <button type="button" className="sa-approve-btn" onClick={() => handleApprove(detail.id)}>
                      Approve Company Admin
                    </button>
                  </div>
                  <div className="sa-reject-row">
                    <input
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                      placeholder="Enter rejection reason"
                    />
                    <button type="button" className="sa-reject-btn" onClick={() => handleReject(detail.id)}>
                      Reject
                    </button>
                  </div>
                </section>
              )}

              <section className="sa-block">
                <h4>Organizations</h4>
                <div className="sa-table-wrap">
                  <table className="sa-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Code</th>
                        <th>Managers</th>
                        <th>Staff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.organizations || []).map((org) => (
                        <tr key={org.id}>
                          <td>{org.name}</td>
                          <td>{org.company_code || '-'}</td>
                          <td>{org.manager_count || 0}</td>
                          <td>{org.staff_count || 0}</td>
                        </tr>
                      ))}
                      {(detail.organizations || []).length === 0 && (
                        <tr>
                          <td colSpan={4} className="sa-empty">
                            No organizations available.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {rightTab === 'logs' && (
            <div className="sa-scroll-area">
              <section className="sa-logs-head">
                <h2>Super Admin Activity Logs</h2>
                <select
                  value={logActor}
                  onChange={(event) => {
                    const value = event.target.value;
                    setLogActor(value);
                    fetchLogs(value);
                  }}
                >
                  <option value="">All Users</option>
                  <option value={saUser.email}>Me ({saUser.email})</option>
                  {subUsers.map((subUser) => (
                    <option key={subUser.id} value={subUser.email}>
                      {subUser.name || subUser.email}
                    </option>
                  ))}
                </select>
              </section>

              <div className="sa-table-wrap">
                <table className="sa-table">
                  <thead>
                    <tr>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Description</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td>
                          <div className="sa-actor-cell">
                            <span>{initials(log.actor_name || log.actor_email)}</span>
                            <div>
                              <b>{log.actor_name || '-'}</b>
                              <small>{log.actor_email}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="sa-action-pill">{log.action}</span>
                        </td>
                        <td>{log.description || '-'}</td>
                        <td>{dateTimeLabel(log.created_at)}</td>
                      </tr>
                    ))}
                    {logs.length === 0 && (
                      <tr>
                        <td colSpan={4} className="sa-empty">
                          No logs available.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {rightTab === 'subusers' && isMaster && (
            <div className="sa-scroll-area">
              <section className="sa-sub-head">
                <h2>Sub User Access</h2>
                <p>Create delegated users with restricted super admin login access.</p>
              </section>

              <section className="sa-block">
                <h4>Add Sub User</h4>
                <form className="sa-sub-form" onSubmit={handleAddSubUser}>
                  <input
                    value={newSubName}
                    onChange={(event) => setNewSubName(event.target.value)}
                    placeholder="Name"
                  />
                  <input
                    type="email"
                    required
                    value={newSubEmail}
                    onChange={(event) => setNewSubEmail(event.target.value)}
                    placeholder="Email"
                  />
                  <button type="submit" className="sa-primary-btn">
                    Add Sub User
                  </button>
                </form>
              </section>

              <section className="sa-block">
                <h4>Active Sub Users</h4>
                <div className="sa-sub-list">
                  {activeSubUsers.map((subUser) => (
                    <div key={subUser.id} className="sa-sub-row">
                      <div className="sa-actor-cell">
                        <span>{initials(subUser.name || subUser.email)}</span>
                        <div>
                          <b>{subUser.name || '-'}</b>
                          <small>{subUser.email}</small>
                        </div>
                      </div>
                      <small>{dateLabel(subUser.created_at)}</small>
                      <button type="button" className="sa-reject-btn" onClick={() => handleRemoveSubUser(subUser.id)}>
                        Remove
                      </button>
                    </div>
                  ))}
                  {activeSubUsers.length === 0 && <p className="sa-empty">No active sub users.</p>}
                </div>
              </section>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

const initials = (name) => {
  if (!name) return 'SA';
  const parts = String(name).split(' ').filter(Boolean);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

const dateLabel = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString();
};

const dateTimeLabel = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

export default SuperAdminDashboard;
