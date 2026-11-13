import React, { useState } from 'react';
import api from '../../../services/api';
import { Banner, Button, Input, Modal } from '../../../ui';
import PasswordReveal from '../../SuperAdmin/companies/PasswordReveal';
import { errorOf } from '../adminShared';

const Field = ({ label, hint, children }) => (
  <label className="flex flex-col gap-1"><span className="text-xs font-medium text-muted">{label}</span>{children}{hint && <span className="text-xs text-muted">{hint}</span>}</label>
);
const defaultPrefix = (org) => String(org?.company_code || '').split('-')[1] || 'TASK';

// Edit an organization: its name and the letters in front of task numbers. The company code stays.
export function EditOrgModal({ org, endpoint = `/company-admin/organizations/${org.id}`, onClose, onDone }) {
  const [name, setName] = useState(org.name || '');
  const [prefix, setPrefix] = useState(org.task_prefix || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const shown = (prefix.trim() || defaultPrefix(org)).toUpperCase();
  const changed = name.trim() !== org.name || prefix.trim().toUpperCase() !== String(org.task_prefix || '');

  const save = async (event) => {
    event?.preventDefault();
    if (!name.trim() || !changed || busy) return;
    setBusy(true); setError('');
    try { await api.patch(endpoint, { name: name.trim(), task_prefix: prefix.trim() }); onDone?.(); onClose(); }
    catch (err) { setError(errorOf(err, 'Could not save the changes.')); }
    finally { setBusy(false); }
  };

  return (
    <Modal size="md" title="Edit workspace" subtitle={org.name} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!name.trim() || !changed || busy} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</Button></>}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <Field label="Workspace name *"><Input autoFocus maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Task code" hint={`Task numbers will look like ${shown}-142. Leave empty to use ${defaultPrefix(org).toUpperCase()}.`}>
          <Input maxLength={6} placeholder={defaultPrefix(org).toUpperCase()} value={prefix} className="uppercase" onChange={(e) => setPrefix(e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase())} />
        </Field>
        <div className="rounded-md bg-subtle px-3 py-2.5 text-sm">
          <span className="text-muted">Company code: </span><span className="font-semibold">{org.company_code || '—'}</span>
          <p className="mt-0.5 text-xs text-muted">This does not change, because people already use it to join.</p>
        </div>
        {error && <Banner tone="danger"><span role="alert">{error}</span></Banner>}
        <button type="submit" hidden aria-hidden="true" />
      </form>
    </Modal>
  );
}

// A new organization, and if wanted its first admin in the same step.
export function NewOrgModal({ onClose, onDone }) {
  const [name, setName] = useState('');
  const [withAdmin, setWithAdmin] = useState(true);
  const [admin, setAdmin] = useState({ name: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const ready = name.trim() && (!withAdmin || (admin.name.trim() && admin.email.trim()));

  const save = async (event) => {
    event?.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setError('');
    let org = null;
    try {
      org = (await api.post('/company-admin/organizations', { name: name.trim() })).data;
      if (!withAdmin) { onDone?.(); setDone({ org }); return; }
      const { data } = await api.post('/company-admin/admins', { name: admin.name.trim(), email: admin.email.trim(), org_id: org.id });
      onDone?.(); setDone({ org, admin: { name: admin.name.trim(), email: data.email, password: data.temporary_password } });
    } catch (err) {
      // The organization exists even if its admin could not be added: say so, and let them add the admin from its card.
      if (org) { onDone?.(); setDone({ org, adminError: errorOf(err, 'The admin could not be added.') }); }
      else setError(errorOf(err, 'Could not create the workspace.'));
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <Modal size="md" title="Workspace created" onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
        <div className="flex flex-col gap-3 text-sm">
          <p><span className="font-semibold">{done.org.name}</span> is ready. Its company code is <span className="font-semibold">{done.org.company_code}</span>.</p>
          {done.admin && <><p><span className="font-semibold">{done.admin.name}</span> is its admin.</p><PasswordReveal email={done.admin.email} password={done.admin.password} note="They will be asked to choose their own password the first time they sign in." /></>}
          {done.adminError && <Banner tone="warn">{done.adminError} Use “+ Add admin” on the workspace’s card to try again.</Banner>}
        </div>
      </Modal>
    );
  }

  return (
    <Modal size="md" title="New workspace" subtitle="Each workspace has its own people, teams, tasks and company code." onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!ready || busy} onClick={save}>{busy ? 'Creating…' : 'Create workspace'}</Button></>}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <Field label="Workspace name *"><Input autoFocus maxLength={120} placeholder="e.g. Acme India Pvt Ltd" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--c-accent))]" checked={withAdmin} onChange={(e) => setWithAdmin(e.target.checked)} />
          Add its admin now
        </label>
        {withAdmin && (
          <div className="grid grid-cols-1 gap-3 rounded-lg border border-line p-3 sm:grid-cols-2">
            <Field label="Admin’s full name *"><Input maxLength={120} value={admin.name} onChange={(e) => setAdmin({ ...admin, name: e.target.value })} /></Field>
            <Field label="Admin’s work email *"><Input type="email" maxLength={255} value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} /></Field>
            <p className="text-xs text-muted sm:col-span-2">A password is made for them and shown once, ready to copy and send.</p>
          </div>
        )}
        {error && <Banner tone="danger"><span role="alert">{error}</span></Banner>}
        <button type="submit" hidden aria-hidden="true" />
      </form>
    </Modal>
  );
}

// A new password for anyone in the list: made for them, or typed by the admin. Shown once to copy and send.
//   endpoint: where to post (company admin or organization admin route)
export function ResetPasswordModal({ person, endpoint = `/company-admin/users/${person.id}/reset-password`, onClose }) {
  const [how, setHow] = useState('made');
  const [typed, setTyped] = useState('');
  const [mustChange, setMustChange] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const ready = how === 'made' || typed.length >= 8;
  const reset = async (event) => {
    event?.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setError('');
    try { setDone((await api.post(endpoint, { ...(how === 'typed' ? { password: typed } : {}), must_change: mustChange })).data); }
    catch (err) { setError(errorOf(err, 'Could not change the password.')); }
    finally { setBusy(false); }
  };
  return (
    <Modal size="md" title={done ? 'Password changed' : `Change ${person.name}’s password`} subtitle={done ? '' : person.email} onClose={onClose}
      footer={done ? <Button variant="primary" onClick={onClose}>Done</Button> : <><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!ready || busy} onClick={reset}>{busy ? 'Saving…' : 'Change password'}</Button></>}>
      {done
        ? <PasswordReveal email={done.email} password={done.temporary_password} note={done.must_change_password ? 'Their old password stops working now. They will choose their own at their next sign-in.' : 'Their old password stops working now. They can sign in with this one.'} />
        : (
          <form onSubmit={reset} className="flex flex-col gap-4 text-sm">
            <p className="text-muted">Their current password stops working as soon as you save.</p>
            <div className="flex flex-col gap-2">
              {[['made', 'Make one for me', 'A strong password is made and shown once, ready to copy and send.'], ['typed', 'I’ll type it', 'Use this when you have agreed a password with them.']].map(([value, label, text]) => (
                <label key={value} className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${how === value ? 'border-accent bg-accent-soft' : 'border-line'}`}>
                  <input type="radio" name="password-how" className="mt-0.5 h-4 w-4 accent-[rgb(var(--c-accent))]" checked={how === value} onChange={() => setHow(value)} />
                  <span><span className="block font-semibold">{label}</span><span className="text-muted">{text}</span></span>
                </label>
              ))}
            </div>
            {how === 'typed' && (
              <label className="flex flex-col gap-1"><span className="text-xs font-medium text-muted">New password</span>
                <Input type="text" autoComplete="new-password" autoFocus maxLength={128} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="At least 8 characters" />
                {typed && typed.length < 8 && <span className="text-xs text-warn">{8 - typed.length} more characters needed.</span>}
              </label>
            )}
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--c-accent))]" checked={mustChange} onChange={(e) => setMustChange(e.target.checked)} />
              Ask them to choose their own password at next sign-in
            </label>
            {error && <Banner tone="danger"><span role="alert">{error}</span></Banner>}
            <button type="submit" hidden aria-hidden="true" />
          </form>
        )}
    </Modal>
  );
}

// Stop someone being an admin: they stay in the organization as a manager or a member.
export function RemoveAdminModal({ person, onClose, onDone }) {
  const [role, setRole] = useState('manager');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError('');
    try { await api.put(`/company-admin/users/${person.id}/role`, { role }); onDone?.(); onClose(); }
    catch (err) { setError(errorOf(err, 'Could not change the role.')); }
    finally { setBusy(false); }
  };
  return (
    <Modal size="sm" title={`Remove ${person.name} as admin?`} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Remove as admin'}</Button></>}>
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-muted">They keep their account and their work. Choose what they become:</p>
        {[['manager', 'Manager', 'Runs their teams and sees their team’s work.'], ['person', 'Member', 'Sees and works on their own tasks only.']].map(([value, label, text]) => (
          <label key={value} className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${role === value ? 'border-accent bg-accent-soft' : 'border-line'}`}>
            <input type="radio" name="new-role" className="mt-0.5 h-4 w-4 accent-[rgb(var(--c-accent))]" checked={role === value} onChange={() => setRole(value)} />
            <span><span className="block font-semibold">{label}</span><span className="text-muted">{text}</span></span>
          </label>
        ))}
        {error && <Banner tone="danger"><span role="alert">{error}</span></Banner>}
      </div>
    </Modal>
  );
}
