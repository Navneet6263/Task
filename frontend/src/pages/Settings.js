import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../services/runtimeConfig';
import './Settings.css';

const TASK_OPTION_SECTIONS = [
  {
    key: 'task_type',
    title: 'Task Types',
    description: 'Shape the main task intent shown in the create-task page.',
  },
  {
    key: 'product',
    title: 'Products / Modules',
    description: 'Control which product or module choices the team can pick.',
  },
  {
    key: 'category',
    title: 'Categories',
    description: 'Create detailed categories and optionally link them to a task type.',
  },
];

const initialTaskOptionForm = {
  option_group: 'task_type',
  label: '',
  parent_value: '',
};

const api = () => {
  const headers = {
    Authorization: `Bearer ${localStorage.getItem('token') || localStorage.getItem('company_token')}`,
  };
  const activeOrgId = localStorage.getItem('active_org_id');
  if (activeOrgId) headers['x-org-id'] = activeOrgId;

  return axios.create({
    baseURL: API_BASE_URL,
    headers,
  });
};

const Settings = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  const isAdminUser = ['admin', 'manager', 'company_admin'].includes(user.role);

  const [profile, setProfile] = useState({
    name: '',
    email: '',
    mobile: '',
    employee_id: '',
    role: '',
    created_at: '',
  });
  const [passwords, setPasswords] = useState({ current: '', newPass: '', confirm: '' });
  const [myTeams, setMyTeams] = useState([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [taskFormOptions, setTaskFormOptions] = useState({ task_types: [], products: [], categories: [] });
  const [taskOptionForm, setTaskOptionForm] = useState(initialTaskOptionForm);
  const [editingTaskOption, setEditingTaskOption] = useState(null);
  const [taskOptionsLoading, setTaskOptionsLoading] = useState(false);

  const fetchProfile = async () => {
    try {
      const response = await api().get('/users/me');
      setProfile(response.data || {});
    } catch (error) {}
  };

  const fetchTeams = async () => {
    try {
      const response = await api().get('/teams');
      setMyTeams(Array.isArray(response.data) ? response.data : []);
    } catch (error) {}
  };

  const fetchTaskFormOptions = useCallback(async () => {
    if (!isAdminUser) return;
    setTaskOptionsLoading(true);

    try {
      const response = await api().get('/tasks/form-options');
      setTaskFormOptions({
        task_types: Array.isArray(response.data?.task_types) ? response.data.task_types : [],
        products: Array.isArray(response.data?.products) ? response.data.products : [],
        categories: Array.isArray(response.data?.categories) ? response.data.categories : [],
      });
    } catch (error) {
      setErr(error.response?.data?.error || 'Failed to load task form options');
    } finally {
      setTaskOptionsLoading(false);
    }
  }, [isAdminUser]);

  useEffect(() => {
    fetchProfile();
    fetchTeams();
    fetchTaskFormOptions();
  }, [fetchTaskFormOptions]);

  const handleSaveProfile = async (event) => {
    event.preventDefault();
    setMsg('');
    setErr('');

    try {
      await api().put('/users/me', { name: profile.name, mobile: profile.mobile });
      const nextRole = user.role === 'company_admin' ? 'company_admin' : (profile.role || user.role);
      localStorage.setItem(
        'user',
        JSON.stringify({
          name: profile.name,
          email: profile.email,
          role: nextRole,
        })
      );
      if (nextRole === 'company_admin') {
        localStorage.setItem(
          'company_user',
          JSON.stringify({
            ...(JSON.parse(localStorage.getItem('company_user') || '{}')),
            name: profile.name,
            email: profile.email,
            role: 'company_admin',
          })
        );
      }
      setMsg('Profile updated successfully.');
    } catch (error) {
      setErr(error.response?.data?.error || 'Failed to update profile');
    }
  };

  const handlePasswordUpdate = async (event) => {
    event.preventDefault();
    setMsg('');
    setErr('');

    if (passwords.newPass !== passwords.confirm) {
      setErr('New password and confirm password do not match.');
      return;
    }

    try {
      await api().put('/users/me/password', { current: passwords.current, newPass: passwords.newPass });
      setPasswords({ current: '', newPass: '', confirm: '' });
      setMsg('Password changed successfully.');
    } catch (error) {
      setErr(error.response?.data?.error || 'Failed to change password');
    }
  };

  const handleTaskOptionSubmit = async (event) => {
    event.preventDefault();
    setMsg('');
    setErr('');

    const payload = {
      option_group: taskOptionForm.option_group,
      label: taskOptionForm.label.trim(),
      parent_value: taskOptionForm.option_group === 'category' ? taskOptionForm.parent_value : '',
    };

    if (!payload.label) {
      setErr('Option label is required.');
      return;
    }

    try {
      if (editingTaskOption?.id) {
        await api().put(`/tasks/form-options/${editingTaskOption.id}`, payload);
        setMsg('Task form option updated.');
      } else {
        await api().post('/tasks/form-options', payload);
        setMsg('Task form option added.');
      }

      setTaskOptionForm(initialTaskOptionForm);
      setEditingTaskOption(null);
      await fetchTaskFormOptions();
    } catch (error) {
      setErr(error.response?.data?.error || 'Failed to save task form option');
    }
  };

  const handleTaskOptionDelete = async (optionId) => {
    if (!window.confirm('Delete this option?')) return;
    setMsg('');
    setErr('');

    try {
      await api().delete(`/tasks/form-options/${optionId}`);
      if (editingTaskOption?.id === optionId) {
        setEditingTaskOption(null);
        setTaskOptionForm(initialTaskOptionForm);
      }
      setMsg('Task form option deleted.');
      await fetchTaskFormOptions();
    } catch (error) {
      setErr(error.response?.data?.error || 'Failed to delete task form option');
    }
  };

  const roleLabel = useMemo(() => {
    const raw = user.role === 'company_admin' ? 'company_admin' : (profile.role || user.role || 'member');
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [profile.role, user.role]);

  const groupedTaskOptions = useMemo(
    () => ({
      task_type: taskFormOptions.task_types || [],
      product: taskFormOptions.products || [],
      category: taskFormOptions.categories || [],
    }),
    [taskFormOptions]
  );

  const taskTypeOptions = groupedTaskOptions.task_type || [];

  return (
    <div className="settings-page">
      <header className="settings-head">
        <h1>Settings</h1>
        <p>Manage profile, security, and workspace level preferences.</p>
      </header>

      {msg && <div className="settings-toast success">{msg}</div>}
      {err && <div className="settings-toast error">{err}</div>}

      <section className="settings-grid">
        <div className="settings-col">
          <article className="settings-card">
            <div className="settings-profile-head">
              <div className="settings-avatar">{initials(profile.name || user.name)}</div>
              <div>
                <h2>{profile.name || 'User'}</h2>
                <span className="settings-role-pill">{roleLabel}</span>
              </div>
            </div>

            <form className="settings-form" onSubmit={handleSaveProfile}>
              <label>
                <span>Full Name</span>
                <input
                  value={profile.name || ''}
                  onChange={(event) => setProfile({ ...profile, name: event.target.value })}
                  required
                />
              </label>

              <label>
                <span>Email</span>
                <input value={profile.email || ''} disabled />
              </label>

              <label>
                <span>Mobile</span>
                <input
                  value={profile.mobile || ''}
                  onChange={(event) => setProfile({ ...profile, mobile: event.target.value })}
                  placeholder="Enter mobile number"
                />
              </label>

              <label>
                <span>Employee ID</span>
                <input value={profile.employee_id || ''} disabled />
              </label>

              <button type="submit" className="settings-primary-btn">
                Save Profile
              </button>
            </form>
          </article>

          <article className="settings-card">
            <h3>Security</h3>
            <p>Use a strong password and update it regularly.</p>

            <form className="settings-form" onSubmit={handlePasswordUpdate}>
              <label>
                <span>Current Password</span>
                <input
                  type="password"
                  value={passwords.current}
                  onChange={(event) => setPasswords({ ...passwords, current: event.target.value })}
                  required
                />
              </label>

              <label>
                <span>New Password</span>
                <input
                  type="password"
                  value={passwords.newPass}
                  onChange={(event) => setPasswords({ ...passwords, newPass: event.target.value })}
                  required
                />
              </label>

              <label>
                <span>Confirm Password</span>
                <input
                  type="password"
                  value={passwords.confirm}
                  onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })}
                  required
                />
              </label>

              <button type="submit" className="settings-primary-btn">
                Update Password
              </button>
            </form>
          </article>
        </div>

        <div className="settings-col">
          <article className="settings-card">
            <h3>Teams & Codes</h3>
            <p>Quickly access team identity and member join code.</p>

            <div className="settings-team-list">
              {myTeams.length === 0 && <p className="settings-empty">No teams found.</p>}

              {myTeams.map((team) => (
                <div key={team.id} className="settings-team-row">
                  <div>
                    <strong>{team.name}</strong>
                    <span>
                      {team.type || 'General'} | {team.member_count || 0} members
                    </span>
                  </div>

                  {team.team_code && <code>{team.team_code}</code>}
                </div>
              ))}
            </div>
          </article>

          {isAdminUser && (
            <article className="settings-card">
              <div className="settings-card-head">
                <div>
                  <h3>Task Form Setup</h3>
                  <p>Admins and managers can tune task type, module, and category choices.</p>
                </div>
                <span className="settings-role-pill">Org Level</span>
              </div>

              <form className="settings-form settings-task-option-form" onSubmit={handleTaskOptionSubmit}>
                <div className="settings-option-grid">
                  <label>
                    <span>Option Group</span>
                    <select
                      value={taskOptionForm.option_group}
                      onChange={(event) =>
                        setTaskOptionForm({
                          option_group: event.target.value,
                          label: taskOptionForm.label,
                          parent_value: event.target.value === 'category' ? taskOptionForm.parent_value : '',
                        })
                      }
                    >
                      <option value="task_type">Task Type</option>
                      <option value="product">Product / Module</option>
                      <option value="category">Category</option>
                    </select>
                  </label>

                  <label>
                    <span>Label</span>
                    <input
                      value={taskOptionForm.label}
                      onChange={(event) => setTaskOptionForm({ ...taskOptionForm, label: event.target.value })}
                      placeholder="Add option label"
                      required
                    />
                  </label>

                  {taskOptionForm.option_group === 'category' && (
                    <label>
                      <span>Linked Task Type</span>
                      <select
                        value={taskOptionForm.parent_value}
                        onChange={(event) => setTaskOptionForm({ ...taskOptionForm, parent_value: event.target.value })}
                      >
                        <option value="">Available for all task types</option>
                        {taskTypeOptions.map((option) => (
                          <option key={option.id || option.label} value={option.label}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>

                <div className="settings-action-row">
                  {editingTaskOption?.id && (
                    <button
                      type="button"
                      className="settings-secondary-btn"
                      onClick={() => {
                        setEditingTaskOption(null);
                        setTaskOptionForm(initialTaskOptionForm);
                      }}
                    >
                      Cancel Edit
                    </button>
                  )}

                  <button type="submit" className="settings-primary-btn">
                    {editingTaskOption?.id ? 'Update Option' : 'Add Option'}
                  </button>
                </div>
              </form>

              <div className="settings-option-stack">
                {TASK_OPTION_SECTIONS.map((section) => (
                  <div key={section.key} className="settings-option-group">
                    <div className="settings-option-head">
                      <div>
                        <h4>{section.title}</h4>
                        <p>{section.description}</p>
                      </div>
                      <strong>{groupedTaskOptions[section.key]?.length || 0}</strong>
                    </div>

                    {taskOptionsLoading && groupedTaskOptions[section.key]?.length === 0 && (
                      <p className="settings-empty">Loading options...</p>
                    )}

                    {!taskOptionsLoading && groupedTaskOptions[section.key]?.length === 0 && (
                      <p className="settings-empty">No options added yet.</p>
                    )}

                    {(groupedTaskOptions[section.key] || []).map((option) => (
                      <div key={option.id} className="settings-option-row">
                        <div>
                          <strong>{option.label}</strong>
                          <span>{option.parent_value ? `For ${option.parent_value}` : 'General option'}</span>
                        </div>

                        <div className="settings-option-actions">
                          <button
                            type="button"
                            className="settings-chip"
                            onClick={() => {
                              setEditingTaskOption(option);
                              setTaskOptionForm({
                                option_group: option.option_group,
                                label: option.label,
                                parent_value: option.parent_value || '',
                              });
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="settings-chip settings-chip-danger"
                            onClick={() => handleTaskOptionDelete(option.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </article>
          )}

          <article className="settings-card">
            <h3>Account Summary</h3>
            <div className="settings-info-list">
              <div>
                <span>Member Since</span>
                <b>{dateLabel(profile.created_at)}</b>
              </div>
              <div>
                <span>Role</span>
                <b>{roleLabel}</b>
              </div>
              <div>
                <span>Teams Joined</span>
                <b>{myTeams.length}</b>
              </div>
              <div>
                <span>Employee ID</span>
                <b>{profile.employee_id || '-'}</b>
              </div>
            </div>
          </article>

          {isAdminUser && (
            <article className="settings-card">
              <h3>Audit Access</h3>
              <p>Open logs quickly and review member level activity.</p>

              <button type="button" className="settings-primary-btn" onClick={() => navigate('/audit-logs')}>
                Open Audit Logs
              </button>

              <div className="settings-chip-wrap">
                {myTeams.map((team) => (
                  <button key={team.id} type="button" className="settings-chip" onClick={() => navigate('/audit-logs')}>
                    {team.name}
                  </button>
                ))}
              </div>
            </article>
          )}
        </div>
      </section>
    </div>
  );
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

export default Settings;
