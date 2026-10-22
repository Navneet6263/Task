import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { notify } from '../../services/feedback';
import { Button, Card, Input } from '../../ui';
import Section, { SettingRow } from './Section';

const initials = (name) => {
  if (!name) return 'US';
  const parts = String(name).split(' ').filter(Boolean);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};
const roleText = (role) => ({ company_admin: 'Company admin', admin: 'Admin', manager: 'Manager', person: 'Member' }[role] || 'Member');

// Keep everything already stored about the user; only refresh the editable fields.
function rememberName(name) {
  ['user', 'company_user'].forEach((key) => {
    try {
      const current = JSON.parse(localStorage.getItem(key) || 'null');
      if (current) localStorage.setItem(key, JSON.stringify({ ...current, name }));
    } catch { /* ignore unreadable storage */ }
  });
}

export default function ProfileSection({ user, teamCount }) {
  const [profile, setProfile] = useState({ name: '', email: '', mobile: '', employee_id: '', role: '', created_at: '' });
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get('/users/me').then((r) => { setProfile((p) => ({ ...p, ...r.data })); setLoaded(true); }).catch(() => notify('Could not load your profile.'));
  }, []);

  const save = async (event) => {
    event.preventDefault();
    if (!profile.name.trim()) { notify('Your name cannot be empty.'); return; }
    setSaving(true);
    try {
      await api.put('/users/me', { name: profile.name.trim(), mobile: profile.mobile });
      rememberName(profile.name.trim());
      notify('Profile saved.', 'success');
    } catch (err) { notify(err.response?.data?.error || 'Could not save your profile.'); }
    finally { setSaving(false); }
  };

  const role = user.role === 'company_admin' ? 'company_admin' : profile.role || user.role;
  return (
    <Section title="Profile" description="Your name and contact details as your team sees them. Email and employee ID are managed by your admin.">
      <Card className="flex flex-wrap items-center gap-4 p-4">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-accent text-lg font-bold text-accent-fg">{initials(profile.name || user.name)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold">{profile.name || user.name || 'User'}</p>
          <p className="truncate text-sm text-muted">{profile.email}</p>
        </div>
        <dl className="grid grid-cols-3 gap-6 text-sm">
          <div><dt className="text-xs text-muted">Role</dt><dd className="font-semibold">{roleText(role)}</dd></div>
          <div><dt className="text-xs text-muted">Teams</dt><dd className="font-mono font-semibold">{teamCount}</dd></div>
          <div><dt className="text-xs text-muted">Member since</dt><dd className="font-semibold">{profile.created_at ? new Date(profile.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—'}</dd></div>
        </dl>
      </Card>
      <Card className="px-4">
        <form onSubmit={save}>
          <SettingRow label="Full name" help="Shown on tasks, comments and reports.">
            <Input aria-label="Full name" value={profile.name || ''} onChange={(e) => setProfile({ ...profile, name: e.target.value })} required disabled={!loaded} />
          </SettingRow>
          <SettingRow label="Mobile number" help="Optional. Used by your admin to reach you.">
            <Input aria-label="Mobile number" value={profile.mobile || ''} placeholder="e.g. +91 98765 43210" onChange={(e) => setProfile({ ...profile, mobile: e.target.value })} disabled={!loaded} />
          </SettingRow>
          <SettingRow label="Email" help="Your sign-in address. Ask an admin to change it."><Input aria-label="Email" value={profile.email || ''} disabled /></SettingRow>
          <SettingRow label="Employee ID" help="Set by your company."><Input aria-label="Employee ID" value={profile.employee_id || '—'} disabled /></SettingRow>
          <div className="flex justify-end py-4"><Button type="submit" variant="primary" disabled={saving || !loaded}>{saving ? 'Saving…' : 'Save profile'}</Button></div>
        </form>
      </Card>
    </Section>
  );
}
