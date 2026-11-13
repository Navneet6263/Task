import React, { useMemo, useState } from 'react';
import api from '../../../services/api';
import { Banner, Button, Input, Modal, SearchSelect, Segmented, Select } from '../../../ui';
import PasswordReveal from '../../SuperAdmin/companies/PasswordReveal';
import { ROLE_LABEL, errorOf } from '../adminShared';

const FIRST_SIGN_IN = 'They will be asked to choose their own password the first time they sign in.';
const blank = { name: '', email: '', mobile: '', employee_id: '' };

// Make someone an admin of an organization, the easy way: pick a person who is already there,
// or add a new person. A new person's password is made for them and shown once.
//   orgs: the company's organizations   orgId: fixed organization (from its card), or null to choose
//   people: everyone in the company's organizations (for "Someone already here")
export default function AddAdminModal({ orgs, orgId: fixedOrg = null, people = [], onClose, onDone }) {
  const [orgId, setOrgId] = useState(String(fixedOrg || orgs[0]?.id || ''));
  const candidates = useMemo(() => people.filter((p) => String(p.org_id) === orgId && p.role !== 'admin'), [people, orgId]);
  const [mode, setMode] = useState(candidates.length ? 'existing' : 'new');
  const [personId, setPersonId] = useState('');
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null); // { name, email, password? }
  const org = orgs.find((o) => String(o.id) === orgId);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const person = candidates.find((p) => String(p.id) === personId);
  const ready = orgId && (mode === 'existing' ? Boolean(person) : form.name.trim() && form.email.trim());

  const save = async (event) => {
    event?.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setError('');
    try {
      if (mode === 'existing') {
        await api.put(`/company-admin/users/${person.id}/role`, { role: 'admin' });
        setDone({ name: person.name, email: person.email });
      } else {
        const { data } = await api.post('/company-admin/admins', { ...form, name: form.name.trim(), email: form.email.trim(), org_id: Number(orgId) });
        setDone({ name: form.name.trim(), email: data.email, password: data.temporary_password });
      }
      onDone?.();
    } catch (err) { setError(errorOf(err, 'Could not add the admin.')); }
    finally { setBusy(false); }
  };

  if (done) {
    return (
      <Modal size="md" title="Admin added" onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
        <div className="flex flex-col gap-3">
          <p className="text-sm"><span className="font-semibold">{done.name}</span> is now an admin of <span className="font-semibold">{org?.name}</span>. They can manage its people, teams and settings.</p>
          {done.password
            ? <PasswordReveal email={done.email} password={done.password} note={FIRST_SIGN_IN} />
            : <p className="text-sm text-muted">They sign in with their usual email and password. Nothing else to share.</p>}
        </div>
      </Modal>
    );
  }

  return (
    <Modal size="md" title="Add an admin" subtitle={org && fixedOrg ? `For ${org.name}` : 'Admins manage people, teams and settings in their organization.'} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!ready || busy} onClick={save}>{busy ? 'Adding…' : 'Make admin'}</Button></>}>
      <form onSubmit={save} className="flex flex-col gap-4">
        {!fixedOrg && orgs.length > 1 && (
          <label className="flex flex-col gap-1"><span className="text-xs font-medium text-muted">Organization</span>
            <Select aria-label="Organization" value={orgId} onChange={(e) => { setOrgId(e.target.value); setPersonId(''); }}>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select></label>
        )}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Who should be the admin?</span>
          <Segmented label="Who" value={mode} onChange={(m) => { setMode(m); setError(''); }} options={[['existing', 'Someone already here'], ['new', 'A new person']]} />
        </div>

        {mode === 'existing' ? (
          candidates.length ? (
            <label className="flex flex-col gap-1"><span className="text-xs font-medium text-muted">Person</span>
              <SearchSelect aria-label="Person" value={personId} onChange={setPersonId} placeholder={`Search ${candidates.length} ${candidates.length === 1 ? 'person' : 'people'} by name or email…`}
                emptyText="Nobody with that name." options={candidates.map((p) => ({ value: String(p.id), label: p.name, hint: `${ROLE_LABEL[p.role] || 'Member'} · ${p.email}` }))} />
              <span className="text-xs text-muted">They keep their own sign-in. Only their role changes to Admin.</span>
            </label>
          ) : <Banner tone="info">Nobody else is in {org?.name || 'this organization'} yet. Choose “A new person”.</Banner>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1"><span className="text-xs font-medium text-muted">Full name *</span><Input autoFocus maxLength={120} value={form.name} onChange={set('name')} /></label>
              <label className="flex flex-col gap-1"><span className="text-xs font-medium text-muted">Work email *</span><Input type="email" maxLength={255} value={form.email} onChange={set('email')} /></label>
              <label className="flex flex-col gap-1"><span className="text-xs font-medium text-muted">Mobile</span><Input value={form.mobile} onChange={set('mobile')} placeholder="Optional" /></label>
              <label className="flex flex-col gap-1"><span className="text-xs font-medium text-muted">Employee ID</span><Input value={form.employee_id} onChange={set('employee_id')} placeholder="Optional" /></label>
            </div>
            <p className="rounded-md bg-subtle px-3 py-2 text-sm text-muted">No need to think of a password. One is made for them and shown once on the next screen, ready to copy and send. {FIRST_SIGN_IN}</p>
          </>
        )}
        {error && <Banner tone="danger"><span role="alert">{error}</span></Banner>}
        <button type="submit" hidden aria-hidden="true" />
      </form>
    </Modal>
  );
}
