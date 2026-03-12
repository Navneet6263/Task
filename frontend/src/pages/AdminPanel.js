import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import './AdminPanel.css';

const api = () =>
  axios.create({
    baseURL: 'http://localhost:5000/api',
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  });

const AdminPanel = () => {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({});
  const [orgs, setOrgs] = useState([]);
  const [newOrgName, setNewOrgName] = useState('');
  const [filterOrg, setFilterOrg] = useState('');
  const [copiedCode, setCopiedCode] = useState('');
  const [tab, setTab] = useState('orgs');

  const fetchData = useCallback(async () => {
    try {
      const [u, s, o] = await Promise.all([
        api().get('/admin/users'),
        api().get('/admin/stats'),
        api().get('/admin/organizations'),
      ]);
      setUsers(u.data.data || u.data || []);
      setStats(s.data || {});
      setOrgs(Array.isArray(o.data) ? o.data : []);
    } catch (error) {}
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchUsers = async (orgId = '') => {
    try {
      const url = orgId ? `/admin/users?org_id=${orgId}` : '/admin/users';
      const response = await api().get(url);
      setUsers(response.data.data || response.data || []);
    } catch (error) {}
  };

  const handleFilterOrg = (orgId) => {
    setFilterOrg(orgId);
    fetchUsers(orgId);
    setTab('users');
  };

  const handleCreateOrg = async (event) => {
    event.preventDefault();
    if (!newOrgName.trim()) return;
    try {
      await api().post('/admin/organizations', { name: newOrgName });
      setNewOrgName('');
      await fetchData();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed');
    }
  };

  const handleDeleteOrg = async (id) => {
    if (!window.confirm('Delete this organization? All data will be unlinked.')) return;
    try {
      await api().delete(`/admin/organizations/${id}`);
      await fetchData();
    } catch (error) {}
  };

  const handleRoleChange = async (id, role) => {
    try {
      await api().put(`/admin/users/${id}/role`, { role });
      await fetchData();
    } catch (error) {}
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm('Delete this user?')) return;
    try {
      await api().delete(`/admin/users/${id}`);
      await fetchData();
    } catch (error) {}
  };

  const copyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(''), 1800);
    } catch (error) {}
  };

  const selectedOrgName = useMemo(() => orgs.find((org) => String(org.id) === String(filterOrg))?.name, [filterOrg, orgs]);

  return (
    <div className="admin-page">
      <header className="admin-head">
        <h1>Admin Panel</h1>
        <p>Manage organizations, users, and system level controls.</p>
      </header>

      <section className="admin-stats">
        <article>
          <p>Organizations</p>
          <h3>{stats.orgs ?? 0}</h3>
        </article>
        <article>
          <p>Total Users</p>
          <h3>{stats.users ?? 0}</h3>
        </article>
        <article>
          <p>Total Teams</p>
          <h3>{stats.teams ?? 0}</h3>
        </article>
        <article>
          <p>Total Tasks</p>
          <h3>{stats.tasks ?? 0}</h3>
        </article>
      </section>

      <section className="admin-tab-row">
        <button type="button" className={tab === 'orgs' ? 'is-active' : ''} onClick={() => setTab('orgs')}>
          Organizations
        </button>
        <button
          type="button"
          className={tab === 'users' ? 'is-active' : ''}
          onClick={() => {
            setTab('users');
            fetchUsers(filterOrg);
          }}
        >
          Users
        </button>
      </section>

      {tab === 'orgs' && (
        <section className="admin-card">
          <div className="admin-card-head">
            <h2>Organization Directory</h2>
            <form onSubmit={handleCreateOrg}>
              <input
                placeholder="New organization name"
                value={newOrgName}
                onChange={(event) => setNewOrgName(event.target.value)}
                required
              />
              <button type="submit">Create</button>
            </form>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Organization</th>
                  <th>Code</th>
                  <th>Users</th>
                  <th>Teams</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((org) => (
                  <tr key={org.id}>
                    <td>
                      <div className="admin-name-cell">
                        <span>{initials(org.name)}</span>
                        <strong>{org.name}</strong>
                      </div>
                    </td>
                    <td>
                      {org.company_code ? (
                        <button type="button" className="admin-code-btn" onClick={() => copyCode(org.company_code)}>
                          <code>{org.company_code}</code>
                          <small>{copiedCode === org.company_code ? 'Copied' : 'Copy'}</small>
                        </button>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>{org.user_count || 0}</td>
                    <td>{org.team_count || 0}</td>
                    <td>{dateLabel(org.created_at)}</td>
                    <td>
                      <div className="admin-actions">
                        <button type="button" onClick={() => handleFilterOrg(org.id)}>
                          View Users
                        </button>
                        <button type="button" className="danger" onClick={() => handleDeleteOrg(org.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {orgs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="admin-empty">
                      No organizations found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'users' && (
        <section className="admin-card">
          <div className="admin-card-head">
            <h2>Users {selectedOrgName ? `| ${selectedOrgName}` : '| All organizations'}</h2>
            <select
              value={filterOrg}
              onChange={(event) => {
                const next = event.target.value;
                setFilterOrg(next);
                fetchUsers(next);
              }}
            >
              <option value="">All Organizations</option>
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Organization</th>
                  <th>Role</th>
                  <th>Employee ID</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="admin-name-cell">
                        <span>{initials(user.name)}</span>
                        <strong>{user.name}</strong>
                      </div>
                    </td>
                    <td>{user.email}</td>
                    <td>{user.org_name || '-'}</td>
                    <td>
                      <select value={user.role} onChange={(event) => handleRoleChange(user.id, event.target.value)}>
                        <option value="person">Person</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td>{user.employee_id || '-'}</td>
                    <td>{dateLabel(user.created_at)}</td>
                    <td>
                      <button type="button" className="danger" onClick={() => handleDeleteUser(user.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}

                {users.length === 0 && (
                  <tr>
                    <td colSpan={7} className="admin-empty">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};

const initials = (name) => {
  if (!name) return 'OR';
  const parts = String(name).split(' ').filter(Boolean);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

const dateLabel = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString();
};

export default AdminPanel;
