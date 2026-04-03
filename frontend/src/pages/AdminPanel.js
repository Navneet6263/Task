import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import './AdminPanel.css';

const api = () =>
  axios.create({
    baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
    headers: {
      Authorization: `Bearer ${localStorage.getItem('company_token') || localStorage.getItem('token')}`,
      'x-org-id': localStorage.getItem('active_org_id') || '',
    },
  });

const initialAdminForm = {
  name: '',
  email: '',
  password: '',
  mobile: '',
  employee_id: '',
  org_id: '',
};

const AdminPanel = () => {
  const hasCompanyToken = Boolean(localStorage.getItem('company_token'));
  const authToken = localStorage.getItem('company_token') || localStorage.getItem('token');
  const tokenRole = getTokenRole(authToken);
  const currentUser = hasCompanyToken
    ? parseStoredUser(localStorage.getItem('company_user')) || parseStoredUser(localStorage.getItem('user')) || {}
    : parseStoredUser(localStorage.getItem('user')) || parseStoredUser(localStorage.getItem('company_user')) || {};
  const isCompanyAdmin = tokenRole === 'company_admin' || hasCompanyToken || currentUser.role === 'company_admin';
  const isOrgAdmin = !isCompanyAdmin && (tokenRole === 'admin' || currentUser.role === 'admin');

  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({});
  const [orgs, setOrgs] = useState([]);
  const [newOrgName, setNewOrgName] = useState('');
  const [filterOrg, setFilterOrg] = useState('');
  const [copiedCode, setCopiedCode] = useState('');
  const [tab, setTab] = useState(isCompanyAdmin ? 'orgs' : 'users');
  const [adminForm, setAdminForm] = useState(initialAdminForm);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [accessSearch, setAccessSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedAccessUserId, setSelectedAccessUserId] = useState('');
  const [selectedAccessOrgId, setSelectedAccessOrgId] = useState('');
  const [selectedUserAccess, setSelectedUserAccess] = useState(null);

  useEffect(() => {
    if (tokenRole !== 'company_admin') return;

    const legacyToken = localStorage.getItem('token');
    if (!localStorage.getItem('company_token') && legacyToken) {
      localStorage.setItem('company_token', legacyToken);
      localStorage.removeItem('token');
    }

    const storedUser = parseStoredUser(localStorage.getItem('company_user'))
      || parseStoredUser(localStorage.getItem('user'))
      || {};
    const fixedUser = { ...storedUser, role: 'company_admin' };
    localStorage.setItem('company_user', JSON.stringify(fixedUser));
    localStorage.setItem('user', JSON.stringify(fixedUser));
  }, [tokenRole]);

  const fetchData = useCallback(async () => {
    try {
      setError('');
      if (isCompanyAdmin) {
        const [overviewRes, orgRes, userRes] = await Promise.all([
          api().get('/company-admin/overview'),
          api().get('/company-admin/organizations'),
          api().get('/company-admin/users'),
        ]);

        const overview = overviewRes.data || {};
        const organizationList = Array.isArray(orgRes.data) ? orgRes.data : [];
        const userList = Array.isArray(userRes.data) ? userRes.data : [];

        setStats({
          orgs: overview.stats?.organizations || organizationList.length,
          users: overview.stats?.users || userList.length,
          admins: overview.stats?.admins || userList.filter((u) => u.role === 'admin').length,
          staff: overview.stats?.staff || userList.filter((u) => u.role === 'person').length,
          managers: overview.stats?.managers || userList.filter((u) => u.role === 'manager').length,
        });
        setOrgs(organizationList);
        setUsers(userList);
      } else if (isOrgAdmin) {
        const [u, s, o] = await Promise.all([
          api().get('/admin/users'),
          api().get('/admin/stats'),
          api().get('/admin/organizations'),
        ]);
        setUsers(u.data.data || u.data || []);
        setStats(s.data || {});
        setOrgs(Array.isArray(o.data) ? o.data : []);
      } else {
        setError('You do not have access to this panel.');
      }
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Failed to load admin data');
    }
  }, [isCompanyAdmin, isOrgAdmin]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchUsers = async (orgId = '') => {
    try {
      const endpoint = isCompanyAdmin ? '/company-admin/users' : '/admin/users';
      const response = await api().get(orgId ? `${endpoint}?org_id=${orgId}` : endpoint);
      setUsers(response.data.data || response.data || []);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Failed to fetch users');
    }
  };

  const handleFilterOrg = (orgId) => {
    setFilterOrg(String(orgId));
    fetchUsers(orgId);
    setTab('users');
  };

  const handleCreateOrg = async (event) => {
    event.preventDefault();
    if (!newOrgName.trim()) return;

    try {
      setError('');
      setMessage('');
      if (!isCompanyAdmin) {
        setError('Only company admin can create organizations');
        return;
      }

      await api().post('/company-admin/organizations', { name: newOrgName.trim() });
      setNewOrgName('');
      setMessage('Organization created successfully.');
      await fetchData();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Failed to create organization');
    }
  };

  const handleDeleteOrg = async (id) => {
    if (!window.confirm('Delete this organization?')) return;

    try {
      if (!isOrgAdmin) {
        setError('Organization deletion is not available here.');
        return;
      }
      await api().delete(`/admin/organizations/${id}`);
      await fetchData();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Failed to delete organization');
    }
  };

  const handleRoleChange = async (id, role) => {
    try {
      const endpoint = isCompanyAdmin ? `/company-admin/users/${id}/role` : `/admin/users/${id}/role`;
      await api().put(endpoint, { role });
      await fetchUsers(filterOrg);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Failed to update role');
    }
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm('Delete this user?')) return;

    try {
      const endpoint = isCompanyAdmin ? `/company-admin/users/${id}` : `/admin/users/${id}`;
      await api().delete(endpoint);
      await fetchUsers(filterOrg);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Failed to delete user');
    }
  };

  const handleCreateAdmin = async (event) => {
    event.preventDefault();
    if (!isCompanyAdmin) return;

    try {
      const payload = {
        ...adminForm,
        org_id: Number(adminForm.org_id || filterOrg || orgs[0]?.id || 0),
      };
      if (!payload.org_id) {
        setError('Select an organization before creating admin.');
        return;
      }

      await api().post('/company-admin/admins', payload);
      setAdminForm({ ...initialAdminForm, org_id: String(payload.org_id) });
      setMessage('Admin account created successfully.');
      setError('');
      await fetchUsers(payload.org_id);
      await fetchData();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Failed to create admin');
    }
  };

  const copyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(''), 1800);
    } catch (copyError) {}
  };

  useEffect(() => {
    const fetchSearch = async () => {
      if (!isCompanyAdmin || tab !== 'access') return;
      if (!accessSearch.trim()) {
        const fallback = users
          .filter((item) => item.role === 'admin' || item.role === 'manager')
          .slice(0, 20);
        setSearchResults(fallback);
        return;
      }

      try {
        const response = await api().get(`/company-admin/users/search?q=${encodeURIComponent(accessSearch.trim())}`);
        setSearchResults(Array.isArray(response.data) ? response.data : []);
      } catch (requestError) {
        setError(requestError.response?.data?.error || 'Failed to search users');
      }
    };

    fetchSearch();
  }, [accessSearch, isCompanyAdmin, tab, users]);

  const loadUserAccess = async (userId) => {
    if (!userId) {
      setSelectedUserAccess(null);
      return;
    }
    try {
      const response = await api().get(`/company-admin/users/${userId}/org-access`);
      setSelectedUserAccess(response.data || null);
      setSelectedAccessUserId(String(userId));
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Failed to load user access');
    }
  };

  const handleAssignOrgAccess = async () => {
    if (!selectedAccessUserId || !selectedAccessOrgId) {
      setError('Select user and organization first.');
      return;
    }

    try {
      await api().post('/company-admin/org-access', {
        user_id: Number(selectedAccessUserId),
        org_id: Number(selectedAccessOrgId),
      });
      setMessage('Organization access assigned.');
      setError('');
      await loadUserAccess(selectedAccessUserId);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Failed to assign organization access');
    }
  };

  const handleRemoveOrgAccess = async (userId, orgId) => {
    try {
      await api().delete(`/company-admin/org-access/${userId}/${orgId}`);
      setMessage('Organization access removed.');
      setError('');
      await loadUserAccess(userId);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Failed to remove organization access');
    }
  };

  const selectedOrgName = useMemo(
    () => orgs.find((org) => String(org.id) === String(filterOrg))?.name,
    [filterOrg, orgs]
  );

  const adminUsers = useMemo(() => users.filter((item) => item.role === 'admin'), [users]);

  return (
    <div className="admin-page">
      <header className="admin-head">
        <h1>{isCompanyAdmin ? 'Company Admin Control' : 'Admin Panel'}</h1>
        <p>
          {isCompanyAdmin
            ? 'Create organizations, create admin accounts, and control access for your company.'
            : 'Manage users and access within your organization.'}
        </p>
      </header>

      {message && <div className="admin-alert success">{message}</div>}
      {error && <div className="admin-alert error">{error}</div>}

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
          <p>Admins</p>
          <h3>{stats.admins ?? 0}</h3>
        </article>
        <article>
          <p>{isCompanyAdmin ? 'Staff' : 'Teams'}</p>
          <h3>{isCompanyAdmin ? stats.staff ?? 0 : stats.teams ?? 0}</h3>
        </article>
      </section>

      <section className="admin-tab-row">
        {isCompanyAdmin && (
          <button type="button" className={tab === 'orgs' ? 'is-active' : ''} onClick={() => setTab('orgs')}>
            Organizations
          </button>
        )}
        {isCompanyAdmin && (
          <button type="button" className={tab === 'admins' ? 'is-active' : ''} onClick={() => setTab('admins')}>
            Create Admin
          </button>
        )}
        {isCompanyAdmin && (
          <button type="button" className={tab === 'access' ? 'is-active' : ''} onClick={() => setTab('access')}>
            Org Access
          </button>
        )}
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

      {isCompanyAdmin && tab === 'orgs' && (
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
                  <th>Admins</th>
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
                    <td>{org.admin_count || 0}</td>
                    <td>
                      <div className="admin-actions">
                        <button type="button" onClick={() => handleFilterOrg(org.id)}>
                          View Users
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

      {isCompanyAdmin && tab === 'admins' && (
        <section className="admin-card">
          <div className="admin-card-head">
            <h2>Create Organization Admin</h2>
          </div>

          <form className="admin-inline-form" onSubmit={handleCreateAdmin}>
            <input
              placeholder="Full name"
              value={adminForm.name}
              onChange={(event) => setAdminForm({ ...adminForm, name: event.target.value })}
              required
            />
            <input
              type="email"
              placeholder="Email"
              value={adminForm.email}
              onChange={(event) => setAdminForm({ ...adminForm, email: event.target.value })}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={adminForm.password}
              onChange={(event) => setAdminForm({ ...adminForm, password: event.target.value })}
              required
            />
            <select
              value={adminForm.org_id}
              onChange={(event) => setAdminForm({ ...adminForm, org_id: event.target.value })}
              required
            >
              <option value="">Select Organization</option>
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
            <input
              placeholder="Mobile (optional)"
              value={adminForm.mobile}
              onChange={(event) => setAdminForm({ ...adminForm, mobile: event.target.value })}
            />
            <input
              placeholder="Employee ID (optional)"
              value={adminForm.employee_id}
              onChange={(event) => setAdminForm({ ...adminForm, employee_id: event.target.value })}
            />
            <button type="submit">Create Admin</button>
          </form>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Organization</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {adminUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="admin-name-cell">
                        <span>{initials(user.name)}</span>
                        <strong>{user.name}</strong>
                      </div>
                    </td>
                    <td>{user.email}</td>
                    <td>{user.org_name || '-'}</td>
                    <td>{user.role}</td>
                    <td>{dateLabel(user.created_at)}</td>
                    <td>
                      <button type="button" className="danger" onClick={() => handleDeleteUser(user.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {adminUsers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="admin-empty">
                      No admin users created yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {isCompanyAdmin && tab === 'access' && (
        <section className="admin-card">
          <div className="admin-card-head">
            <h2>Manager/Admin Multi-Organization Access</h2>
          </div>

          <div className="admin-access-grid">
            <div className="admin-access-left">
              <input
                placeholder="Search by user name or email"
                value={accessSearch}
                onChange={(event) => setAccessSearch(event.target.value)}
              />
              <div className="admin-access-list">
                {searchResults.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`admin-access-user ${String(selectedAccessUserId) === String(item.id) ? 'is-selected' : ''}`}
                    onClick={() => loadUserAccess(item.id)}
                  >
                    <strong>{item.name}</strong>
                    <span>{item.email}</span>
                    <small>{item.role} | {item.org_name}</small>
                  </button>
                ))}
                {searchResults.length === 0 && <p className="admin-empty">No users found.</p>}
              </div>
            </div>

            <div className="admin-access-right">
              {!selectedUserAccess && (
                <p className="admin-empty">Select a manager/admin user to map additional organizations.</p>
              )}

              {selectedUserAccess && (
                <>
                  <div className="admin-access-user-head">
                    <h3>{selectedUserAccess.user?.name}</h3>
                    <p>{selectedUserAccess.user?.email}</p>
                    <small>Primary Organization ID: {selectedUserAccess.user?.primary_org_id}</small>
                  </div>

                  <div className="admin-access-assign">
                    <select value={selectedAccessOrgId} onChange={(event) => setSelectedAccessOrgId(event.target.value)}>
                      <option value="">Select organization to assign</option>
                      {orgs.map((org) => (
                        <option key={org.id} value={org.id}>
                          {org.name}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={handleAssignOrgAccess}>
                      Assign Access
                    </button>
                  </div>

                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Organization</th>
                          <th>Code</th>
                          <th>Access</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedUserAccess.organizations || []).map((org) => (
                          <tr key={org.id}>
                            <td>{org.name}</td>
                            <td>{org.company_code || '-'}</td>
                            <td>{org.has_access ? (org.is_primary ? 'Primary' : 'Assigned') : 'No Access'}</td>
                            <td>
                              {org.is_primary ? (
                                <span className="admin-access-primary">Primary</span>
                              ) : org.has_access ? (
                                <button
                                  type="button"
                                  className="danger"
                                  onClick={() => handleRemoveOrgAccess(selectedUserAccess.user.id, org.id)}
                                >
                                  Remove
                                </button>
                              ) : (
                                <span>-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {tab === 'users' && (
        <section className="admin-card">
          <div className="admin-card-head">
            <h2>Users {selectedOrgName ? `| ${selectedOrgName}` : '| All organizations'}</h2>
            {orgs.length > 1 && (
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
            )}
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

      {!isCompanyAdmin && tab === 'orgs' && isOrgAdmin && (
        <section className="admin-card">
          <div className="admin-card-head">
            <h2>Organization Summary</h2>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Organization</th>
                  <th>Code</th>
                  <th>Users</th>
                  <th>Teams</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((org) => (
                  <tr key={org.id}>
                    <td>{org.name}</td>
                    <td>{org.company_code || '-'}</td>
                    <td>{org.user_count || 0}</td>
                    <td>{org.team_count || 0}</td>
                    <td>
                      <button type="button" className="danger" onClick={() => handleDeleteOrg(org.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};

const parseStoredUser = (raw) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
};

const getTokenRole = (token) => {
  if (!token) return '';
  try {
    const payload = JSON.parse(atob(String(token).split('.')[1] || ''));
    return payload?.role || '';
  } catch (error) {
    return '';
  }
};

const initials = (name) => {
  if (!name) return 'US';
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
