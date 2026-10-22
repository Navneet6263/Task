import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { notify } from '../../services/feedback';
import { Button, Card, Chip, EmptyState, Input, Select } from '../../ui';
import { Person, ROLE_LABEL, errorOf } from './adminShared';

// Give a manager or admin access to more than one organization.
export default function AccessTab({ orgs }) {
  const [q, setQ] = useState('');
  const [people, setPeople] = useState([]);
  const [selected, setSelected] = useState(null);
  const [access, setAccess] = useState(null);
  const [orgId, setOrgId] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      const request = q.trim() ? api.get('/company-admin/users/search', { params: { q: q.trim() } }) : api.get('/company-admin/users');
      request.then((r) => setPeople((Array.isArray(r.data) ? r.data : []).filter((u) => q.trim() || ['admin', 'manager'].includes(u.role)).slice(0, 30))).catch(() => setPeople([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  const load = async (person) => {
    setSelected(person);
    try { setAccess((await api.get(`/company-admin/users/${person.id}/org-access`)).data); }
    catch (err) { notify(errorOf(err, 'Could not load access.')); }
  };
  const grant = async () => {
    if (!orgId) return;
    try { await api.post('/company-admin/org-access', { user_id: selected.id, org_id: Number(orgId) }); notify('Access granted.', 'success'); setOrgId(''); load(selected); }
    catch (err) { notify(errorOf(err, 'Could not grant access.')); }
  };
  const revoke = async (org) => {
    try { await api.delete(`/company-admin/org-access/${selected.id}/${org.id}`); notify(`Access to ${org.name} removed.`, 'success'); load(selected); }
    catch (err) { notify(errorOf(err, 'Could not remove access.')); }
  };
  const missing = (access?.organizations || []).filter((o) => !o.has_access);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="flex h-fit flex-col gap-2 p-3">
        <Input aria-label="Search people" placeholder="Search managers and admins" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
          {people.map((p) => (
            <li key={p.id}>
              <button type="button" aria-pressed={selected?.id === p.id} onClick={() => load(p)} className={`w-full rounded-md px-2 py-2 text-left ${selected?.id === p.id ? 'bg-accent-soft' : 'hover:bg-subtle'}`}>
                <Person name={p.name} email={`${ROLE_LABEL[p.role] || p.role} · ${p.org_name || ''}`} id={p.id} />
              </button>
            </li>
          ))}
          {!people.length && <li className="px-2 py-6 text-center text-sm text-muted">No one found.</li>}
        </ul>
      </Card>
      {!selected || !access ? (
        <EmptyState title="Pick a person">Choose a manager or admin on the left to let them switch between more organizations.</EmptyState>
      ) : (
        <Card className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Person name={access.user?.name} email={access.user?.email} id={access.user?.id} />
            <div className="flex gap-2">
              <Select aria-label="Organization to grant" className="!w-auto" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
                <option value="">Add an organization…</option>{missing.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
              <Button variant="primary" disabled={!orgId} onClick={grant}>Grant access</Button>
            </div>
          </div>
          <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
            {(access.organizations || orgs).filter((o) => o.has_access).map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                <span><span className="font-medium">{o.name}</span> <span className="font-mono text-xs text-muted">{o.company_code}</span></span>
                {o.is_primary ? <Chip tone="ok">Home organization</Chip> : <Button size="sm" variant="danger" onClick={() => revoke(o)}>Remove</Button>}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">People with access can switch organization from the top bar. Their home organization cannot be removed here.</p>
        </Card>
      )}
    </div>
  );
}
