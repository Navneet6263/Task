import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Settings.css';

const api = () =>
  axios.create({
    baseURL: 'http://localhost:5000/api',
    headers: { Authorization: `Bearer ${localStorage.getItem('token') || localStorage.getItem('company_token')}` },
  });

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

  useEffect(() => {
    fetchProfile();
    fetchTeams();
  }, []);

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

  const roleLabel = useMemo(() => {
    const raw = user.role === 'company_admin' ? 'company_admin' : (profile.role || user.role || 'member');
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [profile.role, user.role]);

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
