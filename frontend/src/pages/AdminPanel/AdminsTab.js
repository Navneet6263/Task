import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { notify } from '../../services/feedback';
import { Button, Card, CardHeader, EmptyRow, Input, Select, Table, TableWrap, Td, Th } from '../../ui';
import { Person, dateLabel, errorOf } from './adminShared';

const EMPTY = { name: '', email: '', password: '', mobile: '', employee_id: '', org_id: '' };

// Company admins create organization admin accounts and see who already has one.
export default function AdminsTab({ orgs, onChanged }) {
  const [form, setForm] = useState({ ...EMPTY, org_id: String(orgs[0]?.id || '') });
  const [admins, setAdmins] = useState([]);
  const [busy, setBusy] = useState(false);
  const load = () => api.get('/company-admin/users').then((r) => setAdmins((Array.isArray(r.data) ? r.data : []).filter((u) => u.role === 'admin'))).catch(() => {});
  useEffect(() => { load(); }, []);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const create = async (event) => {
    event.preventDefault();
    if (!form.org_id) { notify('Choose an organization first.'); return; }
    setBusy(true);
    try {
      await api.post('/company-admin/admins', { ...form, org_id: Number(form.org_id) });
      notify(`Admin account created for ${form.name}. Share the email and password with them.`, 'success');
      setForm({ ...EMPTY, org_id: form.org_id }); load(); onChanged();
    } catch (err) { notify(errorOf(err, 'Could not create the admin.')); }
    finally { setBusy(false); }
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
      <Card className="h-fit">
        <CardHeader title="Create an organization admin" />
        <form onSubmit={create} className="flex flex-col gap-3 p-4">
          <label className="flex flex-col gap-1"><span className="text-xs font-medium text-muted">Organization</span>
            <Select value={form.org_id} onChange={set('org_id')} required>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></label>
          <label className="flex flex-col gap-1"><span className="text-xs font-medium text-muted">Full name</span><Input value={form.name} onChange={set('name')} required /></label>
          <label className="flex flex-col gap-1"><span className="text-xs font-medium text-muted">Work email</span><Input type="email" value={form.email} onChange={set('email')} required /></label>
          <label className="flex flex-col gap-1"><span className="text-xs font-medium text-muted">Temporary password</span><Input type="password" autoComplete="new-password" value={form.password} onChange={set('password')} required /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1"><span className="text-xs font-medium text-muted">Mobile</span><Input value={form.mobile} onChange={set('mobile')} placeholder="Optional" /></label>
            <label className="flex flex-col gap-1"><span className="text-xs font-medium text-muted">Employee ID</span><Input value={form.employee_id} onChange={set('employee_id')} placeholder="Optional" /></label>
          </div>
          <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Creating…' : 'Create admin'}</Button>
          <p className="text-xs text-muted">Admins can manage people, teams and settings inside their organization.</p>
        </form>
      </Card>
      <TableWrap>
        <Table>
          <thead><tr><Th>Admin</Th><Th>Organization</Th><Th>Joined</Th></tr></thead>
          <tbody>
            {admins.map((a) => <tr key={a.id} className="hover:bg-subtle"><Td className="align-middle"><Person name={a.name} email={a.email} id={a.id} /></Td><Td className="align-middle text-muted">{a.org_name || '—'}</Td><Td className="align-middle text-muted">{dateLabel(a.created_at)}</Td></tr>)}
            {!admins.length && <EmptyRow colSpan={3}>No organization admins yet.</EmptyRow>}
          </tbody>
        </Table>
      </TableWrap>
    </div>
  );
}
