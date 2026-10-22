import React, { useState } from 'react';
import api from '../../services/api';
import { notify } from '../../services/feedback';
import { Button, Card, FieldError, Input, Meter } from '../../ui';
import Section, { SettingRow } from './Section';

// Simple strength hint: length plus character variety. Not a policy, just guidance.
export function passwordStrength(value) {
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  return [
    { label: 'Too short', tone: 'danger' }, { label: 'Weak', tone: 'danger' }, { label: 'Fair', tone: 'warn' },
    { label: 'Good', tone: 'accent' }, { label: 'Strong', tone: 'accent' }, { label: 'Very strong', tone: 'accent' },
  ][value ? Math.max(score, value.length < 8 ? 0 : 1) : 0];
}

export default function SecuritySection() {
  const [form, setForm] = useState({ current: '', newPass: '', confirm: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const strength = passwordStrength(form.newPass);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (form.newPass.length < 8) { setError('Use at least 8 characters.'); return; }
    if (form.newPass !== form.confirm) { setError('The two new passwords do not match.'); return; }
    setSaving(true);
    try {
      await api.put('/users/me/password', { current: form.current, newPass: form.newPass });
      setForm({ current: '', newPass: '', confirm: '' });
      notify('Password changed.', 'success');
    } catch (err) { setError(err.response?.data?.error || 'Could not change the password.'); }
    finally { setSaving(false); }
  };

  return (
    <Section title="Password & security" description="Change your password. Use something long that you do not use on other sites.">
      <Card className="px-4">
        <form onSubmit={submit}>
          <SettingRow label="Current password" help="To confirm it is you.">
            <Input type="password" autoComplete="current-password" aria-label="Current password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} required />
          </SettingRow>
          <SettingRow label="New password" help="At least 8 characters. Mixing upper and lower case, numbers and symbols makes it stronger.">
            <Input type="password" autoComplete="new-password" aria-label="New password" value={form.newPass} onChange={(e) => setForm({ ...form, newPass: e.target.value })} required />
            {form.newPass && (
              <div className="mt-2 flex items-center gap-3">
                <div className="flex-1"><Meter value={['Too short', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'].indexOf(strength.label)} max={5} tone={strength.tone} label="Password strength" /></div>
                <span className="w-20 text-right text-xs font-semibold text-muted">{strength.label}</span>
              </div>
            )}
          </SettingRow>
          <SettingRow label="Confirm new password">
            <Input type="password" autoComplete="new-password" aria-label="Confirm new password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required />
            <FieldError text={error} />
          </SettingRow>
          <div className="flex justify-end py-4"><Button type="submit" variant="primary" disabled={saving}>{saving ? 'Updating…' : 'Update password'}</Button></div>
        </form>
      </Card>
    </Section>
  );
}
